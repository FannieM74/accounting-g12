// Command server runs the Go backend standalone (docker/local).
package main

import (
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/FannieM74/accounting-g12/backend-go/pkg/server"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	if _, err := strconv.Atoi(port); err != nil {
		port = "8080"
	}
	log.Printf("backend-go listening on :%s", port)
	if err := http.ListenAndServe(":"+port, server.New()); err != nil {
		log.Fatal(err)
	}
}
