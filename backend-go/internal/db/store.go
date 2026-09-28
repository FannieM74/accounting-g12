package db

import (
	"context"
	"errors"
	"time"
)

var ErrNotFound = errors.New("not found")

type User struct {
	ID           string
	Email        string
	PasswordHash string
	Role         string
	CreatedAt    time.Time
}

type Session struct {
	ID        string // sha256 hex of the opaque token
	UserID    string
	ExpiresAt time.Time
	CreatedAt time.Time
}

type QuizResult struct {
	ID          int64
	UserID      string
	Date        string // ISO 8601 of quiz completion (stored as given)
	Score       int
	Total       int
	Topic       *string
	Section     *string
	Daily       *bool
	DurationMs  *int
	QuestionIDs *string // JSON array text
	MissedIDs   *string // JSON array text
}

// Store is the persistence surface the handlers need. Implemented by
// LibsqlStore (Turso/SQLite) and MemoryStore (tests).
type Store interface {
	EnsureSchema(ctx context.Context) error
	CountUsers(ctx context.Context) (int64, error)
	CreateUser(ctx context.Context, u *User) error
	UserByEmail(ctx context.Context, email string) (*User, error)
	SessionUserByTokenHash(ctx context.Context, tokenHash string) (*User, *Session, error)
	CreateSession(ctx context.Context, s *Session) error
	DeleteSession(ctx context.Context, tokenHash string) error
	DeleteExpiredSessions(ctx context.Context) (int64, error)
	ResultsByUser(ctx context.Context, userID string, limit int64) ([]QuizResult, error)
	AllResults(ctx context.Context) ([]QuizResult, error)
	InsertResult(ctx context.Context, r *QuizResult) error
	DeleteResultsByUser(ctx context.Context, userID string) error
	DeleteResultByID(ctx context.Context, userID string, id int64) error
	Users(ctx context.Context) ([]User, error)
}
