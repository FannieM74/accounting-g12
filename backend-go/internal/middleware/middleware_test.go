package middleware

import (
	"net/http"
	"testing"
)

func TestSameOrigin(t *testing.T) {
	cases := []struct {
		name   string
		origin string
		host   string
		allow  string
		want   bool
	}{
		{"empty origin", "", "acctg12-api.vercel.app", "accounting-g12.vercel.app", false},
		{"origin equals host", "https://acctg12-api.vercel.app", "acctg12-api.vercel.app", "accounting-g12.vercel.app", true},
		{"configured frontend origin", "https://accounting-g12.vercel.app", "acctg12-api.vercel.app", "accounting-g12.vercel.app", true},
		{"vercel deployment alias", "https://frontend-lac-sigma-68.vercel.app", "acctg12-api.vercel.app", "accounting-g12.vercel.app", true},
		{"vercel alias via proxy host", "https://frontend-abc123.vercel.app", "accounting-g12.vercel.app", "accounting-g12.vercel.app", true},
		{"foreign origin", "https://evil.com", "acctg12-api.vercel.app", "accounting-g12.vercel.app", false},
		{"foreign vercel origin, non-vercel host", "https://evil.vercel.app", "localhost:3000", "", false},
		{"lookalike suffix rejected", "https://notvercelapp.vercel.app.evil.com", "acctg12-api.vercel.app", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := &http.Request{Host: tc.host, Header: http.Header{}}
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			if got := SameOrigin(r, tc.allow); got != tc.want {
				t.Fatalf("SameOrigin(%q, host=%q, allow=%q) = %v, want %v", tc.origin, tc.host, tc.allow, got, tc.want)
			}
		})
	}
}
