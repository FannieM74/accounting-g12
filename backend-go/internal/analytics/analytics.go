// Package analytics computes per-user and cohort statistics from quiz
// results. Results store question ids + missed ids; topics come from the
// question bank, so no schema changes are needed. Paper 2 support: add a
// Paper field to questions.json entries and pass a paper filter here.
package analytics

import (
	"encoding/json"
	"sort"
	"strings"

	"github.com/FannieM74/accounting-g12/backend-go/internal/db"
	"github.com/FannieM74/accounting-g12/backend-go/internal/quiz"
)

// TopicStat is one topic's struggle numbers.
type TopicStat struct {
	Topic    string `json:"topic"`
	Attempts int    `json:"attempts"` // questions seen in this topic
	Misses   int    `json:"misses"`   // questions answered wrong
	MissPct  int    `json:"missPct"`  // misses*100/attempts
}

// UserReport summarizes one student's results.
type UserReport struct {
	Attempts    int         // number of quiz results
	Questions   int         // total questions answered
	Correct     int         // total correct
	AvgPct      int         // mean score percentage across attempts
	Topics      []TopicStat // sorted by MissPct desc, then attempts desc
	Weakest     *TopicStat  // first topic with attempts>0, nil if none
	RecentPcts  []int       // last 10 attempts, oldest -> newest (trend)
	HoursLogged int         // sum of durationMs, in whole hours (floor)
}

// HardestQuestion is a cohort-level per-question miss ranking row.
type HardestQuestion struct {
	ID      int64  `json:"id"`
	Topic   string `json:"topic"`
	Misses  int    `json:"misses"`
	Seen    int    `json:"seen"` // times the question appeared in any quiz
	MissPct int    `json:"missPct"`
	Text    string `json:"text"`
}

// CohortReport summarizes all users' results (admin view).
type CohortReport struct {
	Users       int               // distinct users with >=1 attempt
	Attempts    int               // total quiz attempts
	Questions   int               // total questions answered cohort-wide
	Topics      []TopicStat       // struggle ranking
	Hardest     []HardestQuestion // top miss-ranked questions
	PerUser     []UserAttemptStat // attempts per user (participation)
	TopicCounts map[string]int    // questions per topic in the bank (for context)
}

// UserAttemptStat is one row of cohort participation.
type UserAttemptStat struct {
	Email    string `json:"email"`
	Attempts int    `json:"attempts"`
	AvgPct   int    `json:"avgPct"`
}

func idsOf(p *string) []int64 {
	if p == nil || *p == "" {
		return nil
	}
	var ids []int64
	if err := json.Unmarshal([]byte(*p), &ids); err != nil {
		return nil
	}
	return ids
}

func pctOf(n, d int) int {
	if d <= 0 {
		return 0
	}
	return n * 100 / d
}

// ComputeUserReport computes stats for one user's results (any order; recent
// trend uses row Date comparison, falling back to slice order).
func ComputeUserReport(rows []db.QuizResult, bank *quiz.Bank) *UserReport {
	rep := &UserReport{RecentPcts: []int{}}
	type acc struct{ attempts, misses int }
	byTopic := map[string]*acc{}
	// sort copies by Date so RecentPcts is chronological
	sorted := make([]db.QuizResult, len(rows))
	copy(sorted, rows)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Date < sorted[j].Date })
	for _, r := range sorted {
		rep.Attempts++
		rep.Questions += r.Total
		rep.Correct += r.Score
		rep.RecentPcts = append(rep.RecentPcts, pctOf(r.Score, r.Total))
		seen := map[int64]bool{}
		for _, id := range idsOf(r.QuestionIDs) {
			seen[id] = true
			q := bank.ByID(id)
			if q == nil {
				continue
			}
			a := byTopic[q.Topic]
			if a == nil {
				a = &acc{}
				byTopic[q.Topic] = a
			}
			a.attempts++
		}
		for _, id := range idsOf(r.MissedIDs) {
			if !seen[id] {
				// missed id without a matching question id (legacy row):
				// still count the attempt for topic coverage
				if q := bank.ByID(id); q != nil {
					a := byTopic[q.Topic]
					if a == nil {
						a = &acc{}
						byTopic[q.Topic] = a
					}
					a.attempts++
				}
			}
			if q := bank.ByID(id); q != nil {
				a := byTopic[q.Topic]
				if a == nil {
					a = &acc{}
					byTopic[q.Topic] = a
				}
				a.misses++
			}
		}
	}
	rep.AvgPct = pctOf(rep.Correct, rep.Questions)
	for t, a := range byTopic {
		rep.Topics = append(rep.Topics, TopicStat{Topic: t, Attempts: a.attempts, Misses: a.misses, MissPct: pctOf(a.misses, a.attempts)})
	}
	sort.Slice(rep.Topics, func(i, j int) bool {
		if rep.Topics[i].MissPct != rep.Topics[j].MissPct {
			return rep.Topics[i].MissPct > rep.Topics[j].MissPct
		}
		return rep.Topics[i].Attempts > rep.Topics[j].Attempts
	})
	for i := range rep.Topics {
		if rep.Topics[i].Attempts > 0 {
			rep.Weakest = &rep.Topics[i]
			break
		}
	}
	return rep
}

// ComputeCohortReport computes struggle stats across all users' results.
func ComputeCohortReport(rows []db.QuizResult, bank *quiz.Bank, emails map[string]string) *CohortReport {
	cr := &CohortReport{TopicCounts: bank.TopicCounts()}
	type acc struct{ attempts, misses int }
	byTopic := map[string]*acc{}
	type qacc struct{ seen, misses int }
	byQ := map[int64]*qacc{}
	users := map[string]bool{}
	type uacc struct{ attempts, correct, total int }
	byUser := map[string]*uacc{}
	for _, r := range rows {
		users[r.UserID] = true
		cr.Attempts++
		cr.Questions += r.Total
		ua := byUser[r.UserID]
		if ua == nil {
			ua = &uacc{}
			byUser[r.UserID] = ua
		}
		ua.attempts++
		ua.correct += r.Score
		ua.total += r.Total
		seen := map[int64]bool{}
		for _, id := range idsOf(r.QuestionIDs) {
			seen[id] = true
			if q := bank.ByID(id); q != nil {
				a := byTopic[q.Topic]
				if a == nil {
					a = &acc{}
					byTopic[q.Topic] = a
				}
				a.attempts++
				qs := byQ[id]
				if qs == nil {
					qs = &qacc{}
					byQ[id] = qs
				}
				qs.seen++
			}
		}
		for _, id := range idsOf(r.MissedIDs) {
			q := bank.ByID(id)
			if q == nil {
				continue
			}
			a := byTopic[q.Topic]
			if a == nil {
				a = &acc{}
				byTopic[q.Topic] = a
			}
			a.misses++
			if !seen[id] {
				a.attempts++ // legacy row: missed id with no question id
			}
			qs := byQ[id]
			if qs == nil {
				qs = &qacc{}
				byQ[id] = qs
			}
			qs.misses++
		}
	}
	cr.Users = len(users)
	for t, a := range byTopic {
		cr.Topics = append(cr.Topics, TopicStat{Topic: t, Attempts: a.attempts, Misses: a.misses, MissPct: pctOf(a.misses, a.attempts)})
	}
	sort.Slice(cr.Topics, func(i, j int) bool {
		if cr.Topics[i].MissPct != cr.Topics[j].MissPct {
			return cr.Topics[i].MissPct > cr.Topics[j].MissPct
		}
		return cr.Topics[i].Attempts > cr.Topics[j].Attempts
	})
	for id, qa := range byQ {
		if qa.seen == 0 {
			continue
		}
		hq := HardestQuestion{ID: id, Misses: qa.misses, Seen: qa.seen, MissPct: pctOf(qa.misses, qa.seen)}
		if q := bank.ByID(id); q != nil {
			hq.Topic = q.Topic
			hq.Text = q.Question
		}
		cr.Hardest = append(cr.Hardest, hq)
	}
	sort.Slice(cr.Hardest, func(i, j int) bool {
		if cr.Hardest[i].MissPct != cr.Hardest[j].MissPct {
			return cr.Hardest[i].MissPct > cr.Hardest[j].MissPct
		}
		return cr.Hardest[i].Misses > cr.Hardest[j].Misses
	})
	if len(cr.Hardest) > 10 {
		cr.Hardest = cr.Hardest[:10]
	}
	for uid, ua := range byUser {
		email := emails[uid]
		if email == "" {
			email = maskID(uid)
		}
		cr.PerUser = append(cr.PerUser, UserAttemptStat{Email: email, Attempts: ua.attempts, AvgPct: pctOf(ua.correct, ua.total)})
	}
	sort.Slice(cr.PerUser, func(i, j int) bool { return cr.PerUser[i].Attempts > cr.PerUser[j].Attempts })
	return cr
}

func maskID(id string) string {
	if len(id) > 6 {
		return id[:6] + "…"
	}
	return id
}

// TrimEmail shortens an email for display, keeping the local part + domain.
func TrimEmail(e string) string {
	if i := strings.Index(e, "@"); i > 12 {
		return e[:i] + "@…"
	}
	return e
}
