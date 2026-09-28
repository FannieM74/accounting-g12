package quiz

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
)

// Pages holds the collaborators the quiz handlers need.
type Pages struct {
	Bank  *Bank
	Store db.Store
	Cfg   config.Config
	Key   []byte // HMAC key for state tokens

	// Render callbacks wired by the ui package (templates live there).
	RenderPicker func(w http.ResponseWriter, r *http.Request)
	RenderRun    func(w http.ResponseWriter, r *http.Request, state *QuizState, tok SignedToken, fragment bool)
	RenderScore  func(w http.ResponseWriter, r *http.Request, graded GradeResult)
}

// NewPages wires quiz handlers. The HMAC key falls back to a value derived
// from the DB token so local dev needs no extra env var; set
// QUIZ_STATE_SECRET in production.
func NewPages(bank *Bank, store db.Store, cfg config.Config) *Pages {
	key := []byte(os.Getenv("QUIZ_STATE_SECRET"))
	if len(key) == 0 {
		key = []byte("quiz-state:" + cfg.DatabaseToken)
	}
	return &Pages{Bank: bank, Store: store, Cfg: cfg, Key: key}
}

// questionView feeds the run template.
type questionView struct {
	Number  int
	Total   int
	ID      int64
	Text    string
	Options []string // permuted order (what the learner sees)
	Topic   string
	Token   SignedToken
	Chosen  int // currently selected display position, -1 = none
}

// pickerView feeds the topic picker.
type pickerView struct {
	Topics []struct {
		Key   string
		Count int
	}
	Token string // CSRF-ish origin is handled by SameOrigin; token unused
}

func isHTMXReq(r *http.Request) bool { return r.Header.Get("HX-Request") == "true" }

func redirect(w http.ResponseWriter, r *http.Request, target string) {
	if isHTMXReq(r) {
		w.Header().Set("HX-Redirect", target)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	http.Redirect(w, r, target, http.StatusSeeOther)
}

func qsParam(r *http.Request) SignedToken {
	if r.Method == http.MethodPost {
		return SignedToken(r.FormValue("qs"))
	}
	return SignedToken(r.URL.Query().Get("qs"))
}

// Picker renders GET /ui/quiz (topic chooser).
func (p *Pages) Picker(w http.ResponseWriter, r *http.Request) {
	if p.RenderPicker != nil {
		p.RenderPicker(w, r)
		return
	}
	http.NotFound(w, r)
}

// Start handles POST /ui/quiz/start: builds state, redirects to run.
func (p *Pages) Start(w http.ResponseWriter, r *http.Request) {
	if !middleware.SameOrigin(r, p.Cfg.FrontendOrigin) {
		http.Error(w, "Invalid origin", http.StatusForbidden)
		return
	}
	if p.Store == nil {
		http.Error(w, "Database not configured", http.StatusServiceUnavailable)
		return
	}
	topic := strings.TrimSpace(r.FormValue("topic"))
	count := 10
	if c, err := strconv.Atoi(r.FormValue("count")); err == nil && c >= 5 && c <= 50 {
		count = c
	}
	seed, err := newSeed()
	if err != nil {
		http.Error(w, "Could not start quiz", http.StatusInternalServerError)
		return
	}
	state := &QuizState{
		Topic:     topic,
		Paper:     "1",
		IDs:       p.Bank.Pick(topic, count, seed),
		Idx:       0,
		Answers:   map[int]int{},
		StartedAt: time.Now().Unix(),
	}
	tok, err := state.Encode(p.Key)
	if err != nil {
		http.Error(w, "Could not start quiz", http.StatusInternalServerError)
		return
	}
	redirect(w, r, "/ui/quiz/run?qs="+url.QueryEscape(string(tok)))
}

// Run renders GET /ui/quiz/run: current question fragment/page.
func (p *Pages) Run(w http.ResponseWriter, r *http.Request) {
	state, err := DecodeToken(qsParam(r), p.Key)
	if err != nil || state.Saved {
		redirect(w, r, "/ui/quiz")
		return
	}
	if state.Idx >= len(state.IDs) {
		p.Finish(w, r) // all answered -> grade
		return
	}
	if p.RenderRun != nil {
		p.RenderRun(w, r, state, qsParam(r), false)
		return
	}
	http.NotFound(w, r)
}

// Answer handles POST /ui/quiz/answer: records choice, advances, re-issues
// state (fresh signature) so tokens can't be replayed across answers.
func (p *Pages) Answer(w http.ResponseWriter, r *http.Request) {
	if !middleware.SameOrigin(r, p.Cfg.FrontendOrigin) {
		http.Error(w, "Invalid origin", http.StatusForbidden)
		return
	}
	state, err := DecodeToken(qsParam(r), p.Key)
	if err != nil || state.Saved {
		redirect(w, r, "/ui/quiz")
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Bad form", http.StatusBadRequest)
		return
	}
	if state.Idx < len(state.IDs) {
		qid := state.IDs[state.Idx]
		choice, err := strconv.Atoi(r.FormValue("choice"))
		if err == nil && choice >= 0 {
			state.Answers[int(qid)] = choice
		}
		state.Idx++
	}
	tok, err := state.Encode(p.Key)
	if err != nil {
		http.Error(w, "Could not save answer", http.StatusInternalServerError)
		return
	}
	if state.Idx >= len(state.IDs) {
		redirect(w, r, "/ui/quiz/finish?qs="+url.QueryEscape(string(tok)))
		return
	}
	if isHTMXReq(r) {
		// Swap the next question in place and keep the URL shareable.
		w.Header().Set("HX-Push-Url", "/ui/quiz/run?qs="+url.QueryEscape(string(tok)))
		if p.RenderRun != nil {
			p.RenderRun(w, r, state, tok, true)
			return
		}
	}
	http.Redirect(w, r, "/ui/quiz/run?qs="+url.QueryEscape(string(tok)), http.StatusSeeOther)
}

// Finish grades (once) and redirects to the score screen. No SameOrigin
// check: this is a plain GET navigation (browsers omit Origin on those) and
// the signed token is unguessable, so CSRF is not a concern here.
func (p *Pages) Finish(w http.ResponseWriter, r *http.Request) {
	state, err := DecodeToken(qsParam(r), p.Key)
	if err != nil {
		redirect(w, r, "/ui/quiz")
		return
	}
	if !state.Saved {
		graded := p.Bank.Grade(state)
		if p.Store != nil {
			u, _ := middleware.SessionUser(r, p.Store, config.SessionCookieName)
			if u != nil {
				date := time.Now().UTC().Format(time.RFC3339)
				topic := state.Topic
				var topicPtr *string
				if topic != "" {
					topicPtr = &topic
				}
				dur := int(time.Since(time.Unix(state.StartedAt, 0)).Milliseconds())
				_ = p.Store.InsertResult(r.Context(), &db.QuizResult{
					UserID: u.ID, Date: date, Score: graded.Score, Total: graded.Total,
					Topic: topicPtr, DurationMs: &dur,
					QuestionIDs: jsonIDs(state.IDs), MissedIDs: jsonIDs(graded.MissedIDs),
				})
			}
		}
		state.Saved = true
	}
	tok, err := state.Encode(p.Key)
	if err != nil {
		http.Error(w, "Could not finish quiz", http.StatusInternalServerError)
		return
	}
	redirect(w, r, "/ui/quiz/score?qs="+url.QueryEscape(string(tok)))
}

// Score renders GET /ui/quiz/score.
func (p *Pages) Score(w http.ResponseWriter, r *http.Request) {
	state, err := DecodeToken(qsParam(r), p.Key)
	if err != nil || !state.Saved {
		redirect(w, r, "/ui/quiz")
		return
	}
	if p.RenderScore != nil {
		p.RenderScore(w, r, p.Bank.Grade(state))
		return
	}
	http.NotFound(w, r)
}

func marshalIDs(ids []int64) ([]byte, error) { return json.Marshal(ids) }

func jsonIDs(ids []int64) *string {
	if len(ids) == 0 {
		return nil
	}
	b, err := marshalIDs(ids)
	if err != nil {
		return nil
	}
	s := string(b)
	return &s
}
