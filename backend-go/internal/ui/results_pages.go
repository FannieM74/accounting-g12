package ui

import (
	"net/http"
	"strconv"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
)

// resultView is the template-facing shape of one quiz result row.
type resultView struct {
	ID     int64
	Date   string // human-friendly
	Pct    int
	Score  int
	Total  int
	Topic  string
	Daily  bool
	Latest bool
}

// loadResults maps store rows to views, newest first.
func loadResults(rows []db.QuizResult) []resultView {
	views := make([]resultView, 0, len(rows))
	for _, row := range rows {
		v := resultView{ID: row.ID, Score: row.Score, Total: row.Total}
		if t, err := time.Parse(time.RFC3339, row.Date); err == nil {
			v.Date = t.Format("02 Jan 2006, 15:04")
		} else if t, err := time.Parse("2006-01-02", row.Date); err == nil {
			v.Date = t.Format("02 Jan 2006")
		} else {
			v.Date = row.Date
		}
		if row.Total > 0 {
			v.Pct = row.Score * 100 / row.Total
		}
		if row.Topic != nil {
			v.Topic = *row.Topic
		}
		if row.Daily != nil && *row.Daily {
			v.Daily = true
		}
		views = append(views, v)
	}
	// store returns oldest-first; display newest-first
	for i, j := 0, len(views)-1; i < j; i, j = i+1, j-1 {
		views[i], views[j] = views[j], views[i]
	}
	for i := range views {
		views[i].Latest = i == 0
	}
	return views
}

func pctStats(views []resultView) (totalQ, correctQ, avgPct, bestPct int) {
	for _, v := range views {
		totalQ += v.Total
		correctQ += v.Score
		if v.Pct > bestPct {
			bestPct = v.Pct
		}
	}
	if len(views) > 0 {
		sum := 0
		for _, v := range views {
			sum += v.Pct
		}
		avgPct = sum / len(views)
	}
	return
}

// home is the signed-in dashboard (or welcome page for guests).
func (h *Handler) home(w http.ResponseWriter, r *http.Request, u *db.User) {
	data := pageData{Title: "Home", Year: time.Now().Year()}
	if u == nil {
		data.Title = "Welcome"
		h.render(w, http.StatusOK, "home", data)
		return
	}
	data.Email, data.Role = currentUser(u)
	rows, err := h.store.ResultsByUser(r.Context(), u.ID, 500)
	if err != nil {
		rows = nil
	}
	views := loadResults(rows)
	data.Results = views
	data.TotalQ, data.CorrectQ, data.AvgPct, data.BestPct = pctStats(views)
	data.RecentCount = len(views)
	h.render(w, http.StatusOK, "home", data)
}

// resultsPage is the full results table (signed-in only).
func (h *Handler) resultsPage(w http.ResponseWriter, r *http.Request, u *db.User) {
	if u == nil {
		http.Redirect(w, r, "/ui/login/?next=/ui/results/", http.StatusSeeOther)
		return
	}
	data := pageData{Title: "My results", Year: time.Now().Year()}
	data.Email, data.Role = currentUser(u)
	rows, err := h.store.ResultsByUser(r.Context(), u.ID, 500)
	if err != nil {
		h.renderError(w, r, "results", http.StatusInternalServerError, "Could not load results.")
		return
	}
	data.Results = loadResults(rows)
	h.render(w, http.StatusOK, "results", data)
}

// resultsDelete clears every result for the user (htmx swaps the table out).
func (h *Handler) resultsDelete(w http.ResponseWriter, r *http.Request, u *db.User) {
	if u == nil {
		http.Redirect(w, r, "/ui/login/", http.StatusSeeOther)
		return
	}
	if !middleware.SameOrigin(r, h.cfg.FrontendOrigin) {
		h.renderError(w, r, "results", http.StatusForbidden, "Invalid origin.")
		return
	}
	if err := h.store.DeleteResultsByUser(r.Context(), u.ID); err != nil {
		h.renderError(w, r, "results", http.StatusInternalServerError, "Could not clear results.")
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if isHTMX(r) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`<div class="empty">All results cleared.</div>`))
		return
	}
	http.Redirect(w, r, "/ui/results/", http.StatusSeeOther)
}

// resultDeleteByID removes one row and returns the refreshed table fragment.
func (h *Handler) resultDeleteByID(w http.ResponseWriter, r *http.Request, u *db.User) {
	if u == nil {
		http.Redirect(w, r, "/ui/login/", http.StatusSeeOther)
		return
	}
	if !middleware.SameOrigin(r, h.cfg.FrontendOrigin) {
		h.renderError(w, r, "results", http.StatusForbidden, "Invalid origin.")
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id < 1 {
		h.renderError(w, r, "results", http.StatusBadRequest, "Invalid result id.")
		return
	}
	if err := h.store.DeleteResultByID(r.Context(), u.ID, id); err != nil {
		h.renderError(w, r, "results", http.StatusInternalServerError, "Could not delete that result.")
		return
	}
	rows, err := h.store.ResultsByUser(r.Context(), u.ID, 500)
	if err != nil {
		h.renderError(w, r, "results", http.StatusInternalServerError, "Could not refresh results.")
		return
	}
	views := loadResults(rows)
	if isHTMX(r) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		if len(views) == 0 {
			_, _ = w.Write([]byte(`<div class="empty">No results yet — take a quiz on the Next.js app and it will appear here.</div>`))
			return
		}
		_ = h.tmpl["results"].ExecuteTemplate(w, "results-table", views)
		return
	}
	http.Redirect(w, r, "/ui/results/", http.StatusSeeOther)
}

// resultsRow renders a single row fragment (reserved for future inline edits).
func (h *Handler) resultsRow(w http.ResponseWriter, r *http.Request, u *db.User) {
	if u == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	rows, err := h.store.ResultsByUser(r.Context(), u.ID, 500)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	for _, v := range loadResults(rows) {
		if v.ID == id {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_ = h.tmpl["results"].ExecuteTemplate(w, "row", v)
			return
		}
	}
	w.WriteHeader(http.StatusNotFound)
}
