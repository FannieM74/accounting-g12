package handlers

import (
	"net/http"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/auth"
	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
)

func tokenHash(token string) string { return auth.HashToken(token) }

func expiredTime() time.Time { return time.Now().Add(-1 * time.Hour) }

// setSessionCookie mints an opaque token, stores its hash, and sets the
// session cookie (httpOnly, sameSite=lax; secure in production).
func setSessionCookie(w http.ResponseWriter, r *http.Request, cfg config.Config, store db.Store, userID string) {
	tok, hash, err := auth.NewToken()
	if err != nil {
		return
	}
	expires := time.Now().Add(cfg.SessionTTL)
	_ = store.CreateSession(r.Context(), &db.Session{
		ID: hash, UserID: userID, ExpiresAt: expires, CreatedAt: time.Now().UTC(),
	})
	http.SetCookie(w, cfg.SessionCookie(tok, expires))
}
