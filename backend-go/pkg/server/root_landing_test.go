package server

import (
	"net/http/httptest"
	"strings"
	"testing"
)

// TestRootLanding pins MORE-22: the Next.js landing was retired; the Go app
// now serves the marketing landing at / and the favicon.
func TestRootLanding(t *testing.T) {
	ts := httptest.NewServer(New())
	defer ts.Close()

	r, err := ts.Client().Get(ts.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	b := readAll(r)
	if r.StatusCode != 200 {
		t.Fatalf("root: %d", r.StatusCode)
	}
	for _, m := range []string{"hero big", "chips", "feature", "quote-card", "chart-card", "land-foot"} {
		if !strings.Contains(b, m) {
			t.Fatalf("root landing missing %q", m)
		}
	}
	// The old Next.js app must not be reachable anymore.
	if strings.Contains(b, "/_next/") {
		t.Fatal("root landing leaked Next.js assets")
	}

	fr, err := ts.Client().Get(ts.URL + "/favicon.ico")
	if err != nil {
		t.Fatal(err)
	}
	readAll(fr)
	if fr.StatusCode != 200 || fr.Header.Get("Content-Type") != "image/x-icon" {
		t.Fatalf("favicon: %d ct=%q", fr.StatusCode, fr.Header.Get("Content-Type"))
	}
}
