package config

import (
	"net/http"
	"os"
	"strings"
	"time"
)

// Config mirrors the env vars the Node build uses. DATABASE_URL empty means
// "not configured" and the API answers 503 exactly like the Next.js routes.
type Config struct {
	DatabaseURL    string
	DatabaseToken  string
	AdminEmail     string
	FrontendOrigin string // e.g. accounting-g12.vercel.app (scheme stripped)
	SessionTTL     time.Duration
	SecureCookies  bool
}

func Load() Config {
	admin := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_EMAIL")))
	fe := strings.ToLower(strings.TrimSpace(os.Getenv("FRONTEND_ORIGIN")))
	fe = strings.TrimPrefix(strings.TrimPrefix(fe, "https://"), "http://")
	return Config{
		DatabaseURL:    strings.TrimSpace(os.Getenv("DATABASE_URL")),
		DatabaseToken:  os.Getenv("DATABASE_AUTH_TOKEN"),
		AdminEmail:     admin,
		FrontendOrigin: fe,
		SessionTTL:     30 * 24 * time.Hour,
		SecureCookies:  os.Getenv("VERCEL") != "",
	}
}

// SessionCookieName matches the Node build cookie name.
const SessionCookieName = "acct12_session"

// SessionCookie builds the session cookie with the same flags as the Node
// build: httpOnly, sameSite=lax, path=/, secure in production.
func (c Config) SessionCookie(value string, expires time.Time) *http.Cookie {
	return &http.Cookie{
		Name:     SessionCookieName,
		Value:    value,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   c.SecureCookies,
		SameSite: http.SameSiteLaxMode,
	}
}
