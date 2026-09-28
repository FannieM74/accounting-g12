// Package quiz implements the server-rendered quiz flow: signed stateless
// quiz-session tokens, topic picking, question-by-question answering with
// PRG, server-side grading, and result rows in the shared quiz_results format.
package quiz

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

//go:embed data/questions.json
var questionsJSON []byte

// QuizState is the full mutable state of one running quiz. It is serialized
// to JSON, HMAC-signed, and carried by the client between requests.
type QuizState struct {
	Topic     string      `json:"topic"`   // topic key, "" = all topics
	Paper     string      `json:"paper"`   // "1" for now (future-proofing)
	IDs       []int64     `json:"ids"`     // question ids in quiz order
	Perms     [][]int     `json:"perms"`   // per-question option permutation
	Idx       int         `json:"idx"`     // current question position
	Answers   map[int]int `json:"answers"` // question id -> displayed position chosen
	StartedAt int64       `json:"started"`
	Saved     bool        `json:"saved"` // grade+persist already done
}

// SignedToken is the encoded quiz state ("payload.signature", base64url).
type SignedToken string

const maxTokenBytes = 24 << 10 // 24 KB ceiling on state tokens

// permOf builds a deterministic option permutation for (id, seed).
func permOf(id int64, seed uint64, n int) []int {
	rng := newSplitMix64(seed ^ uint64(id))
	perm := make([]int, n)
	for i := range perm {
		perm[i] = i
	}
	for i := n - 1; i > 0; i-- { // Fisher-Yates
		j := int(rng.next() % uint64(i+1))
		perm[i], perm[j] = perm[j], perm[i]
	}
	return perm
}

// splitMix64 is a tiny deterministic PRNG (no seeding pitfalls).
type splitMix64 struct{ s uint64 }

func newSplitMix64(seed uint64) *splitMix64 { return &splitMix64{s: seed} }

func (r *splitMix64) next() uint64 {
	r.s += 0x9e3779b97f4a7c15
	z := r.s
	z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9
	z = (z ^ (z >> 27)) * 0x94d049bb133111eb
	return z ^ (z >> 31)
}

// newSeed returns a cryptographically random session seed.
func newSeed() (uint64, error) {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return 0, err
	}
	return binary.LittleEndian.Uint64(b[:]), nil
}

// Encode signs and serializes state.
func (s *QuizState) Encode(key []byte) (SignedToken, error) {
	payload, err := json.Marshal(s)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(payload)
	sig := mac.Sum(nil)
	var b strings.Builder
	b.WriteString(base64.RawURLEncoding.EncodeToString(payload))
	b.WriteByte('.')
	b.WriteString(base64.RawURLEncoding.EncodeToString(sig))
	return SignedToken(b.String()), nil
}

// Decode verifies the signature and parses state.
func DecodeToken(tok SignedToken, key []byte) (*QuizState, error) {
	parts := strings.SplitN(string(tok), ".", 2)
	if len(parts) != 2 {
		return nil, errors.New("malformed quiz token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, errors.New("bad token payload")
	}
	if len(payload) > maxTokenBytes {
		return nil, errors.New("token too large")
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, errors.New("bad token signature")
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(payload)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return nil, errors.New("signature mismatch")
	}
	var s QuizState
	if err := json.Unmarshal(payload, &s); err != nil {
		return nil, errors.New("bad state json")
	}
	if s.StartedAt <= 0 || time.Since(time.Unix(s.StartedAt, 0)) > 24*time.Hour {
		return nil, errors.New("quiz session expired")
	}
	return &s, nil
}

// Question is the subset of questions.json used by the quiz UI.
type Question struct {
	ID            int64    `json:"id"`
	Question      string   `json:"question"`
	Options       []string `json:"options"`
	CorrectAnswer int      `json:"correctAnswer"`
	Explanation   string   `json:"explanation"`
	Topic         string   `json:"topic"`
	Section       string   `json:"section"`
}

// Bank is the embedded question bank with a topic index.
type Bank struct {
	Qs      []Question
	byID    map[int64]*Question
	byTopic map[string][]int64
}

// LoadBankEmbedded parses the questions.json embedded in this package.
func LoadBankEmbedded() (*Bank, error) { return LoadBank(questionsJSON) }

// LoadBank parses the embedded questions.json.
func LoadBank(data []byte) (*Bank, error) {
	var qs []Question
	if err := json.Unmarshal(data, &qs); err != nil {
		return nil, fmt.Errorf("parse questions: %w", err)
	}
	b := &Bank{Qs: qs, byID: make(map[int64]*Question, len(qs)), byTopic: map[string][]int64{}}
	for i := range qs {
		q := &qs[i]
		if q.ID <= 0 || len(q.Options) < 2 || q.CorrectAnswer < 0 || q.CorrectAnswer >= len(q.Options) {
			return nil, fmt.Errorf("question %d invalid", q.ID)
		}
		b.byID[q.ID] = q
		b.byTopic[q.Topic] = append(b.byTopic[q.Topic], q.ID)
	}
	return b, nil
}

// ByID returns a question or nil.
func (b *Bank) ByID(id int64) *Question { return b.byID[id] }

// PermOf exposes the deterministic option permutation for a question under a
// session seed (used by the renderer to display shuffled options).
func (b *Bank) PermOf(id int64, seed uint64) []int {
	if q := b.byID[id]; q != nil {
		return permOf(id, seed, len(q.Options))
	}
	return nil
}

// TopicCount is one row of the topic picker.
type TopicCount struct {
	Key   string
	Count int
}

// Topics lists topic keys with counts (sorted by key).
func (b *Bank) Topics() []TopicCount {
	out := make([]TopicCount, 0, len(b.byTopic))
	for k, ids := range b.byTopic {
		out = append(out, TopicCount{Key: k, Count: len(ids)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

// Pick chooses up to n question ids for a topic ("" = all), shuffled.
func (b *Bank) Pick(topic string, n int, seed uint64) []int64 {
	pool, ok := b.byTopic[topic]
	if !ok || len(pool) == 0 {
		pool = make([]int64, 0, len(b.Qs))
		for _, q := range b.Qs {
			pool = append(pool, q.ID)
		}
	}
	rng := newSplitMix64(seed)
	shuffled := make([]int64, len(pool))
	copy(shuffled, pool)
	for i := len(shuffled) - 1; i > 0; i-- {
		j := int(rng.next() % uint64(i+1))
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	}
	if n > 0 && n < len(shuffled) {
		shuffled = shuffled[:n]
	}
	return shuffled
}

// GradeResult is the outcome of grading one quiz.
type GradeResult struct {
	Score     int
	Total     int
	MissedIDs []int64
	Rows      []GradeRow
}

// GradeRow is the per-question review shown on the score screen.
type GradeRow struct {
	Question    *Question
	Chosen      string // displayed option text, "" if skipped
	CorrectText string
	Correct     bool
}

// Grade scores the quiz against the bank.
func (b *Bank) Grade(s *QuizState) GradeResult {
	res := GradeResult{Total: len(s.IDs)}
	for _, id := range s.IDs {
		q := b.ByID(id)
		if q == nil {
			continue
		}
		perm := permOf(id, uint64(s.StartedAt), len(q.Options))
		row := GradeRow{Question: q, CorrectText: q.Options[q.CorrectAnswer]}
		if shown, ok := s.Answers[int(id)]; ok && shown >= 0 && shown < len(perm) {
			row.Chosen = q.Options[perm[shown]]
			if perm[shown] == q.CorrectAnswer {
				res.Score++
			} else {
				res.MissedIDs = append(res.MissedIDs, id)
			}
		} else {
			res.MissedIDs = append(res.MissedIDs, id)
		}
		res.Rows = append(res.Rows, row)
	}
	return res
}
