"use client";

import type { QuizRecord } from "@/lib/types";
import allQuestions from "@/lib/questions.json";
import type { Question } from "@/lib/types";

const BOOKMARKS_KEY = "acct12-bookmarks";
const HISTORY_KEY = "acct12-history";
const MISSED_KEY = "acct12-missed";
const FLAGGED_KEY = "acct12-flagged";
const ATTEMPTS_KEY = "acct12-attempts";
const STORAGE_VERSION = 1;
const VERSION_KEY = "acct12-version";

function ensureStorageVersion(): void {
  if (typeof window === "undefined") return;
  try {
    const v = localStorage.getItem(VERSION_KEY);
    if (v !== String(STORAGE_VERSION)) {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("acct12-") && key !== VERSION_KEY) {
          localStorage.removeItem(key);
        }
      }
      localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));
    }
  } catch {}
}

// -- Bookmarks --
export function getBookmarks(): number[] {
  if (typeof window === "undefined") return [];
  ensureStorageVersion();
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function toggleBookmark(id: number): boolean {
  const bookmarks = getBookmarks();
  const idx = bookmarks.indexOf(id);
  if (idx >= 0) {
    bookmarks.splice(idx, 1);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    return false;
  } else {
    bookmarks.push(id);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    return true;
  }
}

export function isBookmarked(id: number): boolean {
  return new Set(getBookmarks()).has(id);
}

// -- Quiz History --
const HISTORY_CAP = 200;

/** v1 entries only had {date, score, total, topic?} — fill in the v2 shape. */
function normalizeRecord(r: Partial<QuizRecord>): QuizRecord {
  return {
    date: r.date ?? new Date(0).toISOString(),
    score: typeof r.score === "number" ? r.score : 0,
    total: typeof r.total === "number" ? r.total : 0,
    topic: r.topic,
    section: r.section,
    daily: r.daily,
    durationMs: r.durationMs,
    questionIds: r.questionIds,
    missedIds: r.missedIds,
  };
}

export function saveQuizRecord(record: QuizRecord): void {
  try {
    const history = getQuizHistory();
    history.unshift(record);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_CAP)));
  } catch {
    // quota exceeded or storage unavailable — history is non-critical
  }
}

export function getQuizHistory(): QuizRecord[] {
  if (typeof window === "undefined") return [];
  ensureStorageVersion();
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeRecord);
  } catch {
    return [];
  }
}

export function clearQuizHistory(): void {
  try {
    localStorage.setItem(HISTORY_KEY, "[]");
  } catch {}
}

// -- Missed Questions --
export function getMissedQuestions(): number[] {
  if (typeof window === "undefined") return [];
  ensureStorageVersion();
  try {
    return JSON.parse(localStorage.getItem(MISSED_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addMissedQuestions(ids: number[]): void {
  const missed = new Set(getMissedQuestions());
  for (const id of ids) missed.add(id);
  localStorage.setItem(MISSED_KEY, JSON.stringify(Array.from(missed)));
}

export function removeMissedQuestion(id: number): void {
  const missed = getMissedQuestions().filter((x) => x !== id);
  localStorage.setItem(MISSED_KEY, JSON.stringify(missed));
}

export function clearMissedQuestions(): void {
  localStorage.setItem(MISSED_KEY, "[]");
}

// -- Flagged Questions --
export function getFlagged(): number[] {
  if (typeof window === "undefined") return [];
  ensureStorageVersion();
  try {
    return JSON.parse(localStorage.getItem(FLAGGED_KEY) || "[]");
  } catch {
    return [];
  }
}

export function toggleFlag(id: number): boolean {
  const flagged = getFlagged();
  const idx = flagged.indexOf(id);
  if (idx >= 0) {
    flagged.splice(idx, 1);
    localStorage.setItem(FLAGGED_KEY, JSON.stringify(flagged));
    return false;
  } else {
    flagged.push(id);
    localStorage.setItem(FLAGGED_KEY, JSON.stringify(flagged));
    return true;
  }
}

export function isFlagged(id: number): boolean {
  return new Set(getFlagged()).has(id);
}

// -- Per-Question Attempt Tracking --
export function recordAttempt(id: number, correct: boolean): void {
  const attempts = getAttempts();
  if (!attempts[id]) attempts[id] = { correct: 0, incorrect: 0 };
  if (correct) attempts[id].correct++;
  else attempts[id].incorrect++;
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  } catch {}
}

export function getAttempts(): Record<number, { correct: number; incorrect: number }> {
  if (typeof window === "undefined") return {};
  ensureStorageVersion();
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function clearAttempts(): void {
  try {
    localStorage.setItem(ATTEMPTS_KEY, "{}");
  } catch {}
}

// -- Study Progress Tracking --
const STUDY_PROGRESS_KEY = "acct12-study-progress";

export function getStudyProgress(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  ensureStorageVersion();
  try {
    return JSON.parse(localStorage.getItem(STUDY_PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function markSectionViewed(topicSlug: string, sectionId: string): void {
  const progress = getStudyProgress();
  if (!progress[topicSlug]) progress[topicSlug] = [];
  if (!progress[topicSlug].includes(sectionId)) {
    progress[topicSlug].push(sectionId);
  }
  localStorage.setItem(STUDY_PROGRESS_KEY, JSON.stringify(progress));
}

export function unmarkSection(topicSlug: string, sectionId: string): void {
  const progress = getStudyProgress();
  if (progress[topicSlug]) {
    progress[topicSlug] = progress[topicSlug].filter((s) => s !== sectionId);
    localStorage.setItem(STUDY_PROGRESS_KEY, JSON.stringify(progress));
  }
}

export function getTopicProgress(topicSlug: string): string[] {
  return getStudyProgress()[topicSlug] || [];
}

export function clearStudyProgress(): void {
  localStorage.setItem(STUDY_PROGRESS_KEY, "{}");
}

// -- Study Bookmarks --
const STUDY_BOOKMARKS_KEY = "acct12-study-bookmarks";

export function getStudyBookmarks(): string[] {
  if (typeof window === "undefined") return [];
  ensureStorageVersion();
  try {
    return JSON.parse(localStorage.getItem(STUDY_BOOKMARKS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function toggleStudyBookmark(sectionId: string): boolean {
  const bookmarks = getStudyBookmarks();
  const idx = bookmarks.indexOf(sectionId);
  if (idx >= 0) {
    bookmarks.splice(idx, 1);
    localStorage.setItem(STUDY_BOOKMARKS_KEY, JSON.stringify(bookmarks));
    return false;
  } else {
    bookmarks.push(sectionId);
    localStorage.setItem(STUDY_BOOKMARKS_KEY, JSON.stringify(bookmarks));
    return true;
  }
}

export function isStudyBookmarked(sectionId: string): boolean {
  return getStudyBookmarks().includes(sectionId);
}

// -- Study Plan --
const STUDY_PLAN_KEY = "acct12-study-plan";

export function getStudyPlan(): { startDate: string; targetDate: string; days: number } | null {
  if (typeof window === "undefined") return null;
  ensureStorageVersion();
  try {
    const raw = localStorage.getItem(STUDY_PLAN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStudyPlan(days: number): void {
  const startDate = new Date().toISOString().split("T")[0];
  const targetDate = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
  localStorage.setItem(STUDY_PLAN_KEY, JSON.stringify({ startDate, targetDate, days }));
}

export function clearStudyPlan(): void {
  localStorage.setItem(STUDY_PLAN_KEY, "null");
}

export function getStudyPlanProgress(): Record<string, number> {
  if (typeof window === "undefined") return {};
  ensureStorageVersion();
  try {
    return JSON.parse(localStorage.getItem("acct12-study-plan-progress") || "{}");
  } catch {
    return {};
  }
}

export function recordStudyDayProgress(date: string, count: number): void {
  const progress = getStudyPlanProgress();
  progress[date] = count;
  localStorage.setItem("acct12-study-plan-progress", JSON.stringify(progress));
}

// -- Weakness Recommendations --
export function getTopicAccuracy(topicSlug: string): { correct: number; incorrect: number; accuracy: number } | null {
  const attempts = getAttempts();
  const qs = allQuestions as Question[];
  const topicQuestionIds = qs.filter((q) => q.topic === topicSlug).map((q) => q.id);

  let correct = 0;
  let incorrect = 0;
  for (const id of topicQuestionIds) {
    const a = attempts[id];
    if (a) {
      correct += a.correct;
      incorrect += a.incorrect;
    }
  }

  if (correct + incorrect === 0) return null;
  return { correct, incorrect, accuracy: Math.round((correct / (correct + incorrect)) * 100) };
}

