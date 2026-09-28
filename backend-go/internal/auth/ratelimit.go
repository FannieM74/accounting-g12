package auth

import (
	"sync"
	"time"
)

// RateLimiter is an in-memory sliding window, per serverless instance
// (same trade-off as the Node build).
type RateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

func NewRateLimiter() *RateLimiter {
	return &RateLimiter{attempts: map[string][]time.Time{}}
}

func (rl *RateLimiter) Allow(key string, max int, window time.Duration) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	arr := rl.attempts[key][:0]
	for _, t := range rl.attempts[key] {
		if now.Sub(t) < window {
			arr = append(arr, t)
		}
	}
	if len(arr) >= max {
		rl.attempts[key] = arr
		return false
	}
	rl.attempts[key] = append(arr, now)
	if len(rl.attempts) > 5000 {
		for k, v := range rl.attempts {
			fresh := false
			for _, t := range v {
				if now.Sub(t) < window {
					fresh = true
					break
				}
			}
			if !fresh {
				delete(rl.attempts, k)
			}
		}
	}
	return true
}
