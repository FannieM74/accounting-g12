package db

import (
	"context"
	"sort"
	"sync"
	"time"
)

// MemoryStore is an in-memory Store for tests.
type MemoryStore struct {
	mu       sync.Mutex
	users    []User
	sessions map[string]Session
	results  []QuizResult
	nextID   int64
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{sessions: map[string]Session{}}
}

func (m *MemoryStore) EnsureSchema(ctx context.Context) error { return nil }

func (m *MemoryStore) CountUsers(ctx context.Context) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return int64(len(m.users)), nil
}

func (m *MemoryStore) CreateUser(ctx context.Context, u *User) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.users = append(m.users, *u)
	return nil
}

func (m *MemoryStore) UserByEmail(ctx context.Context, email string) (*User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.Email == email {
			cp := u
			return &cp, nil
		}
	}
	return nil, ErrNotFound
}

func (m *MemoryStore) SessionUserByTokenHash(ctx context.Context, tokenHash string) (*User, *Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, ok := m.sessions[tokenHash]
	if !ok {
		return nil, nil, ErrNotFound
	}
	if sess.ExpiresAt.Before(time.Now()) {
		delete(m.sessions, tokenHash)
		return nil, nil, ErrNotFound
	}
	for _, u := range m.users {
		if u.ID == sess.UserID {
			cp := u
			sc := sess
			return &cp, &sc, nil
		}
	}
	return nil, nil, ErrNotFound
}

func (m *MemoryStore) CreateSession(ctx context.Context, sess *Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[sess.ID] = *sess
	return nil
}

func (m *MemoryStore) DeleteSession(ctx context.Context, tokenHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, tokenHash)
	return nil
}

func (m *MemoryStore) ResultsByUser(ctx context.Context, userID string, limit int64) ([]QuizResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []QuizResult
	for _, r := range m.results {
		if r.UserID == userID {
			out = append(out, r)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date > out[j].Date })
	if int64(len(out)) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (m *MemoryStore) AllResults(ctx context.Context) ([]QuizResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := append([]QuizResult(nil), m.results...)
	sort.Slice(out, func(i, j int) bool { return out[i].Date > out[j].Date })
	return out, nil
}

func (m *MemoryStore) InsertResult(ctx context.Context, r *QuizResult) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, ex := range m.results {
		if ex.UserID == r.UserID && ex.Date == r.Date {
			return nil // ON CONFLICT DO NOTHING
		}
	}
	m.nextID++
	cp := *r
	cp.ID = m.nextID
	m.results = append(m.results, cp)
	return nil
}

func (m *MemoryStore) DeleteResultsByUser(ctx context.Context, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	var keep []QuizResult
	for _, r := range m.results {
		if r.UserID != userID {
			keep = append(keep, r)
		}
	}
	m.results = keep
	return nil
}

func (m *MemoryStore) DeleteExpiredSessions(ctx context.Context) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for id, s := range m.sessions {
		if s.ExpiresAt.Before(time.Now()) {
			delete(m.sessions, id)
			n++
		}
	}
	return n, nil
}

func (m *MemoryStore) DeleteResultByID(ctx context.Context, userID string, id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	var keep []QuizResult
	for _, r := range m.results {
		if !(r.UserID == userID && r.ID == id) {
			keep = append(keep, r)
		}
	}
	m.results = keep
	return nil
}

func (m *MemoryStore) Users(ctx context.Context) ([]User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := append([]User(nil), m.users...)
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}
