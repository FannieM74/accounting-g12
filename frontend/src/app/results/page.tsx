"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getQuizHistory, clearQuizHistory } from "@/lib/storage";
import { TOPIC_LABELS } from "@/lib/topics";
import type { QuizRecord } from "@/lib/types";

const pctOf = (r: QuizRecord) => (r.total > 0 ? Math.round((r.score / r.total) * 100) : 0);
const toneOf = (pct: number) =>
  pct >= 80
    ? { text: "text-green-600", dot: "bg-green-500", bar: "bg-green-500" }
    : pct >= 60
      ? { text: "text-blue-600", dot: "bg-blue-500", bar: "bg-blue-500" }
      : { text: "text-yellow-600", dot: "bg-yellow-500", bar: "bg-yellow-500" };

function fmtDuration(ms?: number): string {
  if (!ms || ms < 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.getTime() === 0 ? "—" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((today - that) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { weekday: "long", month: "short", day: "numeric" }
      : { weekday: "long", year: "numeric", month: "short", day: "numeric" };
  return d.toLocaleDateString([], opts);
}

function topicLabel(r: QuizRecord): string {
  if (r.daily) return "Daily Challenge";
  if (!r.topic) return "All Topics";
  return TOPIC_LABELS[r.topic] || r.topic;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 128;
  const h = 36;
  const pad = 3;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values
    .map((v, i) => `${(pad + i * step).toFixed(1)},${(h - pad - (v / 100) * (h - pad * 2)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-blue-500" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ResultsContent() {
  const [history, setHistory] = useState<QuizRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setHistory(getQuizHistory());
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const handleClear = () => {
    if (window.confirm("Delete all quiz history? This cannot be undone.")) {
      clearQuizHistory();
      setHistory([]);
    }
  };

  // history is newest-first; sparkline wants chronological order (oldest -> newest)
  const trend = history.slice(0, 20).map(pctOf).reverse();
  const avgPct =
    history.length > 0
      ? Math.round(history.reduce((sum, r) => sum + pctOf(r), 0) / history.length)
      : 0;
  const bestPct = history.length > 0 ? Math.max(...history.map(pctOf)) : 0;
  const latest = history[0];

  // group newest-first records into day buckets, preserving order
  const groups: { key: string; label: string; records: QuizRecord[] }[] = [];
  for (const r of history) {
    const key = dayKey(r.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.records.push(r);
    else groups.push({ key, label: dayLabel(r.date), records: [r] });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4 inline-block"
        >
          ← Home
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 text-balance">📊 Quiz History</h1>
          {history.length > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              Clear history
            </button>
          )}
        </div>

        {loaded && history.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg mb-2">No quiz history yet</p>
            <p className="text-gray-400 text-sm mb-4">Complete a quiz to see your scores here</p>
            <Link
              href="/quiz"
              className="inline-block px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Start Quiz
            </Link>
          </div>
        )}

        {latest && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Latest result</p>
                <p className={`text-3xl font-bold tabular-nums ${toneOf(pctOf(latest)).text}`}>
                  {pctOf(latest)}%
                </p>
                <p className="text-sm text-gray-500 mt-1 tabular-nums">
                  {latest.score}/{latest.total} · {topicLabel(latest)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                  {dayLabel(latest.date)}, {fmtTime(latest.date)}
                  {latest.durationMs ? ` · ${fmtDuration(latest.durationMs)}` : ""}
                </p>
              </div>
              {trend.length >= 2 && (
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400 mb-1">Last {trend.length} attempts</p>
                  <Sparkline values={trend} />
                </div>
              )}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-blue-600 tabular-nums">{history.length}</p>
              <p className="text-xs text-gray-500 mt-1">Quizzes Taken</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-purple-600 tabular-nums">{avgPct}%</p>
              <p className="text-xs text-gray-500 mt-1">Average</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-green-600 tabular-nums">{bestPct}%</p>
              <p className="text-xs text-gray-500 mt-1">Best Score</p>
            </div>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.key} className="mb-6" aria-label={`Results for ${g.label}`}>
            <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">
              {g.label}
              <span className="text-gray-300 font-normal"> · {g.records.length}</span>
            </h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {g.records.map((r, i) => {
                  const pct = pctOf(r);
                  const tone = toneOf(pct);
                  const dur = fmtDuration(r.durationMs);
                  return (
                    <li key={`${r.date}-${i}`} className="px-4 sm:px-5 py-3 flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {topicLabel(r)}
                        </p>
                        <p className="text-xs text-gray-400 tabular-nums">
                          {fmtTime(r.date)} · {r.score}/{r.total}
                          {dur && ` · ${dur}`}
                        </p>
                      </div>
                      <div className="w-16 shrink-0">
                        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className={`text-sm font-bold tabular-nums w-12 text-right ${tone.text}`}>
                        {pct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return <ResultsContent />;
}
