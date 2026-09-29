package ui

import (
	"net/http"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
	"github.com/FannieM74/accounting-g12/backend-go/internal/quiz"
)

// renderQuizPicker shows the topic picker page (sign-in required to submit).
func (h *Handler) renderQuizPicker(w http.ResponseWriter, r *http.Request) {
	u, _ := middleware.SessionUser(r, h.store, config.SessionCookieName)
	if u == nil {
		http.Redirect(w, r, "/ui/login/?next="+r.URL.RequestURI(), http.StatusSeeOther)
		return
	}
	if h.quizPages.Bank == nil {
		http.Error(w, "Question bank unavailable", http.StatusInternalServerError)
		return
	}
	topics := h.quizPages.Bank.Topics()
	data := pageData{Title: "New quiz", Year: time.Now().Year(), Topics: topics, SelectedTopic: r.URL.Query().Get("topic")}
	data.Email, data.Role = currentUser(u)
	h.render(w, http.StatusOK, "quiz-picker", data)
}

// renderQuizRun renders the current question (full page or htmx fragment).
func (h *Handler) renderQuizRun(w http.ResponseWriter, r *http.Request, state *quiz.QuizState, tok quiz.SignedToken, fragment bool) {
	u, _ := middleware.SessionUser(r, h.store, config.SessionCookieName)
	if u == nil {
		http.Redirect(w, r, "/ui/login/?next="+r.URL.RequestURI(), http.StatusSeeOther)
		return
	}
	if state == nil || state.Idx >= len(state.IDs) {
		http.Redirect(w, r, "/ui/quiz", http.StatusSeeOther)
		return
	}
	id := state.IDs[state.Idx]
	q := h.quizPages.Bank.ByID(id)
	if q == nil {
		http.Redirect(w, r, "/ui/quiz", http.StatusSeeOther)
		return
	}
	seed := uint64(state.StartedAt)
	opts := make([]string, 0, len(q.Options))
	for _, i := range h.quizPages.Bank.PermOf(id, seed) {
		opts = append(opts, q.Options[i])
	}
	view := quizQuestionView{
		Number: state.Idx + 1, Total: len(state.IDs), Answered: len(state.Answers), ID: id,
		Text: q.Question, Context: q.Context, Options: opts, Topic: q.Topic,
		Token: string(tok), Chosen: -1,
	}
	if shown, ok := state.Answers[int(id)]; ok {
		view.Chosen = shown
	}
	if fragment {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = h.tmpl["quiz-run"].ExecuteTemplate(w, "quiz-question", view)
		return
	}
	data := pageData{Title: "Question", Year: time.Now().Year()}
	data.Email, data.Role = currentUser(u)
	data.QuizQuestion = &view
	h.render(w, http.StatusOK, "quiz-run", data)
}

// renderQuizScore shows the graded review screen.
func (h *Handler) renderQuizScore(w http.ResponseWriter, r *http.Request, graded quiz.GradeResult) {
	u, _ := middleware.SessionUser(r, h.store, config.SessionCookieName)
	if u == nil {
		http.Redirect(w, r, "/ui/login/?next=/ui/quiz", http.StatusSeeOther)
		return
	}
	pct := 0
	if graded.Total > 0 {
		pct = graded.Score * 100 / graded.Total
	}
	rows := make([]quizReviewRow, 0, len(graded.Rows))
	for _, row := range graded.Rows {
		rows = append(rows, quizReviewRow{
			Question: row.Question.Question,
			ID:       row.Question.ID,
			Topic:    row.Question.Topic,
			Context:  row.Question.Context,
			Chosen:   row.Chosen, ChosenIdx: row.ChosenIdx,
			CorrectIdx: row.CorrectIdx, Options: row.Options,
			CorrectText: row.CorrectText, Correct: row.Correct,
			Explanation: row.Question.Explanation,
		})
	}
	data := pageData{
		Title: "Your score", Year: time.Now().Year(),
		Score: graded.Score, Total: graded.Total, Pct: pct,
		Topic: gradedTopic(graded), Review: rows,
	}
	data.Email, data.Role = currentUser(u)
	h.render(w, http.StatusOK, "quiz-score", data)
}

func gradedTopic(g quiz.GradeResult) string { return "" }

// quizQuestionView feeds the quiz-question template (quiz package's
// questionView is unexported, so the UI mirrors the fields it needs).
type quizQuestionView = struct {
	Number   int
	Total    int
	Answered int
	ID       int64
	Text     string
	Context  string
	Options  []string
	Topic    string
	Token    string
	Chosen   int
}

type quizReviewRow struct {
	Question    string
	ID          int64
	Topic       string
	Context     string
	Chosen      string
	ChosenIdx   int
	CorrectIdx  int
	Options     []string
	CorrectText string
	Correct     bool
	Explanation string
}
