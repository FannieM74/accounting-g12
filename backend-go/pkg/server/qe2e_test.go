package server

import (
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func readAll(r *http.Response) string {
	defer r.Body.Close()
	b, _ := io.ReadAll(r.Body)
	return string(b)
}

func TestQuizFlowE2E(t *testing.T) {
	os.Setenv("DATABASE_URL", "file:/tmp/qe2e.db")
	os.Unsetenv("VERCEL")
	os.Setenv("FRONTEND_ORIGIN", "")
	ts := httptest.NewServer(New())
	defer ts.Close()
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	base := ts.URL

	// 1. signup via JSON API (creates user + session cookie)
	req0, _ := http.NewRequest("POST", base+"/ui/signup", strings.NewReader(url.Values{"email": {"e2e@test.dev"}, "password": {"passw0rd1"}}.Encode()))
	req0.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req0.Header.Set("Origin", base)
	r, err := c.Do(req0)
	if err != nil { t.Fatal(err) }
	io.Copy(io.Discard, r.Body); r.Body.Close()
	t.Logf("signup: %d -> %s", r.StatusCode, r.Header.Get("Location"))

	// 1b. login (signup does not auto-authenticate)
	req1, _ := http.NewRequest("POST", base+"/ui/login", strings.NewReader(url.Values{"email": {"e2e@test.dev"}, "password": {"passw0rd1"}}.Encode()))
	req1.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req1.Header.Set("Origin", base)
	r, err = c.Do(req1)
	if err != nil { t.Fatal(err) }
	io.Copy(io.Discard, r.Body); r.Body.Close()
	t.Logf("login: %d -> %s set-cookie=%q", r.StatusCode, r.Header.Get("Location"), r.Header.Get("Set-Cookie"))

	// 1c. probe session via JSON /api/auth/me and /ui/
	r, _ = c.Get(base + "/api/auth/me")
	me := readAll(r)
	t.Logf("me: %d body=%.120s", r.StatusCode, me)
	r, _ = c.Get(base + "/ui/")
	home := readAll(r)
	t.Logf("home: %d has-nav-user=%v", r.StatusCode, strings.Contains(home, "nav-user"))
	for _, ck := range jar.Cookies(mustParse(base)) {
		t.Logf("cookie: %s len=%d", ck.Name, len(ck.Value))
	}

	// 2. picker
	r, _ = c.Get(base + "/ui/quiz")
	b := readAll(r)
	if !strings.Contains(b, "/ui/quiz/start") {
		t.Fatalf("picker missing form; status=%d body[:600]=%q", r.StatusCode, b[:min(600, len(b))])
	}
	t.Logf("picker: %d has-form=%v topics-shown=%v", r.StatusCode, strings.Contains(b, "/ui/quiz/start"), strings.Contains(b, "<option"))

	// 3. start (Origin needed for SameOrigin)
	fd := url.Values{"topic": {""}, "count": {"5"}}
	req, _ := http.NewRequest("POST", base+"/ui/quiz/start", strings.NewReader(fd.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Origin", base)
	r, err = c.Do(req)
	if err != nil { t.Fatal(err) }
	io.Copy(io.Discard, r.Body); r.Body.Close()
	loc := r.Header.Get("Location")
	if r.StatusCode != 303 || !strings.HasPrefix(loc, "/ui/quiz/run?qs=") {
		t.Fatalf("start: %d loc=%q", r.StatusCode, loc)
	}
	t.Logf("start: %d -> run", r.StatusCode)

	// 4. answer loop (htmx fragment mode)
	for i := 0; i < 5; i++ {
		r, _ = c.Get(base + loc)
		b = readAll(r)
		if r.StatusCode != 200 {
			t.Fatalf("run q%d: %d", i, r.StatusCode)
		}
		m := regexp.MustCompile(`name="choice" value="(\d+)"`).FindStringSubmatch(b)
		if m == nil { t.Fatalf("q%d: no radio", i) }
		fd := url.Values{"qs": {qsOf(loc)}, "choice": {m[1]}}
		req, _ := http.NewRequest("POST", base+"/ui/quiz/answer", strings.NewReader(fd.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Origin", base)
		req.Header.Set("HX-Request", "true")
		r, err = c.Do(req)
		if err != nil { t.Fatal(err) }
		frag := readAll(r)
		if hx := r.Header.Get("HX-Redirect"); hx != "" {
			t.Logf("q%d: HX-Redirect %s", i, hx)
			loc = hx
			r2, _ := c.Get(base + loc)
			io.Copy(io.Discard, r2.Body); r2.Body.Close()
			loc = r2.Header.Get("Location")
			if loc == "" { loc = hx }
			break
		}
		if pu := r.Header.Get("HX-Push-Url"); pu != "" { loc = pu }
		_ = frag
	}
	t.Logf("final loc: %s", loc)

	// 5. score
	r, _ = c.Get(base + loc)
	b = readAll(r)
	if r.StatusCode != 200 || !strings.Contains(b, "score-big") {
		t.Fatalf("score: %d has-score=%v", r.StatusCode, strings.Contains(b, "score-big"))
	}
	hasReview := strings.Contains(b, "review ok") || strings.Contains(b, "review miss")
	t.Logf("score: %d review=%v pct-shown=%v", r.StatusCode, hasReview, strings.Contains(b, "%</span>"))

	// 6. DB row: pull the user's results via the JSON API and verify the
	// analytics inputs (question_ids + missed_ids) were persisted.
	r, _ = c.Get(base + "/api/results")
	resJSON := readAll(r)
	t.Logf("api/results: %d body=%.260s", r.StatusCode, resJSON)
	if !strings.Contains(resJSON, "questionIds") && !strings.Contains(resJSON, "question_ids") {
		t.Fatalf("results missing question ids: %s", resJSON)
	}
	if !strings.Contains(resJSON, "missed") {
		t.Fatalf("results missing missed ids: %s", resJSON)
	}
	if _, err := os.Stat("/tmp/qe2e.db"); err != nil {
		t.Fatalf("db file missing: %v", err)
	}
}

func mustParse(raw string) *url.URL {
	u, _ := url.Parse(raw)
	return u
}

func qsOf(loc string) string {
	u, _ := url.Parse(loc)
	return u.Query().Get("qs")
}

