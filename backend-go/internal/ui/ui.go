// Package ui serves the HTMX front-end: server-rendered html/template pages
// with htmx-powered form posts, sharing the session cookie and store with the
// JSON API. All assets are embedded, so the serverless bundle is self-contained.
package ui

import (
	"embed"
	"html/template"
	"log"
	"net/http"
	"net/url"
	"sync"

	"github.com/FannieM74/accounting-g12/backend-go/internal/auth"
	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
	"github.com/FannieM74/accounting-g12/backend-go/internal/quiz"
)

//go:embed web/templates/layouts/*.html web/templates/pages/*.html web/templates/fragments/*.html
var templateFS embed.FS

//go:embed web/static/htmx.min.js
var staticFS embed.FS

// Handler serves every /ui/* route (method-aware path suffixes).
type Handler struct {
	store     db.Store
	cfg       config.Config
	rl        *auth.RateLimiter
	tmpl      map[string]*template.Template
	serverErr bool
	mu        sync.Mutex
	quizPages *quiz.Pages
}

// templateSets lists every parsed set; pages define "title" and "content".
var templateSets = []string{
	"login", "signup", "home", "results", "404",
	"quiz-picker", "quiz-run", "quiz-score",
}

// New parses templates once and returns the UI handler. Templates are
// re-parsed on demand if parsing failed at startup (cold-start safety).
func New(store db.Store, cfg config.Config, rl *auth.RateLimiter) *Handler {
	h := &Handler{store: store, cfg: cfg, rl: rl}
	h.mu.Lock()
	h.tmpl, h.serverErr = parseTemplates()
	h.mu.Unlock()
	if h.serverErr {
		log.Printf("ui: template parse failed at startup; will retry per request")
	}
	bank, err := quiz.LoadBankEmbedded()
	if err != nil {
		log.Printf("ui: question bank failed to load: %v", err)
	}
	h.quizPages = quiz.NewPages(bank, store, cfg)
	h.quizPages.RenderPicker = h.renderQuizPicker
	h.quizPages.RenderRun = h.renderQuizRun
	h.quizPages.RenderScore = h.renderQuizScore
	return h
}

// pctClass colors a percentage band (used by templates via funcMap).
func pctClass(p int) string {
	switch {
	case p >= 80:
		return "good"
	case p >= 50:
		return "mid"
	default:
		return "bad"
	}
}

var funcMap = template.FuncMap{
	"pctClass": pctClass,
	"progressPct": func(n, total int) int {
		if total <= 0 {
			return 0
		}
		return n * 100 / total
	},
}

func parseTemplates() (map[string]*template.Template, bool) {
	sets := make(map[string]*template.Template, len(templateSets))
	for _, name := range templateSets {
		t, err := template.New(name).Funcs(funcMap).ParseFS(templateFS,
			"web/templates/layouts/base.html",
			"web/templates/pages/"+name+".html",
			"web/templates/fragments/error.html",
		)
		if err != nil {
			return nil, true
		}
		sets[name] = t
	}
	return sets, false
}

// Register mounts the UI routes on mux under /ui/.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /ui/static/htmx.min.js", func(w http.ResponseWriter, r *http.Request) {
		b, err := staticFS.ReadFile("web/static/htmx.min.js")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		_, _ = w.Write(b)
	})

	mux.HandleFunc("GET /ui/{$}", h.page(h.home))
	mux.HandleFunc("GET /ui/login/{$}", h.page(h.loginPage))
	mux.HandleFunc("GET /ui/signup/{$}", h.page(h.signupPage))
	mux.HandleFunc("GET /ui/results/{$}", h.page(h.resultsPage))
	mux.HandleFunc("POST /ui/login/{$}", h.submit(h.loginSubmit))
	mux.HandleFunc("POST /ui/signup/{$}", h.submit(h.signupSubmit))
	mux.HandleFunc("POST /ui/logout/{$}", h.submit(h.logoutSubmit))
	mux.HandleFunc("DELETE /ui/results/{$}", h.submit(h.resultsDelete))
	mux.HandleFunc("DELETE /ui/results/{id}/{$}", h.submit(h.resultDeleteByID))
	mux.HandleFunc("GET /ui/results/{id}/row/{$}", h.fragment(h.resultsRow))

	// Quiz flow (signed stateless tokens; handlers in internal/quiz).
	mux.HandleFunc("GET /ui/quiz", h.authPage(h.quizPages.Picker))
	mux.HandleFunc("POST /ui/quiz/start", h.authSubmit(h.quizPages.Start))
	mux.HandleFunc("GET /ui/quiz/run", h.authPage(h.quizPages.Run))
	mux.HandleFunc("POST /ui/quiz/answer", h.authSubmit(h.quizPages.Answer))
	mux.HandleFunc("GET /ui/quiz/finish", h.authPage(h.quizPages.Finish))
	mux.HandleFunc("GET /ui/quiz/score", h.authPage(h.quizPages.Score))

	// Vercel/Next normalize trailing slashes before proxying, so register
	// slash-less aliases for every /ui route (a redirect would drop POST
	// bodies and htmx requests). Method-specific aliases are registered as
	// separate handlers so POST/DELETE still route correctly.
	for _, alias := range []struct {
		path string
		h    http.Handler
	}{
		{"/ui", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "/ui/", http.StatusPermanentRedirect)
		})},
		{"/ui/login", h.any(h.page(h.loginPage), h.submit(h.loginSubmit))},
		{"/ui/signup", h.any(h.page(h.signupPage), h.submit(h.signupSubmit))},
		{"/ui/results", h.any(h.page(h.resultsPage), h.submit(func(w http.ResponseWriter, r *http.Request, u *db.User) {
			if r.Method != http.MethodDelete {
				h.render(w, http.StatusMethodNotAllowed, "404", pageData{Title: "Not found"})
				return
			}
			h.resultsDelete(w, r, u)
		}))},
		{"/ui/logout", h.any(h.submit(h.logoutSubmit), h.submit(h.logoutSubmit))},
		{"/ui/quiz", h.any(h.authPage(h.quizPages.Picker), h.authSubmit(h.quizPages.Start))},
		{"/ui/quiz/run", h.authPage(h.quizPages.Run)},
		{"/ui/quiz/score", h.authPage(h.quizPages.Score)},
		{"/ui/results/{id}", h.any(h.submit(h.resultDeleteByID), h.submit(h.resultDeleteByID))},
		{"/ui/results/{id}/row", h.fragment(h.resultsRow)},
	} {
		mux.Handle(alias.path, alias.h)
	}
	mux.HandleFunc("/ui/", func(w http.ResponseWriter, r *http.Request) {
		h.render(w, http.StatusNotFound, "404", pageData{Title: "Not found"})
	})
}

// pageData feeds the base layout.
type pageData struct {
	Title       string
	Email       string
	Role        string
	Year        int
	Error       string
	IsHTMX      bool
	Redirect    string // post-login destination (?next=)
	Results     []resultView
	TotalQ      int
	CorrectQ    int
	AvgPct      int
	BestPct     int
	RecentCount int

	// quiz pages
	Topics       []quiz.TopicCount
	QuizQuestion *quizQuestionView
	Score        int
	Total        int
	Pct          int
	Topic        string
	Review       []quizReviewRow
}

// render executes a named page set inside the base layout.
func (h *Handler) render(w http.ResponseWriter, status int, name string, data pageData) {
	h.mu.Lock()
	t, ok := h.tmpl[name]
	if !ok && h.serverErr {
		var failed bool
		h.tmpl, failed = parseTemplates()
		if !failed {
			t, ok = h.tmpl[name]
			h.serverErr = false
		}
	}
	h.mu.Unlock()
	if !ok || t == nil {
		http.Error(w, "template error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	if err := t.ExecuteTemplate(w, "base.html", data); err != nil {
		log.Printf("ui: render %s: %v", name, err)
	}
}

// page wraps a GET page action with optional-auth + user hydration.
func (h *Handler) page(fn func(http.ResponseWriter, *http.Request, *db.User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, _ := middleware.SessionUser(r, h.store, config.SessionCookieName)
		fn(w, r, u)
	}
}

// authPage/authSubmit are page/submit variants for routes that REQUIRE a
// signed-in user (the quiz flow saves attempts against the account): guests
// are bounced to /ui/login with a ?next= return path.
func (h *Handler) authPage(fn func(http.ResponseWriter, *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if u, ok := h.sessionUser(r); !ok || u == nil {
			http.Redirect(w, r, "/ui/login/?next="+url.QueryEscape(r.URL.RequestURI()), http.StatusSeeOther)
			return
		}
		fn(w, r)
	}
}

func (h *Handler) authSubmit(fn func(http.ResponseWriter, *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if u, ok := h.sessionUser(r); !ok || u == nil {
			if r.Header.Get("HX-Request") == "true" {
				w.Header().Set("HX-Redirect", "/ui/login/")
			}
			http.Redirect(w, r, "/ui/login/?next="+url.QueryEscape(r.URL.RequestURI()), http.StatusSeeOther)
			return
		}
		fn(w, r)
	}
}

func (h *Handler) sessionUser(r *http.Request) (*db.User, bool) {
	// SessionUser returns (user, session); a valid login has both non-nil.
	u, sess := middleware.SessionUser(r, h.store, config.SessionCookieName)
	return u, u != nil && sess != nil
}

// submit wraps form POST/DELETE actions.
func (h *Handler) submit(fn func(http.ResponseWriter, *http.Request, *db.User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, _ := middleware.SessionUser(r, h.store, config.SessionCookieName)
		fn(w, r, u)
	}
}

// fragment serves partial HTML for htmx swaps (auth enforced by caller).
func (h *Handler) fragment(fn func(http.ResponseWriter, *http.Request, *db.User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, _ := middleware.SessionUser(r, h.store, config.SessionCookieName)
		fn(w, r, u)
	}
}

// any dispatches GET/HEAD to get and other methods to post — used by the
// slash-less alias routes where a single pattern serves all methods.
func (h *Handler) any(get, post http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead {
			get(w, r)
			return
		}
		post(w, r)
	})
}

// currentUser hydrates display fields into pageData.
func currentUser(u *db.User) (email, role string) {
	if u == nil {
		return "", ""
	}
	return u.Email, u.Role
}

func isHTMX(r *http.Request) bool {
	return r.Header.Get("HX-Request") == "true"
}
