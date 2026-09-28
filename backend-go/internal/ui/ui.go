// Package ui serves the HTMX front-end: server-rendered html/template pages
// with htmx-powered form posts, sharing the session cookie and store with the
// JSON API. All assets are embedded, so the serverless bundle is self-contained.
package ui

import (
	"embed"
	"html/template"
	"log"
	"net/http"
	"sync"

	"github.com/FannieM74/accounting-g12/backend-go/internal/auth"
	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
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
}

// templateSets lists every parsed set; pages define "title" and "content".
var templateSets = []string{
	"login", "signup", "home", "results", "404",
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

var funcMap = template.FuncMap{"pctClass": pctClass}

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

	// /ui (no trailing slash) and unknown /ui/* paths get the themed 404.
	mux.HandleFunc("/ui", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/ui/", http.StatusPermanentRedirect)
	})
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
