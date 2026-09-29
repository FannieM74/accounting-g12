package ui

import (
	"net/http"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/analytics"
	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
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

// adminAnalyticsPage renders GET /ui/admin/analytics: student summaries plus
// cohort struggle stats across all users' results.
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
	students := analytics.ComputeStudentSummaries(rows, users, h.quizPages.Bank)
	data := pageData{
		Title: "Cohort analytics", Year: time.Now().Year(),
		Users: rep.Users, Attempts: rep.Attempts, Questions: rep.Questions,
		TopicStats: rep.Topics, Hardest: rep.Hardest, PerUser: rep.PerUser,
		Students: students,
	}
	data.Email, data.Role = currentUser(u)
	h.render(w, http.StatusOK, "admin-analytics", data)
}

// adminStudentPage renders GET /ui/admin/student/{id}: one student's full
// study detail — overview stats, topic breakdown, trend, and every result.
func (h *Handler) adminStudentPage(w http.ResponseWriter, r *http.Request) {
	u, _ := middleware.SessionUser(r, h.store, config.SessionCookieName)
	if u == nil || u.Role != "admin" {
		http.Error(w, "Admins only", http.StatusForbidden)
		return
	}
	id := r.PathValue("id")
	users, err := h.store.Users(r.Context())
	if err != nil {
		http.Error(w, "Could not load users", http.StatusInternalServerError)
		return
	}
	var student *db.User
	for i := range users {
		if users[i].ID == id {
			student = &users[i]
			break
		}
	}
	if student == nil {
		http.NotFound(w, r)
		return
	}
	rows, err := h.store.ResultsByUser(r.Context(), id, 1000)
	if err != nil {
		http.Error(w, "Could not load results", http.StatusInternalServerError)
		return
	}
	rep := analytics.ComputeUserReport(rows, h.quizPages.Bank)
	views := loadResults(rows)
	totalQ, correctQ, avgPct, bestPct := pctStats(views)
	data := pageData{
		Title: student.Email, Year: time.Now().Year(),
		Student: &analytics.StudentSummary{
			ID: student.ID, Email: student.Email, Role: student.Role,
			Joined: student.CreatedAt.Format("02 Jan 2006"),
		},
		Attempts: rep.Attempts, Questions: rep.Questions, AvgPct: rep.AvgPct,
		TopicStats: rep.Topics, Weakest: rep.Weakest, RecentPcts: rep.RecentPcts,
		Results: views, TotalQ: totalQ, CorrectQ: correctQ, AvgPct2: avgPct, BestPct: bestPct,
	}
	data.Email, data.Role = currentUser(u)
	h.render(w, http.StatusOK, "admin-student", data)
}
