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
	"time"

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
	os.Unsetenv("ADMIN_EMAIL") // first-user-becomes-admin depends on it being unset
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
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, r.Body)
	r.Body.Close()
	t.Logf("signup: %d -> %s", r.StatusCode, r.Header.Get("Location"))

	// 1b. login (signup does not auto-authenticate)
	req1, _ := http.NewRequest("POST", base+"/ui/login", strings.NewReader(url.Values{"email": {"e2e@test.dev"}, "password": {"passw0rd1"}}.Encode()))
	req1.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req1.Header.Set("Origin", base)
	r, err = c.Do(req1)
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, r.Body)
	r.Body.Close()
	t.Logf("login: %d -> %s set-cookie=%q", r.StatusCode, r.Header.Get("Location"), r.Header.Get("Set-Cookie"))

	// 1b-htmx. failed htmx login must return the error fragment (with the
	// 401 status); the browser-side beforeSwap shim authorizes the swap.
	// Uses a cookie-less client: a logged-in session would hit the
	// already-authenticated redirect branch instead.
	nx, _ := cookiejar.New(nil)
	nc := &http.Client{Jar: nx, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	reqX, _ := http.NewRequest("POST", base+"/ui/login", strings.NewReader(url.Values{"email": {"e2e@test.dev"}, "password": {"definitely-wrong"}}.Encode()))
	reqX.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	reqX.Header.Set("Origin", base)
	reqX.Header.Set("HX-Request", "true")
	rx, err := nc.Do(reqX)
	if err != nil {
		t.Fatal(err)
	}
	xb := readAll(rx)
	if rx.StatusCode != http.StatusUnauthorized || !strings.Contains(xb, "Invalid email or password") {
		t.Fatalf("htmx bad login: %d body=%.120s", rx.StatusCode, xb)
	}
	t.Logf("htmx bad login: %d fragment ok", rx.StatusCode)

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
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, r.Body)
	r.Body.Close()
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
		if m == nil {
			t.Fatalf("q%d: no radio", i)
		}
		fd := url.Values{"qs": {qsOf(loc)}, "choice": {m[1]}}
		req, _ := http.NewRequest("POST", base+"/ui/quiz/answer", strings.NewReader(fd.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Origin", base)
		req.Header.Set("HX-Request", "true")
		r, err = c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		frag := readAll(r)
		if hx := r.Header.Get("HX-Redirect"); hx != "" {
			t.Logf("q%d: HX-Redirect %s", i, hx)
			loc = hx
			r2, _ := c.Get(base + loc)
			io.Copy(io.Discard, r2.Body)
			r2.Body.Close()
			loc = r2.Header.Get("Location")
			if loc == "" {
				loc = hx
			}
			break
		}
		if pu := r.Header.Get("HX-Push-Url"); pu != "" {
			loc = pu
		}
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

	// InsertResult dedupes on (user_id, date) with second-precision dates;
	// quiz 2 must finish in a later second or its row is silently dropped.
	time.Sleep(1100 * time.Millisecond)

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

	// 7. analytics: learner page for the quiz taker, cohort page for admin.
	// e2e@test.dev is the first account on the fresh DB, hence admin.
	r, _ = c.Get(base + "/ui/analytics")
	b = readAll(r)
	if r.StatusCode != 200 || !strings.Contains(b, "tstat") {
		t.Fatalf("analytics: %d has-tstat=%v", r.StatusCode, strings.Contains(b, "tstat"))
	}
	t.Logf("analytics: %d weakest-shown=%v trend-bars=%d",
		r.StatusCode, strings.Contains(b, "weakest-box"), strings.Count(b, "trend-bar"))

	// 7b. second quiz, topic-filtered (governance = largest topic): answer
	// every question wrong on purpose (out-of-range choice records as a miss)
	// so a weakest topic (governance) must appear afterwards. Loop mirrors
	// step 4: re-GET the run page each round and scrape the fresh token from
	// the hidden input (HX-Push-Url is already escaped; re-parsing it with
	// Query().Get() corrupts '+' in the token).
	sreq, _ := http.NewRequest("POST", base+"/ui/quiz/start", strings.NewReader(url.Values{"topic": {"governance"}, "count": {"5"}}.Encode()))
	sreq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	sreq.Header.Set("Origin", base)
	sr2, err := c.Do(sreq)
	if err != nil {
		t.Fatal(err)
	}
	readAll(sr2)
	m := qsOf(sr2.Header.Get("Location"))
	loc2, err := url.Parse("/ui/quiz/run?qs=" + m)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; ; i++ {
		if i > 10 {
			t.Fatalf("topic quiz did not finish")
		}
		rr, _ := c.Get(base + loc2.String())
		body := readAll(rr)
		m2 := regexp.MustCompile(`name="qs" value="([^"]+)"`).FindStringSubmatch(body)
		if m2 == nil {
			t.Fatalf("topic run q%d: no qs token", i)
		}
		fd := url.Values{"qs": {m2[1]}, "choice": {"999"}}
		req2, _ := http.NewRequest("POST", base+"/ui/quiz/answer", strings.NewReader(fd.Encode()))
		req2.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req2.Header.Set("Origin", base)
		req2.Header.Set("HX-Request", "true")
		resp, err := c.Do(req2)
		if err != nil {
			t.Fatal(err)
		}
		if hx := resp.Header.Get("HX-Redirect"); hx != "" {
			readAll(resp)
			loc2, err = url.Parse(hx)
			if err != nil {
				t.Fatal(err)
			}
			t.Logf("topic q%d: finished -> %s", i, hx)
			break
		}
		if pu := resp.Header.Get("HX-Push-Url"); pu != "" {
			readAll(resp)
			loc2, err = url.Parse(pu)
			if err != nil {
				t.Fatal(err)
			}
			t.Logf("topic q%d: answered", i+1)
			continue
		}
		readAll(resp)
		t.Fatalf("topic answer q%d: no htmx header (status %d)", i, resp.StatusCode)
	}
	freq, _ := c.Get(base + loc2.String())
	fb := readAll(freq)
	t.Logf("topic finish: %d final=%q score-page=%v", freq.StatusCode, freq.Header.Get("Location"), strings.Contains(fb, "score-big"))
	ares, _ := c.Get(base + "/api/results")
	ab := readAll(ares)
	t.Logf("results after topic quiz: %s", ab)
	ca3, _ := c.Get(base + "/ui/analytics")
	b3 := readAll(ca3)
	if !strings.Contains(b3, "weakest-box") || !strings.Contains(b3, "governance") {
		t.Fatalf("analytics after topic quiz: weakest-box=%v governance=%v",
			strings.Contains(b3, "weakest-box"), strings.Contains(b3, "governance"))
	}
	t.Logf("analytics topic-drill: weakest=governance shown OK")

	ca2, err := c.Get(base + "/ui/admin/analytics")
	if err != nil {
		t.Fatal(err)
	}
	b2 := readAll(ca2)
	if ca2.StatusCode != 200 || !strings.Contains(b2, "hard-list") {
		t.Fatalf("admin analytics: %d has-hardest=%v", ca2.StatusCode, strings.Contains(b2, "hard-list"))
	}
	t.Logf("admin analytics: %d users-shown=%v", ca2.StatusCode, strings.Contains(b2, "active learners"))

	// a second (non-admin) account must be rejected from the cohort page
	jar2, _ := cookiejar.New(nil)
	c2 := &http.Client{Jar: jar2, CheckRedirect: c.CheckRedirect}
	sr, _ := http.NewRequest("POST", base+"/ui/signup", strings.NewReader(url.Values{"email": {"student2@test.dev"}, "password": {"passw0rd1"}}.Encode()))
	sr.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	sr.Header.Set("Origin", base)
	rs, err := c2.Do(sr)
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, rs.Body)
	rs.Body.Close()
	lr, _ := http.NewRequest("POST", base+"/ui/login", strings.NewReader(url.Values{"email": {"student2@test.dev"}, "password": {"passw0rd1"}}.Encode()))
	lr.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	lr.Header.Set("Origin", base)
	r2, err := c2.Do(lr)
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, r2.Body)
	r2.Body.Close()
	fa, _ := c2.Get(base + "/ui/admin/analytics")
	readAll(fa)
	if fa.StatusCode != 403 {
		t.Fatalf("non-admin analytics: %d want 403", fa.StatusCode)
	}
	t.Logf("guard: non-admin /ui/admin/analytics -> %d", fa.StatusCode)
}

func mustParse(raw string) *url.URL {
	u, _ := url.Parse(raw)
	return u
}

func qsOf(loc string) string {
	u, _ := url.Parse(loc)
	return u.Query().Get("qs")
}
