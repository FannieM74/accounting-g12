package db

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/tursodatabase/libsql-client-go/libsql"
)

// Open opens a database/sql connection. For libsql:// the auth token rides
// on the DSN as authToken=... . For file: URLs the pure-Go sqlite driver is
// used (libsql-client-go only speaks HTTP/websocket; modernc.org/sqlite is
// CGO-free so it also builds on Vercel).
func Open(databaseURL, authToken string) (*sql.DB, error) {
	if strings.HasPrefix(databaseURL, "file:") {
		handle, err := sql.Open("sqlite", strings.TrimPrefix(databaseURL, "file://"))
		if err != nil {
			return nil, err
		}
		handle.SetMaxOpenConns(4)
		handle.SetConnMaxIdleTime(5 * time.Minute)
		return handle, nil
	}
	connector, err := libsql.NewConnector(databaseURL, libsql.WithAuthToken(authToken))
	if err != nil {
		return nil, err
	}
	handle := sql.OpenDB(connector)
	handle.SetMaxOpenConns(4)
	handle.SetConnMaxIdleTime(5 * time.Minute)
	return handle, nil
}

type LibsqlStore struct {
	db *sql.DB
}

func NewLibsqlStore(handle *sql.DB) *LibsqlStore { return &LibsqlStore{db: handle} }

func (s *LibsqlStore) EnsureSchema(ctx context.Context) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'user',
			created_at INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS quiz_results (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			date TEXT NOT NULL,
			score INTEGER NOT NULL,
			total INTEGER NOT NULL,
			topic TEXT,
			section TEXT,
			daily INTEGER,
			duration_ms INTEGER,
			question_ids TEXT,
			missed_ids TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)`,
		`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,
		`CREATE INDEX IF NOT EXISTS quiz_results_user_idx ON quiz_results (user_id)`,
		`CREATE INDEX IF NOT EXISTS quiz_results_date_idx ON quiz_results (date)`,
		// one attempt per user per exact timestamp - makes result sync idempotent
		`CREATE UNIQUE INDEX IF NOT EXISTS quiz_results_user_date_uq ON quiz_results (user_id, date)`,
		// drop duplicates that may predate the unique index (keep the earliest row)
		`DELETE FROM quiz_results WHERE id NOT IN (
			SELECT MIN(id) FROM quiz_results GROUP BY user_id, date
		)`,
	}
	for _, q := range stmts {
		if _, err := s.db.ExecContext(ctx, q); err != nil {
			return fmt.Errorf("ensureSchema: %w", err)
		}
	}
	return nil
}

func (s *LibsqlStore) CountUsers(ctx context.Context) (int64, error) {
	var c int64
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&c)
	return c, err
}

func (s *LibsqlStore) CreateUser(ctx context.Context, u *User) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)`,
		u.ID, u.Email, u.PasswordHash, u.Role, u.CreatedAt.Unix())
	return err
}

const userCols = `id, email, password_hash, role, created_at`

func scanUser(row interface{ Scan(...any) error }) (*User, error) {
	var u User
	var created int64
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &created); err != nil {
		return nil, err
	}
	u.CreatedAt = time.Unix(created, 0).UTC()
	return &u, nil
}

func (s *LibsqlStore) UserByEmail(ctx context.Context, email string) (*User, error) {
	u, err := scanUser(s.db.QueryRowContext(ctx,
		`SELECT `+userCols+` FROM users WHERE email = ? LIMIT 1`, email))
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	return u, err
}

func (s *LibsqlStore) SessionUserByTokenHash(ctx context.Context, tokenHash string) (*User, *Session, error) {
	var u User
	var sess Session
	var created, expiresAt, sessCreated int64
	err := s.db.QueryRowContext(ctx,
		`SELECT u.id, u.email, u.password_hash, u.role, u.created_at,
			s.expires_at, s.created_at, s.user_id, s.id
		FROM sessions s INNER JOIN users u ON s.user_id = u.id
		WHERE s.id = ? LIMIT 1`, tokenHash).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &created,
			&expiresAt, &sessCreated, &sess.UserID, &sess.ID)
	if err == sql.ErrNoRows {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	u.CreatedAt = time.Unix(created, 0).UTC()
	sess.ID = tokenHash
	sess.ExpiresAt = time.Unix(expiresAt, 0).UTC()
	sess.CreatedAt = time.Unix(sessCreated, 0).UTC()
	return &u, &sess, nil
}

func (s *LibsqlStore) CreateSession(ctx context.Context, sess *Session) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
		sess.ID, sess.UserID, sess.ExpiresAt.Unix(), sess.CreatedAt.Unix())
	return err
}

func (s *LibsqlStore) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, tokenHash)
	return err
}

const resultCols = `id, user_id, date, score, total, topic, section, daily, duration_ms, question_ids, missed_ids`

func scanResult(row interface{ Scan(...any) error }) (*QuizResult, error) {
	var r QuizResult
	var topic, section, qids, mids sql.NullString
	var daily sql.NullInt64
	var dur sql.NullInt64
	if err := row.Scan(&r.ID, &r.UserID, &r.Date, &r.Score, &r.Total,
		&topic, &section, &daily, &dur, &qids, &mids); err != nil {
		return nil, err
	}
	if topic.Valid {
		v := topic.String
		r.Topic = &v
	}
	if section.Valid {
		v := section.String
		r.Section = &v
	}
	if daily.Valid {
		v := daily.Int64 != 0
		r.Daily = &v
	}
	if dur.Valid {
		v := int(dur.Int64)
		r.DurationMs = &v
	}
	if qids.Valid {
		v := qids.String
		r.QuestionIDs = &v
	}
	if mids.Valid {
		v := mids.String
		r.MissedIDs = &v
	}
	return &r, nil
}

func (s *LibsqlStore) ResultsByUser(ctx context.Context, userID string, limit int64) ([]QuizResult, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+resultCols+` FROM quiz_results WHERE user_id = ? ORDER BY date DESC LIMIT ?`,
		userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []QuizResult
	for rows.Next() {
		r, err := scanResult(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

func (s *LibsqlStore) AllResults(ctx context.Context) ([]QuizResult, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+resultCols+` FROM quiz_results ORDER BY date DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []QuizResult
	for rows.Next() {
		r, err := scanResult(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

func (s *LibsqlStore) InsertResult(ctx context.Context, r *QuizResult) error {
	var topic, section, qids, mids any
	var daily, dur any
	if r.Topic != nil {
		topic = *r.Topic
	}
	if r.Section != nil {
		section = *r.Section
	}
	if r.Daily != nil {
		if *r.Daily {
			daily = 1
		} else {
			daily = 0
		}
	}
	if r.DurationMs != nil {
		dur = *r.DurationMs
	}
	if r.QuestionIDs != nil {
		qids = *r.QuestionIDs
	}
	if r.MissedIDs != nil {
		mids = *r.MissedIDs
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO quiz_results
		(user_id, date, score, total, topic, section, daily, duration_ms, question_ids, missed_ids)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (user_id, date) DO NOTHING`,
		r.UserID, r.Date, r.Score, r.Total, topic, section, daily, dur, qids, mids)
	return err
}

func (s *LibsqlStore) DeleteResultsByUser(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM quiz_results WHERE user_id = ?`, userID)
	return err
}

func (s *LibsqlStore) DeleteExpiredSessions(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < ?`, time.Now().Unix())
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

func (s *LibsqlStore) DeleteResultByID(ctx context.Context, userID string, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM quiz_results WHERE user_id = ? AND id = ?`, userID, id)
	return err
}

func (s *LibsqlStore) Users(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+userCols+` FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}
