"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import allQuestions from "@/lib/questions.json";
import type { Question } from "@/lib/types";
import { getQuizHistory, getMissedQuestions } from "@/lib/storage";
import { getDarkMode, setDarkMode } from "@/lib/dark";
import type { QuizRecord } from "@/lib/types";
import { TOPIC_LABELS } from "@/lib/topics";
import TopicBadge from "@/components/TopicBadge";

const qs = allQuestions as Question[];

const topicsTotal: Record<string, number> = {};
for (const q of qs) topicsTotal[q.topic] = (topicsTotal[q.topic] || 0) + 1;

const TOTAL = qs.length;
const COUNT_OPTIONS = [5, 10, 15, 20, 25, 30, 50, TOTAL];

export default function HomePage() {
  const [history, setHistory] = useState<QuizRecord[]>([]);
  const [missedCount, setMissedCount] = useState(0);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setHistory(getQuizHistory());
    setMissedCount(getMissedQuestions().length);
    setDark(getDarkMode());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    setDarkMode(next);
  };

  const bestScore = history.length > 0
    ? Math.max(...history.map((r) => Math.round((r.score / r.total) * 100)))
    : null;

  function quizHref() {
    const params = new URLSearchParams();
    if (topic) params.set("topic", topic);
    if (count !== TOTAL) params.set("count", String(count));
    return `/quiz?${params.toString()}`;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <header className="text-center mb-8 relative">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 text-balance">Accounting P1 Quiz</h1>
          <p className="text-gray-500 mt-1">Grade 12 Accounting · Paper 1 · Nov 2022–2025</p>
          <button onClick={toggleDark} className="absolute top-0 right-0 text-xl rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Toggle dark mode">
            {dark ? "☀️" : "🌙"}
          </button>
        </header>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-blue-600 tabular-nums">{qs.length}</p>
            <p className="text-xs text-gray-500 mt-1">Questions</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-green-600 tabular-nums">{history.length}</p>
            <p className="text-xs text-gray-500 mt-1">Quizzes Taken</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-purple-600 tabular-nums">
              {bestScore !== null ? `${bestScore}%` : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-1">Best Score</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Start Quiz</h2>
          {history.length === 0 && (
            <p className="text-xs text-gray-400 mb-3">
              New here? Take the 10-question quiz or the Daily Quiz, then review your mistakes under “Review”.
            </p>
          )}
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label htmlFor="topic-select" className="block text-xs font-medium text-gray-500 mb-1">Topic</label>
              <select
                id="topic-select"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="">All Topics</option>
                {Object.keys(topicsTotal).map((t) => (
                  <option key={t} value={t}>{TOPIC_LABELS[t] || t}</option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label htmlFor="count-select" className="block text-xs font-medium text-gray-500 mb-1">Questions</label>
              <select
                id="count-select"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {COUNT_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c === TOTAL ? `All (${c})` : c}</option>
                ))}
              </select>
            </div>
          </div>
          <Link
            href={quizHref()}
            className="block w-full py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Start Quiz
          </Link>
          <Link
            href="/quiz?daily=true"
            className="block w-full mt-2 py-3 rounded-lg border border-blue-300 text-blue-700 font-medium hover:bg-blue-50 transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            🏆 Daily Quiz
          </Link>
          {missedCount > 0 && (
            <Link
              href="/review"
              className="block w-full mt-2 py-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 font-medium hover:bg-amber-100 transition-colors text-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              ▶ Continue studying — review {missedCount} missed question{missedCount === 1 ? "" : "s"}
            </Link>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Topics</h2>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(topicsTotal).map(([key, cnt]) => (
              <Link
                key={key}
                href={`/quiz?topic=${key}&count=${TOTAL}`}
                className="flex flex-col items-center gap-1 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <TopicBadge topic={key} />
                <span className="text-xs text-gray-400">{cnt} questions</span>
              </Link>
            ))}
          </div>
        </div>

        <nav aria-label="Main navigation" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Link href="/search" className="text-center p-3 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            🔍 Search
          </Link>
          <Link href="/study" className="text-center p-3 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            📖 Study
          </Link>
          <Link href="/study/topics" className="text-center p-3 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            📚 Study Topics
          </Link>
          <Link href="/review" className="text-center p-3 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            ❌ Review
          </Link>
          <Link href="/bookmarks" className="text-center p-3 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            ★ Bookmarks
          </Link>
          <Link href="/flagged" className="text-center p-3 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            ❓ Flagged
          </Link>
          <Link href="/analysis" className="text-center p-3 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            📈 Analysis
          </Link>
          <Link href="/results" className="text-center p-3 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            📊 History
          </Link>
        </nav>
      </div>
    </main>
  );
}
