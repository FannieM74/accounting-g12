package handlers

import (
	"math"
	"net/http"

	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
)

// AdminUsers mirrors GET /api/admin/users (admin-only aggregate view).
func AdminUsers(store db.Store, cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cfg.DatabaseURL == "" {
			middleware.WriteError(w, http.StatusServiceUnavailable, "Database not configured")
			return
		}
		u, _ := middleware.UserFrom(r.Context())
		if u == nil {
			middleware.WriteError(w, http.StatusUnauthorized, "Not authorized")
			return
		}
		if u.Role != "admin" {
			middleware.WriteError(w, http.StatusForbidden, "Not authorized")
			return
		}
		if err := store.EnsureSchema(r.Context()); err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "Could not load admin data.")
			return
		}
		users, err := store.Users(r.Context())
		if err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "Could not load admin data.")
			return
		}
		allResults, err := store.AllResults(r.Context())
		if err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "Could not load admin data.")
			return
		}
		byUser := map[string][]map[string]any{}
		for _, row := range allResults {
			m := map[string]any{
				"date":  row.Date,
				"score": row.Score,
				"total": row.Total,
			}
			if row.Topic != nil {
				m["topic"] = *row.Topic
			}
			if row.Section != nil {
				m["section"] = *row.Section
			}
			if row.Daily != nil {
				m["daily"] = *row.Daily
			}
			if row.DurationMs != nil {
				m["durationMs"] = *row.DurationMs
			}
			byUser[row.UserID] = append(byUser[row.UserID], m)
		}
		out := make([]map[string]any, 0, len(users))
		for _, usr := range users {
			results := byUser[usr.ID]
			pcts := []float64{}
			for _, res := range results {
				total, _ := res["total"].(int)
				score, _ := res["score"].(int)
				if total > 0 {
					pcts = append(pcts, float64(score)/float64(total)*100)
				}
			}
			avg, best := 0.0, 0.0
			if len(pcts) > 0 {
				sum := 0.0
				for _, p := range pcts {
					sum += p
					if p > best {
						best = p
					}
				}
				avg = sum / float64(len(pcts))
			}
			var lastActive any
			if len(results) > 0 {
				lastActive = results[0]["date"]
			}
			out = append(out, map[string]any{
				"id":           usr.ID,
				"email":        usr.Email,
				"role":         usr.Role,
				"createdAt":    usr.CreatedAt,
				"results":      results,
				"quizzesTaken": len(results),
				"avgPct":       math.Round(avg),
				"bestPct":      math.Round(best),
				"lastActive":   lastActive,
			})
		}
		middleware.WriteJSON(w, http.StatusOK, map[string]any{"users": out})
	})
}
