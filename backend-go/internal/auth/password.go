package auth

import (
	"regexp"
	"strings"

	"github.com/alexedwards/argon2id"
)

// HashPassword hashes with Argon2id (PHC string embeds params, so hashes
// produced by @node-rs/argon2 in the Node build verify here and vice versa).
func HashPassword(password string) (string, error) {
	return argon2id.CreateHash(password, argon2id.DefaultParams)
}

// VerifyPassword returns false on malformed hashes like the Node wrapper.
func VerifyPassword(hash, password string) bool {
	ok, err := argon2id.ComparePasswordAndHash(password, hash)
	return err == nil && ok
}

// BurnPassword burns comparable CPU time so missing-user and bad-password
// logins take similar time (timing parity with the Node build).
func BurnPassword() {
	_, _ = argon2id.CreateHash("dummy-password-for-timing", argon2id.DefaultParams)
}

var emailRE = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`)

func NormalizeEmail(e string) string {
	return strings.ToLower(strings.TrimSpace(e))
}

func IsValidEmail(e string) bool {
	return emailRE.MatchString(e)
}

// PasswordIssue returns the same messages as the Node passwordIssue().
func PasswordIssue(pw string) string {
	if len(pw) < 8 {
		return "Password must be at least 8 characters."
	}
	if len(pw) > 200 {
		return "Password is too long."
	}
	hasLetter, hasDigit := false, false
	for _, r := range pw {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
			hasLetter = true
		case r >= '0' && r <= '9':
			hasDigit = true
		}
	}
	if !hasLetter || !hasDigit {
		return "Password must contain at least one letter and one number."
	}
	return ""
}
