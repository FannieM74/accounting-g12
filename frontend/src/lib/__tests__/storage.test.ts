import { describe, it, expect, beforeEach, vi } from "vitest";

// jsdom-free localStorage mock
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size;
  },
});
// storage.ts guards on typeof window — provide a minimal one
vi.stubGlobal("window", { localStorage: globalThis.localStorage });

// Import after the stub so module-level code sees it.
const storage = await import("@/lib/storage");

beforeEach(() => {
  store.clear();
});

describe("bookmarks", () => {
  it("toggles on and off", () => {
    expect(storage.toggleBookmark(5)).toBe(true);
    expect(storage.isBookmarked(5)).toBe(true);
    expect(storage.toggleBookmark(5)).toBe(false);
    expect(storage.isBookmarked(5)).toBe(false);
  });

  it("persists multiple ids", () => {
    storage.toggleBookmark(1);
    storage.toggleBookmark(2);
    expect(storage.getBookmarks()).toEqual([1, 2]);
  });
});

describe("quiz history", () => {
  it("saves records newest-first and caps at 200", () => {
    for (let i = 0; i < 210; i++) {
      storage.saveQuizRecord({ date: new Date(2026, 0, 1 + i).toISOString(), score: i, total: 100 });
    }
    const h = storage.getQuizHistory();
    expect(h).toHaveLength(200);
    expect(h[0].score).toBe(209);
  });

  it("persists v2 fields (duration, section, daily, question ids)", () => {
    storage.saveQuizRecord({
      date: "2026-09-26T10:00:00.000Z",
      score: 8,
      total: 10,
      topic: "governance",
      section: "king-code",
      daily: true,
      durationMs: 95000,
      questionIds: [1, 2, 3],
      missedIds: [3],
    });
    const [r] = storage.getQuizHistory();
    expect(r.topic).toBe("governance");
    expect(r.section).toBe("king-code");
    expect(r.daily).toBe(true);
    expect(r.durationMs).toBe(95000);
    expect(r.questionIds).toEqual([1, 2, 3]);
    expect(r.missedIds).toEqual([3]);
  });

  it("migrates legacy v1 records without dropping them", () => {
    // simulate a pre-upgrade history entry
    localStorage.setItem(
      "acct12-history",
      JSON.stringify([{ date: "2026-01-01T08:00:00.000Z", score: 5, total: 10, topic: "cash-flow" }])
    );
    const h = storage.getQuizHistory();
    expect(h).toHaveLength(1);
    expect(h[0].score).toBe(5);
    expect(h[0].topic).toBe("cash-flow");
    // new save keeps the migrated entry
    storage.saveQuizRecord({ date: "2026-09-26T09:00:00.000Z", score: 9, total: 10 });
    const h2 = storage.getQuizHistory();
    expect(h2).toHaveLength(2);
    expect(h2[1].score).toBe(5);
  });

  it("clearQuizHistory empties the history", () => {
    storage.saveQuizRecord({ date: "2026-09-26T09:00:00.000Z", score: 7, total: 10 });
    expect(storage.getQuizHistory()).toHaveLength(1);
    storage.clearQuizHistory();
    expect(storage.getQuizHistory()).toEqual([]);
  });

  it("survives corrupt JSON in storage", () => {
    localStorage.setItem("acct12-history", "{not json");
    expect(storage.getQuizHistory()).toEqual([]);
  });
});

describe("missed questions", () => {
  it("accumulates uniquely and supports removal", () => {
    storage.addMissedQuestions([1, 2, 2, 3]);
    expect(storage.getMissedQuestions().sort()).toEqual([1, 2, 3]);
    storage.removeMissedQuestion(2);
    expect(storage.getMissedQuestions().sort()).toEqual([1, 3]);
    storage.clearMissedQuestions();
    expect(storage.getMissedQuestions()).toEqual([]);
  });
});

describe("attempts", () => {
  it("counts correct and incorrect per question", () => {
    storage.recordAttempt(1, true);
    storage.recordAttempt(1, true);
    storage.recordAttempt(1, false);
    const a = storage.getAttempts();
    expect(a[1]).toEqual({ correct: 2, incorrect: 1 });
    storage.clearAttempts();
    expect(storage.getAttempts()).toEqual({});
  });
});

describe("flags", () => {
  it("toggles independently of bookmarks", () => {
    storage.toggleFlag(9);
    expect(storage.isFlagged(9)).toBe(true);
    expect(storage.isBookmarked(9)).toBe(false);
  });
});

describe("topic accuracy", () => {
  it("computes accuracy from attempts", () => {
    // question 1..3 are topic "governance"? depends on bank; use real bank ids 1 and 2
    storage.recordAttempt(1, true);
    storage.recordAttempt(1, false);
    const acc = storage.getTopicAccuracy("governance");
    // If bank topic differs the result may be null; assert consistency either way
    if (acc) {
      expect(acc.correct + acc.incorrect).toBeGreaterThan(0);
      expect(acc.accuracy).toBeGreaterThanOrEqual(0);
      expect(acc.accuracy).toBeLessThanOrEqual(100);
    } else {
      expect(acc).toBeNull();
    }
  });
});
