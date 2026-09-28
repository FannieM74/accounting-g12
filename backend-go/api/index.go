// Package api is the Vercel Go entrypoint (api/index.go -> Handler).
package api

import (
	"net/http"

	"github.com/FannieM74/accounting-g12/backend-go/pkg/server"
)

var handler http.Handler

func init() {
	// Vercel keeps the process warm between invocations, so build the server
	// cross-origin server once per warm instance in init().
	handler = server.New()
}

// Handler is the Vercel entrypoint.
func Handler(w http.ResponseWriter, r *http.Request) {
	handler.ServeHTTP(w, r)
}
