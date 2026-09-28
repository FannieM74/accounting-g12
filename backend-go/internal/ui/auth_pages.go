package ui

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/auth"
	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
)

// safeNext allows only same-site redirect targets (no scheme, no host).
func safeNext(raw string) string {
	if raw == "" {
		return "/ui/"
	}
	u, err := url.Parse(raw)
	if err != nil || u.IsAbs() || u.Host != "" || !strings.HasPrefix(u.Path, "/") {
		return "/ui/"
	}
	return raw
}

// setSessionCookie mirrors handlers.setSessionCookie: opaque token, stored
// hash, same cookie flags. (Kept separate to avoid an import cycle — handlers
// does not import ui.)
func setSessionCookie(w http.ResponseWriter, r *http.Request, cfg config.Config, store db.Store, userID string) {
	tok, hash, err := auth.NewToken()
	if err != nil {
		return
	}
	expires := time.Now().Add(cfg.SessionTTL)
	_ = store.CreateSession(r.Context(), &db.Session{
		ID: hash, UserID: userID, ExpiresAt: expires, CreatedAt: time.Now().UTC(),
	})
	http.SetCookie(w, cfg.SessionCookie(tok, expires))
}

// clearSessionCookie mirrors handlers' logout: delete row, expire cookie.
func clearSessionCookie(w http.ResponseWriter, r *http.Request, cfg config.Config, store db.Store) {
	if c, err := r.Cookie(config.SessionCookieName); err == nil && c.Value != "" {
		_ = store.DeleteSession(r.Context(), auth.HashToken(c.Value))
	}
	http.SetCookie(w, cfg.SessionCookie("", time.Now().Add(-1*time.Hour)))
}

// loginPage shows the form (redirects home if already signed in).
func (h *Handler) loginPage(w http.ResponseWriter, r *http.Request, u *db.User) {
	if u != nil {
		http.Redirect(w, r, "/ui/", http.StatusSeeOther)
		return
	}
	data := pageData{Title: "Sign in", Year: time.Now().Year(), Redirect: safeNext(r.URL.Query().Get("next"))}
	h.render(w, http.StatusOK, "login", data)
}

// loginSubmit authenticates a form post (htmx or plain).
func (h *Handler) loginSubmit(w http.ResponseWriter, r *http.Request, u *db.User) {
	if u != nil {
		http.Redirect(w, r, "/ui/", http.StatusSeeOther)
		return
	}
	if !middleware.SameOrigin(r, h.cfg.FrontendOrigin) {
		h.renderError(w, r, "login", http.StatusForbidden, "Invalid origin.")
		return
	}
	ip := middleware.ClientIP(r)
	if !h.rl.Allow("ui-login:"+ip, 10, time.Minute) {
		h.renderError(w, r, "login", http.StatusTooManyRequests, "Too many attempts. Try again in a minute.")
		return
	}
	email := auth.NormalizeEmail(r.FormValue("email"))
	password := r.FormValue("password")
	if email == "" || password == "" {
		h.renderError(w, r, "login", http.StatusBadRequest, "Email and password are required.")
		return
	}

	next := safeNext(r.FormValue("next"))
	if err := h.store.EnsureSchema(r.Context()); err != nil {
		h.renderError(w, r, "login", http.StatusInternalServerError, "Could not sign in. Please try again.")
		return
	}
	user, err := h.store.UserByEmail(r.Context(), email)
	if err == db.ErrNotFound {
		auth.BurnPassword()
		h.renderError(w, r, "login", http.StatusUnauthorized, "Invalid email or password.")
		return
	} else if err != nil {
		h.renderError(w, r, "login", http.StatusInternalServerError, "Could not sign in. Please try again.")
		return
	}
	if !auth.VerifyPassword(user.PasswordHash, password) {
		h.renderError(w, r, "login", http.StatusUnauthorized, "Invalid email or password.")
		return
	}

	setSessionCookie(w, r, h.cfg, h.store, user.ID)
	h.redirectAfterAuth(w, r, next)
}

// signupPage shows the create-account form.
func (h *Handler) signupPage(w http.ResponseWriter, r *http.Request, u *db.User) {
	if u != nil {
		http.Redirect(w, r, "/ui/", http.StatusSeeOther)
		return
	}
	h.render(w, http.StatusOK, "signup", pageData{Title: "Create account", Year: time.Now().Year()})
}

// signupSubmit creates the account and signs the user in.
func (h *Handler) signupSubmit(w http.ResponseWriter, r *http.Request, u *db.User) {
	if u != nil {
		http.Redirect(w, r, "/ui/", http.StatusSeeOther)
		return
	}
	if !middleware.SameOrigin(r, h.cfg.FrontendOrigin) {
		h.renderError(w, r, "signup", http.StatusForbidden, "Invalid origin.")
		return
	}
	ip := middleware.ClientIP(r)
	if !h.rl.Allow("ui-signup:"+ip, 5, time.Minute) {
		h.renderError(w, r, "signup", http.StatusTooManyRequests, "Too many attempts. Try again in a minute.")
		return
	}
	email := auth.NormalizeEmail(r.FormValue("email"))
	password := r.FormValue("password")

	if !auth.IsValidEmail(email) {
		h.renderError(w, r, "signup", http.StatusBadRequest, "Enter a valid email address.")
		return
	}
	if issue := auth.PasswordIssue(password); issue != "" {
		h.renderError(w, r, "signup", http.StatusBadRequest, issue)
		return
	}

	if err := h.store.EnsureSchema(r.Context()); err != nil {
		h.renderError(w, r, "signup", http.StatusInternalServerError, "Could not create the account. Please try again.")
		return
	}
	if _, err := h.store.UserByEmail(r.Context(), email); err == nil {
		h.renderError(w, r, "signup", http.StatusConflict, "Email already registered.")
		return
	} else if err != db.ErrNotFound {
		h.renderError(w, r, "signup", http.StatusInternalServerError, "Could not create the account. Please try again.")
		return
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		h.renderError(w, r, "signup", http.StatusInternalServerError, "Could not create the account. Please try again.")
		return
	}
	id, err := auth.NewUserID()
	if err != nil {
		h.renderError(w, r, "signup", http.StatusInternalServerError, "Could not create the account. Please try again.")
		return
	}
	role := "user"
	count, err := h.store.CountUsers(r.Context())
	if err != nil {
		h.renderError(w, r, "signup", http.StatusInternalServerError, "Could not create the account. Please try again.")
		return
	}
	if count == 0 && h.cfg.AdminEmail == "" {
		role = "admin"
	} else if h.cfg.AdminEmail != "" && h.cfg.AdminEmail == email {
		role = "admin"
	}

	user := &db.User{ID: id, Email: email, PasswordHash: hash, Role: role, CreatedAt: time.Now().UTC()}
	if err := h.store.CreateUser(r.Context(), user); err != nil {
		h.renderError(w, r, "signup", http.StatusInternalServerError, "Could not create the account. Please try again.")
		return
	}
	setSessionCookie(w, r, h.cfg, h.store, user.ID)
	h.redirectAfterAuth(w, r, "/ui/")
}

// logoutSubmit clears the session and lands on the login page.
func (h *Handler) logoutSubmit(w http.ResponseWriter, r *http.Request, u *db.User) {
	if u != nil {
		clearSessionCookie(w, r, h.cfg, h.store)
	}
	http.Redirect(w, r, "/ui/login/", http.StatusSeeOther)
}

// redirectAfterAuth: htmx requests get HX-Redirect; plain posts get 303.
func (h *Handler) redirectAfterAuth(w http.ResponseWriter, r *http.Request, target string) {
	if isHTMX(r) {
		w.Header().Set("HX-Redirect", target)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	http.Redirect(w, r, target, http.StatusSeeOther)
}

// renderError re-renders a page shell with the error box filled; on htmx
// requests it swaps just the #form-error fragment (form values preserved).
func (h *Handler) renderError(w http.ResponseWriter, r *http.Request, page string, status int, msg string) {
	if isHTMX(r) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(status)
		_ = h.tmpl[page].ExecuteTemplate(w, "error.html", pageData{Error: msg})
		return
	}
	data := pageData{Title: "Sign in", Year: time.Now().Year(), Error: msg}
	if page == "signup" {
		data.Title = "Create account"
	}
	h.render(w, status, page, data)
}
