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

// Signup mirrors POST /api/auth/signup in the Next.js app.
func Signup(store db.Store, cfg config.Config, rl *auth.RateLimiter) http.HandlerFunc {
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
		if !rl.Allow("signup:"+ip, 5, time.Minute) {
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

		if !auth.IsValidEmail(email) {
			middleware.WriteError(w, http.StatusBadRequest, "Enter a valid email address.")
			return
		}
		if issue := auth.PasswordIssue(password); issue != "" {
			middleware.WriteError(w, http.StatusBadRequest, issue)
			return
		}

		if err := store.EnsureSchema(r.Context()); err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "Could not create the account. Please try again.")
			return
		}
		if _, err := store.UserByEmail(r.Context(), email); err == nil {
			middleware.WriteError(w, http.StatusConflict, "Email already registered.")
			return
		} else if err != db.ErrNotFound {
			middleware.WriteError(w, http.StatusInternalServerError, "Could not create the account. Please try again.")
			return
		}

		hash, err := auth.HashPassword(password)
		if err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "Could not create the account. Please try again.")
			return
		}
		id, err := auth.NewUserID()
		if err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "Could not create the account. Please try again.")
			return
		}
		role := "user"
		count, err := store.CountUsers(r.Context())
		if err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "Could not create the account. Please try again.")
			return
		}
		if count == 0 && cfg.AdminEmail == "" {
			role = "admin"
		} else if cfg.AdminEmail != "" && cfg.AdminEmail == email {
			role = "admin"
		}

		user := &db.User{ID: id, Email: email, PasswordHash: hash, Role: role, CreatedAt: time.Now().UTC()}
		if err := store.CreateUser(r.Context(), user); err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "Could not create the account. Please try again.")
			return
		}
		setSessionCookie(w, r, cfg, store, user.ID)
		middleware.WriteJSON(w, http.StatusOK, map[string]any{
			"ok":   true,
			"user": map[string]string{"id": user.ID, "email": user.Email, "role": user.Role},
		})
	}
}
