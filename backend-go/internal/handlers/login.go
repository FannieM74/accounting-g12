package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/auth"
	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
)

// Login mirrors POST /api/auth/login in the Next.js app.
func Login(store db.Store, cfg config.Config, rl *auth.RateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.DatabaseURL == "" {
			middleware.WriteError(w, http.StatusServiceUnavailable, "Database not configured")
			return
		}
		if !middleware.SameOrigin(r, cfg.FrontendOrigin) {
			middleware.WriteError(w, http.StatusForbidden, "Invalid origin")
			return
		}
		ip := middleware.ClientIP(r)
		if !rl.Allow("login:"+ip, 10, time.Minute) {
			middleware.WriteError(w, http.StatusTooManyRequests, "Too many attempts. Try again in a minute.")
			return
		}

		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
			middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
			return
		}
		email := auth.NormalizeEmail(body.Email)
		password := body.Password
		if email == "" || password == "" {
			middleware.WriteError(w, http.StatusBadRequest, "Email and password are required.")
			return
		}

		if err := store.EnsureSchema(r.Context()); err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "Could not sign in. Please try again.")
			return
		}
		user, err := store.UserByEmail(r.Context(), email)
		if err == db.ErrNotFound {
			auth.BurnPassword() // timing parity for missing user
			middleware.WriteError(w, http.StatusUnauthorized, "Invalid email or password.")
			return
		} else if err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "Could not sign in. Please try again.")
			return
		}
		if !auth.VerifyPassword(user.PasswordHash, password) {
			middleware.WriteError(w, http.StatusUnauthorized, "Invalid email or password.")
			return
		}
		setSessionCookie(w, r, cfg, store, user.ID)
		middleware.WriteJSON(w, http.StatusOK, map[string]any{
			"ok":   true,
			"user": map[string]string{"id": user.ID, "email": user.Email, "role": user.Role},
		})
	}
}
