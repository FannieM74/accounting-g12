package middleware

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/auth"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
)

type ctxKey int

const userKey ctxKey = iota

// UserFrom returns the authenticated user stored by RequireUser/RequireAdmin.
func UserFrom(ctx context.Context) (*db.User, bool) {
	u, ok := ctx.Value(userKey).(*db.User)
	return u, ok
}

// WriteJSON serializes v as JSON.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteError writes {"error": msg} with the given status.
func WriteError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, map[string]string{"error": msg})
}

// SameOrigin checks Origin vs Host for cookie-mutating requests (CSRF
// hardening, parity with the Node build: origin host must end with host).
// allowedOrigin (e.g. the frontend's domain) is also accepted - required
// when the API is proxied behind the frontend's own domain on Vercel.
// Vercel project/deployment aliases (*.vercel.app) are accepted too: they
// rotate per deployment so no allowlist can track them, and CSRF safety is
// unaffected (the SameSite=Lax session cookie is never sent cross-site).
func SameOrigin(r *http.Request, allowedOrigin string) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	o := strings.TrimPrefix(strings.TrimPrefix(strings.ToLower(origin), "https://"), "http://")
	o = strings.TrimSuffix(o, "/")
	h := strings.ToLower(r.Host)
	// parity with the Node build: "https://host[:port]".endsWith("host[:port]")
	if h != "" && strings.HasSuffix(o, h) {
		return true
	}
	if allowedOrigin != "" && strings.HasSuffix(o, strings.ToLower(allowedOrigin)) {
		return true
	}
	// Vercel-hosted page talking to Vercel-hosted API: trust *.vercel.app.
	if strings.HasSuffix(o, ".vercel.app") && strings.HasSuffix(h, ".vercel.app") {
		return true
	}
	return false
}

// ClientIP mirrors x-forwarded-for handling in the Node build.
func ClientIP(r *http.Request) string {
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// SessionUser resolves the session cookie to a user (or nil) and also
// returns the session row (for expiry inspection).
func SessionUser(r *http.Request, store db.Store, cookieName string) (*db.User, *db.Session) {
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return nil, nil
	}
	hash := auth.HashToken(c.Value)
	u, sess, err := store.SessionUserByTokenHash(r.Context(), hash)
	if err != nil {
		return nil, nil
	}
	if sess.ExpiresAt.Before(time.Now()) {
		_ = store.DeleteSession(r.Context(), hash)
		return nil, nil
	}
	return u, sess
}

// RequireUser authenticates via session cookie and stores the user in ctx.
func RequireUser(store db.Store, cookieName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, _ := SessionUser(r, store, cookieName)
			if u == nil {
				WriteError(w, http.StatusUnauthorized, "Not signed in")
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey, u)))
		})
	}
}

// RequireAdmin extends RequireUser with the role check (403 for signed-in
// non-admins, 401 otherwise - parity with the Node admin route).
func RequireAdmin(store db.Store, cookieName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, _ := SessionUser(r, store, cookieName)
			if u == nil {
				WriteError(w, http.StatusUnauthorized, "Not signed in")
				return
			}
			if u.Role != "admin" {
				WriteError(w, http.StatusForbidden, "Not authorized")
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey, u)))
		})
	}
}
