package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
)

const (
	maxResultsBatch = 250
	maxResultsList  = 500
)

type incomingResult struct {
	Date        string  `json:"date"`
	Score       *int    `json:"score"`
	Total       *int    `json:"total"`
	Topic       *string `json:"topic"`
	Section     *string `json:"section"`
	Daily       *bool   `json:"daily"`
	DurationMs  *int    `json:"durationMs"`
	QuestionIDs []int64 `json:"questionIds"`
	MissedIDs   []int64 `json:"missedIds"`
}

func validateResult(r incomingResult) string {
	if r.Date == "" {
		return "Invalid date."
	}
	if _, err := time.Parse(time.RFC3339, r.Date); err != nil {
		if _, err := time.Parse("2006-01-02", r.Date); err != nil {
			return "Invalid date."
		}
	}
	if r.Score == nil || *r.Score < 0 || *r.Score > 1000 {
		return "Invalid score."
	}
	if r.Total == nil || *r.Total < 1 || *r.Total > 1000 {
		return "Invalid total."
	}
	if *r.Score > *r.Total {
		return "Score cannot exceed total."
	}
	if r.DurationMs != nil && (*r.DurationMs < 0 || *r.DurationMs > 86_400_000) {
		return "Invalid duration."
	}
	idsOk := func(a []int64) bool {
		if a == nil {
			return true
		}
		if len(a) > 500 {
			return false
		}
		for _, v := range a {
			if v < 0 || v >= 100000 {
				return false
			}
		}
		return true
	}
	if !idsOk(r.QuestionIDs) || !idsOk(r.MissedIDs) {
		return "Invalid question ids."
	}
	return ""
}

func resultToRow(userID string, r incomingResult) *db.QuizResult {
	row := &db.QuizResult{
		UserID:     userID,
		Date:       r.Date,
		Score:      *r.Score,
		Total:      *r.Total,
		Topic:      r.Topic,
		Section:    r.Section,
		Daily:      r.Daily,
		DurationMs: r.DurationMs,
	}
	if r.QuestionIDs != nil {
		b, _ := json.Marshal(r.QuestionIDs)
		s := string(b)
		row.QuestionIDs = &s
	}
	if r.MissedIDs != nil {
		b, _ := json.Marshal(r.MissedIDs)
		s := string(b)
		row.MissedIDs = &s
	}
	return row
}

// Results mirrors GET/POST/DELETE /api/results in the Next.js app.
func Results(store db.Store, cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cfg.DatabaseURL == "" {
			middleware.WriteError(w, http.StatusServiceUnavailable, "Database not configured")
			return
		}
		u, _ := middleware.UserFrom(r.Context())
		if u == nil {
			middleware.WriteError(w, http.StatusUnauthorized, "Not signed in")
			return
		}
		switch r.Method {
		case http.MethodGet:
			if err := store.EnsureSchema(r.Context()); err != nil {
				middleware.WriteError(w, http.StatusInternalServerError, "Could not load results.")
				return
			}
			rows, err := store.ResultsByUser(r.Context(), u.ID, maxResultsList)
			if err != nil {
				middleware.WriteError(w, http.StatusInternalServerError, "Could not load results.")
				return
			}
			resp := make([]map[string]any, 0, len(rows))
			for _, row := range rows {
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
				if row.QuestionIDs != nil {
					var ids []int64
					if json.Unmarshal([]byte(*row.QuestionIDs), &ids) == nil {
						m["questionIds"] = ids
					}
				}
				if row.MissedIDs != nil {
					var ids []int64
					if json.Unmarshal([]byte(*row.MissedIDs), &ids) == nil {
						m["missedIds"] = ids
					}
				}
				resp = append(resp, m)
			}
			middleware.WriteJSON(w, http.StatusOK, map[string]any{"results": resp})
		case http.MethodPost:
			if !middleware.SameOrigin(r, cfg.FrontendOrigin) {
				middleware.WriteError(w, http.StatusForbidden, "Invalid origin")
				return
			}
			if err := store.EnsureSchema(r.Context()); err != nil {
				middleware.WriteError(w, http.StatusInternalServerError, "Could not save results.")
				return
			}
			var body struct {
				Results []incomingResult `json:"results"`
				Result  *incomingResult  `json:"result"`
			}
			if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20)).Decode(&body); err != nil {
				middleware.WriteError(w, http.StatusBadRequest, "Invalid request")
				return
			}
			incoming := body.Results
			if incoming == nil && body.Result != nil {
				incoming = []incomingResult{*body.Result}
			}
			if len(incoming) == 0 || len(incoming) > maxResultsBatch {
				middleware.WriteError(w, http.StatusBadRequest, "Nothing to save.")
				return
			}
			for _, inc := range incoming {
				if msg := validateResult(inc); msg != "" {
					middleware.WriteError(w, http.StatusBadRequest, msg)
					return
				}
			}
			for i := range incoming {
				if err := store.InsertResult(r.Context(), resultToRow(u.ID, incoming[i])); err != nil {
					middleware.WriteError(w, http.StatusInternalServerError, "Could not save results.")
					return
				}
			}
			middleware.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "saved": len(incoming)})
		case http.MethodDelete:
			if !middleware.SameOrigin(r, cfg.FrontendOrigin) {
				middleware.WriteError(w, http.StatusForbidden, "Invalid origin")
				return
			}
			if err := store.EnsureSchema(r.Context()); err != nil {
				middleware.WriteError(w, http.StatusInternalServerError, "Could not clear results.")
				return
			}
			if err := store.DeleteResultsByUser(r.Context(), u.ID); err != nil {
				middleware.WriteError(w, http.StatusInternalServerError, "Could not clear results.")
				return
			}
			middleware.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
		default:
			middleware.WriteError(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
	})
}
