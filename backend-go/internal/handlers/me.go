package handlers

import (
	"net/http"

	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
)

// Me mirrors GET/DELETE /api/auth/me. GET always answers 200 with
// {"user": null} when unauthenticated (parity with the Next.js route).
func Me(store db.Store, cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			u, _ := middleware.SessionUser(r, store, config.SessionCookieName)
			if u == nil {
				middleware.WriteJSON(w, http.StatusOK, map[string]any{"user": nil})
				return
			}
			middleware.WriteJSON(w, http.StatusOK, map[string]any{
				"user": map[string]any{
					"id": u.ID, "email": u.Email, "role": u.Role, "createdAt": u.CreatedAt,
				},
			})
		case http.MethodDelete:
			if !middleware.SameOrigin(r, cfg.FrontendOrigin) {
				middleware.WriteError(w, http.StatusForbidden, "Invalid origin")
				return
			}
			if c, err := r.Cookie(config.SessionCookieName); err == nil && c.Value != "" {
				_ = store.DeleteSession(r.Context(), tokenHash(c.Value))
			}
			http.SetCookie(w, cfg.SessionCookie("", expiredTime()))
			middleware.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
		default:
			middleware.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
	})
}
