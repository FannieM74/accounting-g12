package ui

import (
	"net/http"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/analytics"
	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
)

// analyticsPage renders GET /ui/analytics: the signed-in user's weak topics,
// accuracy and recent trend.
func (h *Handler) analyticsPage(w http.ResponseWriter, r *http.Request) {
	u, _ := middleware.SessionUser(r, h.store, config.SessionCookieName)
	if u == nil {
		http.Redirect(w, r, "/ui/login/?next=%2Fui%2Fanalytics", http.StatusSeeOther)
		return
	}
	rows, err := h.store.ResultsByUser(r.Context(), u.ID, 1000)
	if err != nil {
		http.Error(w, "Could not load results", http.StatusInternalServerError)
		return
	}
	rep := analytics.ComputeUserReport(rows, h.quizPages.Bank)
	data := pageData{
		Title: "Your analytics", Year: time.Now().Year(),
		Attempts: rep.Attempts, Questions: rep.Questions,
		AvgPct: rep.AvgPct, TopicStats: rep.Topics,
		Weakest: rep.Weakest, RecentPcts: rep.RecentPcts,
	}
	data.Email, data.Role = currentUser(u)
	h.render(w, http.StatusOK, "analytics", data)
}

// adminAnalyticsPage renders GET /ui/admin/analytics: cohort struggle stats
// across all users' results.
func (h *Handler) adminAnalyticsPage(w http.ResponseWriter, r *http.Request) {
	u, _ := middleware.SessionUser(r, h.store, config.SessionCookieName)
	if u == nil || u.Role != "admin" {
		http.Error(w, "Admins only", http.StatusForbidden)
		return
	}
	rows, err := h.store.AllResults(r.Context())
	if err != nil {
		http.Error(w, "Could not load results", http.StatusInternalServerError)
		return
	}
	users, err := h.store.Users(r.Context())
	if err != nil {
		http.Error(w, "Could not load users", http.StatusInternalServerError)
		return
	}
	emails := make(map[string]string, len(users))
	for _, uu := range users {
		emails[uu.ID] = uu.Email
	}
	rep := analytics.ComputeCohortReport(rows, h.quizPages.Bank, emails)
	data := pageData{
		Title: "Cohort analytics", Year: time.Now().Year(),
		Users: rep.Users, Attempts: rep.Attempts, Questions: rep.Questions,
		TopicStats: rep.Topics, Hardest: rep.Hardest, PerUser: rep.PerUser,
	}
	data.Email, data.Role = currentUser(u)
	h.render(w, http.StatusOK, "admin-analytics", data)
}
