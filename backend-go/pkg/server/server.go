// Package server wires config, store, middleware, and routes into one
// handler shared by the standalone binary and the Vercel function.
package server

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/auth"
	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/handlers"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
)

// New builds the full HTTP handler (routes, middleware, store).
func New() http.Handler {
	cfg := config.Load()
	rl := auth.NewRateLimiter()

	var store db.Store
	if cfg.DatabaseURL != "" {
		handle, err := db.Open(cfg.DatabaseURL, cfg.DatabaseToken)
		if err != nil {
			log.Printf("db open failed: %v", err)
		} else {
			store = db.NewLibsqlStore(handle)
		}
	}
	if store == nil {
		log.Printf("DATABASE_URL not set or unreadable - API answers 503 like the Node build")
		store = db.NewMemoryStore()
	}

	// opportunistic expired-session cleanup (cheap; sessions are tiny)
	go func() {
		ctx := context.Background()
		for {
			if _, err := store.DeleteExpiredSessions(ctx); err != nil {
				break
			}
			time.Sleep(6 * time.Hour)
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		middleware.WriteJSON(w, http.StatusOK, map[string]string{"ok": "true"})
	})

	signAuth := middleware.RequireUser(store, config.SessionCookieName)
	adminAuth := middleware.RequireAdmin(store, config.SessionCookieName)

	mux.Handle("POST /api/auth/signup", handlers.Signup(store, cfg, rl))
	mux.Handle("POST /api/auth/login", handlers.Login(store, cfg, rl))
	// Me handles auth internally: GET must return 200 {"user":null} when
	// unauthenticated (parity with the Next.js route), so no middleware wrap.
	mux.Handle("/api/auth/me", handlers.Me(store, cfg))
	mux.Handle("/api/results", signAuth(handlers.Results(store, cfg)))
	mux.Handle("/api/admin/users", adminAuth(handlers.AdminUsers(store, cfg)))

	return mux
}
