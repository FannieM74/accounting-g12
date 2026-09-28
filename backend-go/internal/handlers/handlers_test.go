package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/FannieM74/accounting-g12/backend-go/internal/auth"
	"github.com/FannieM74/accounting-g12/backend-go/internal/config"
	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/middleware"
)

func newTestEnv(t *testing.T) (*db.MemoryStore, config.Config, *auth.RateLimiter) {
	t.Helper()
	store := db.NewMemoryStore()
	cfg := config.Config{
		DatabaseURL:   "libsql://test.example",
		SessionTTL:    30 * 24 * time.Hour,
		SecureCookies: false,
	}
	return store, cfg, auth.NewRateLimiter()
}

func doJSON(t *testing.T, h http.Handler, method, path string, body any, origin string) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Host = "acct.example"
	if origin == "" {
		origin = "https://acct.example"
	}
	req.Header.Set("Origin", origin)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestSignupLoginMe(t *testing.T) {
	store, cfg, rl := newTestEnv(t)
	signup := Signup(store, cfg, rl)
	login := Login(store, cfg, rl)

	// missing schema/user: signup creates first user as admin
	rec := doJSON(t, signup, "POST", "/api/auth/signup", map[string]string{
		"email": "First@Example.com ", "password": "passw0rd1",
	}, "")
	if rec.Code != 200 {
		t.Fatalf("signup: got %d: %s", rec.Code, rec.Body.String())
	}
	var parsed struct {
		OK   bool `json:"ok"`
		User struct {
			ID    string `json:"id"`
			Email string `json:"email"`
			Role  string `json:"role"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatal(err)
	}
	if !parsed.OK || parsed.User.Role != "admin" {
		t.Fatalf("first signup should be admin, got %+v", parsed)
	}
	if parsed.User.Email != "first@example.com" {
		t.Fatalf("email not normalized: %q", parsed.User.Email)
	}
	// session cookie set
	var cookie *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == config.SessionCookieName {
			cookie = c
		}
	}
	if cookie == nil || cookie.Value == "" || !cookie.HttpOnly {
		t.Fatalf("session cookie not set correctly: %+v", cookie)
	}

	// duplicate signup -> 409
	rec = doJSON(t, signup, "POST", "/api/auth/signup", map[string]string{
		"email": "first@example.com", "password": "passw0rd1",
	}, "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate signup: got %d want 409", rec.Code)
	}

	// weak password -> 400
	rec = doJSON(t, signup, "POST", "/api/auth/signup", map[string]string{
		"email": "x@y.io", "password": "short",
	}, "")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("weak password: got %d want 400", rec.Code)
	}

	// bad origin -> 403
	rec = doJSON(t, signup, "POST", "/api/auth/signup", map[string]string{
		"email": "x@y.io", "password": "passw0rd1",
	}, "https://evil.example")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("bad origin: got %d want 403", rec.Code)
	}

	// login wrong password -> 401
	rec = doJSON(t, login, "POST", "/api/auth/login", map[string]string{
		"email": "first@example.com", "password": "wrongpass1",
	}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("wrong password: got %d want 401", rec.Code)
	}

	// login ok -> 200 + cookie
	rec = doJSON(t, login, "POST", "/api/auth/login", map[string]string{
		"email": "first@example.com", "password": "passw0rd1",
	}, "")
	if rec.Code != 200 {
		t.Fatalf("login: got %d: %s", rec.Code, rec.Body.String())
	}
	for _, c := range rec.Result().Cookies() {
		if c.Name == config.SessionCookieName {
			cookie = c
		}
	}

	// me with cookie -> 200 user
	me := Me(store, cfg)
	req := httptest.NewRequest("GET", "/api/auth/me", nil)
	req.AddCookie(cookie)
	rec2 := httptest.NewRecorder()
	me.ServeHTTP(rec2, req)
	if rec2.Code != 200 || !strings.Contains(rec2.Body.String(), "first@example.com") {
		t.Fatalf("me: got %d: %s", rec2.Code, rec2.Body.String())
	}

	// logout (DELETE) clears session
	req = httptest.NewRequest("DELETE", "/api/auth/me", nil)
	req.Host = "acct.example"
	req.Header.Set("Origin", "https://acct.example")
	req.AddCookie(cookie)
	rec2 = httptest.NewRecorder()
	me.ServeHTTP(rec2, req)
	if rec2.Code != 200 {
		t.Fatalf("logout: got %d", rec2.Code)
	}
	req = httptest.NewRequest("GET", "/api/auth/me", nil)
	req.AddCookie(cookie)
	rec2 = httptest.NewRecorder()
	me.ServeHTTP(rec2, req)
	if !strings.Contains(rec2.Body.String(), `"user":null`) {
		t.Fatalf("me after logout should be null: %s", rec2.Body.String())
	}
}

func TestResultsFlow(t *testing.T) {
	store, cfg, rl := newTestEnv(t)
	signup := Signup(store, cfg, rl)

	rec := doJSON(t, signup, "POST", "/api/auth/signup", map[string]string{
		"email": "res@example.com", "password": "passw0rd1",
	}, "")
	var cookie *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == config.SessionCookieName {
			cookie = c
		}
	}

	results := middleware.RequireUser(store, config.SessionCookieName)(Results(store, cfg))
	now := time.Now().UTC().Format(time.RFC3339)
	// POST
	body := map[string]any{
		"results": []map[string]any{{
			"date": now, "score": 8, "total": 10,
			"topic": "governance", "questionIds": []int{1, 2, 3}, "missedIds": []int{2},
		}},
	}
	req := httptest.NewRequest("POST", "/api/results", jsonBody(t, body))
	req.Host = "acct.example"
	req.Header.Set("Origin", "https://acct.example")
	req.AddCookie(cookie)
	rec2 := httptest.NewRecorder()
	results.ServeHTTP(rec2, req)
	if rec2.Code != 200 {
		t.Fatalf("results POST: got %d: %s", rec2.Code, rec2.Body.String())
	}
	// GET
	req = httptest.NewRequest("GET", "/api/results", nil)
	req.AddCookie(cookie)
	rec2 = httptest.NewRecorder()
	results.ServeHTTP(rec2, req)
	if rec2.Code != 200 || !strings.Contains(rec2.Body.String(), "governance") {
		t.Fatalf("results GET: got %d: %s", rec2.Code, rec2.Body.String())
	}
	// score > total -> 400
	bodyBad := map[string]any{
		"results": []map[string]any{{"date": now, "score": 11, "total": 10}},
	}
	req = httptest.NewRequest("POST", "/api/results", jsonBody(t, bodyBad))
	req.Host = "acct.example"
	req.Header.Set("Origin", "https://acct.example")
	req.AddCookie(cookie)
	rec2 = httptest.NewRecorder()
	results.ServeHTTP(rec2, req)
	if rec2.Code != http.StatusBadRequest {
		t.Fatalf("score>total: got %d want 400", rec2.Code)
	}
	// DELETE
	req = httptest.NewRequest("DELETE", "/api/results", nil)
	req.Host = "acct.example"
	req.Header.Set("Origin", "https://acct.example")
	req.AddCookie(cookie)
	rec2 = httptest.NewRecorder()
	results.ServeHTTP(rec2, req)
	if rec2.Code != 200 {
		t.Fatalf("results DELETE: got %d", rec2.Code)
	}
	req = httptest.NewRequest("GET", "/api/results", nil)
	req.AddCookie(cookie)
	rec2 = httptest.NewRecorder()
	results.ServeHTTP(rec2, req)
	if !strings.Contains(rec2.Body.String(), `"results":[]`) && !strings.Contains(rec2.Body.String(), `"results": null`) {
		t.Fatalf("results after DELETE should be empty: %s", rec2.Body.String())
	}
}

func TestAdminAuthorization(t *testing.T) {
	store, cfg, rl := newTestEnv(t)
	// cfg.AdminEmail empty -> first user admin
	adminSignup := Signup(store, cfg, rl)
	rec := doJSON(t, adminSignup, "POST", "/api/auth/signup", map[string]string{
		"email": "admin@example.com", "password": "passw0rd1",
	}, "")
	var adminCookie *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == config.SessionCookieName {
			adminCookie = c
		}
	}
	// second user: normal user
	rec = doJSON(t, adminSignup, "POST", "/api/auth/signup", map[string]string{
		"email": "user@example.com", "password": "passw0rd1",
	}, "")
	var userCookie *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == config.SessionCookieName {
			userCookie = c
		}
	}

	admin := middleware.RequireAdmin(store, config.SessionCookieName)(AdminUsers(store, cfg))
	// no cookie -> 401
	rec2 := httptest.NewRecorder()
	admin.ServeHTTP(rec2, httptest.NewRequest("GET", "/api/admin/users", nil))
	if rec2.Code != http.StatusUnauthorized {
		t.Fatalf("admin no-cookie: got %d want 401", rec2.Code)
	}
	// user cookie -> 403
	req := httptest.NewRequest("GET", "/api/admin/users", nil)
	req.AddCookie(userCookie)
	rec2 = httptest.NewRecorder()
	admin.ServeHTTP(rec2, req)
	if rec2.Code != http.StatusForbidden {
		t.Fatalf("admin as user: got %d want 403", rec2.Code)
	}
	// admin cookie -> 200 with both users
	req = httptest.NewRequest("GET", "/api/admin/users", nil)
	req.AddCookie(adminCookie)
	rec2 = httptest.NewRecorder()
	admin.ServeHTTP(rec2, req)
	if rec2.Code != 200 || !strings.Contains(rec2.Body.String(), "user@example.com") {
		t.Fatalf("admin as admin: got %d: %s", rec2.Code, rec2.Body.String())
	}
}

func jsonBody(t *testing.T, v any) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(v); err != nil {
		t.Fatal(err)
	}
	return &buf
}
