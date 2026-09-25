"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import allQuestionsData from "@/lib/questions.json";
import type { Question } from "@/lib/types";
import { getQuizHistory, getAttempts } from "@/lib/storage";
import { TOPIC_LABELS } from "@/lib/topics";
import TopicBadge from "@/components/TopicBadge";

interface TopicAnalysis {
  key: string;
  label: string;
  totalQuestions: number;
  totalScore: number;
  totalPossible: number;
  attempts: number;
  avgPct: number;
}

interface QuestionStats {
  id: number;
  question: string;
  topic: string;
  correct: number;
  incorrect: number;
  total: number;
  pct: number;
}

function TrendChart({ history }: { history: { pct: number; date: string }[] }) {
  const w = 320;
  const h = 100;
  const pad = { top: 5, right: 5, bottom: 20, left: 5 };
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;

  if (history.length < 2) return null;

  const minPct = Math.min(...history.map((d) => d.pct));
  const maxPct = Math.max(...history.map((d) => d.pct));
  const range = Math.max(maxPct - minPct, 20);
  const bottom = Math.max(0, minPct - range * 0.1);

  const xScale = (i: number) => pad.left + (i / (history.length - 1)) * iw;
  const yScale = (v: number) => pad.top + ih - ((v - bottom) / (range * 1.2)) * ih;

  const points = history.map((d, i) => `${xScale(i)},${yScale(d.pct)}`).join(" ");

  const last = history[history.length - 1];
  const first = history[0];
  const trend = last.pct - first.pct;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Score Trend</h3>
        <span className={`text-sm font-bold ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
          {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-sm mx-auto">
        <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={points} />
        {history.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.pct)} r="3" fill={d.pct >= 80 ? "#22c55e" : d.pct >= 60 ? "#3b82f6" : "#eab308"} />
        ))}
        {[0, history.length - 1].map((i) => (
          <g key={i}>
            <text x={xScale(i)} y={h - 3} textAnchor={i === 0 ? "start" : "end"} className="text-[8px] fill-gray-400">
              {new Date(history[i].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </text>
            <text x={xScale(i)} y={yScale(history[i].pct) - 6} textAnchor={i === 0 ? "start" : "end"} className="text-[9px] font-bold fill-gray-600">
              {history[i].pct}%
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const topicsTotal: Record<string, number> = {};
for (const q of allQuestionsData as Question[]) {
  topicsTotal[q.topic] = (topicsTotal[q.topic] || 0) + 1;
}

export default function AnalysisPage() {
  const [topicAnalysis, setTopicAnalysis] = useState<TopicAnalysis[]>([]);
  const [questionStats, setQuestionStats] = useState<QuestionStats[]>([]);
  const [trendData, setTrendData] = useState<{ pct: number; date: string }[]>([]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const history = getQuizHistory();
    const attempts = getAttempts();
    const qs = allQuestionsData as Question[];

    const grouped: Record<string, { score: number; total: number; count: number }> = {};
    for (const r of history) {
      const key = r.topic || "all";
      if (!grouped[key]) grouped[key] = { score: 0, total: 0, count: 0 };
      grouped[key].score += r.score;
      grouped[key].total += r.total;
      grouped[key].count += 1;
    }
    setTopicAnalysis(
      Object.entries(grouped)
        .filter(([k]) => k !== "all")
        .map(([key, g]) => ({
          key,
          label: TOPIC_LABELS[key] || key,
          totalQuestions: topicsTotal[key] ?? 0,
          totalScore: g.score,
          totalPossible: g.total,
          attempts: g.count,
          avgPct: g.total > 0 ? Math.round((g.score / g.total) * 100) : 0,
        }))
        .sort((a, b) => a.avgPct - b.avgPct),
    );

    const attemptIds = Object.keys(attempts).map(Number);
    if (attemptIds.length > 0) {
      const qMap = new Map(qs.map((q) => [q.id, q]));
      setQuestionStats(
        attemptIds
          .map((id) => {
            const a = attempts[id];
            const q = qMap.get(id);
            const total = a.correct + a.incorrect;
            return {
              id,
              question: q?.question ?? `Question #${id}`,
              topic: q?.topic ?? "unknown",
              correct: a.correct,
              incorrect: a.incorrect,
              total,
              pct: total > 0 ? Math.round((a.correct / total) * 100) : 0,
            };
          })
          .filter((q) => q.total > 0)
          .sort((a, b) => a.pct - b.pct),
      );
    }

    setTrendData(
      [...history].reverse().map((r) => ({
        pct: Math.round((r.score / r.total) * 100),
        date: r.date,
      })),
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const weakCount = topicAnalysis.filter((a) => a.avgPct < 60).length;
  const hardQuestions = questionStats.filter(
    (q) => q.pct < 60 && q.total >= 1,
  );
  const hasTopicData = topicAnalysis.length > 0;
  const hasAttemptData = questionStats.length > 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4 inline-block">
          ← Home
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 text-balance">📈 Analysis</h1>
        <p className="text-gray-500 text-sm mb-6">
          Performance trends, topic breakdown, and specific questions to study.
        </p>

        {!hasTopicData && !hasAttemptData && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg mb-2">No quiz data yet</p>
            <p className="text-gray-400 text-sm mb-4">Complete a quiz to start tracking your progress.</p>
            <Link href="/"               className="inline-block px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Take a Quiz
            </Link>
          </div>
        )}

        {(hasTopicData || hasAttemptData) && (
          <>
            {/* Trend chart */}
            {trendData.length >= 2 && <TrendChart history={trendData} />}

            {/* Hard questions section */}
            {hardQuestions.length > 0 && (
              <div className="mb-6">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-800">
                  ⚠ <strong>{hardQuestions.length} question{hardQuestions.length > 1 ? "s" : ""}</strong> need study — accuracy below 60%.
                  Review these in <Link href="/review" className="underline font-medium">Review Mistakes</Link> or <Link href="/study" className="underline font-medium">Study Mode</Link>.
                </div>

                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 text-balance">📚 Questions to Study</h2>
                <div className="space-y-3">
                  {hardQuestions.map((q) => (
                    <div key={q.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 font-medium mb-2">{q.question}</p>
                          <TopicBadge topic={q.topic} />
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-bold tabular-nums ${q.pct < 40 ? "text-red-600" : "text-yellow-600"}`}>
                            {q.pct}%
                          </p>
                          <p className="text-xs text-gray-400 tabular-nums">{q.correct}/{q.total}</p>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2 overflow-hidden">
                        <div className={`h-full rounded-full ${q.pct < 40 ? "bg-red-500" : "bg-yellow-500"}`}
                          style={{ width: `${q.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Topic analysis */}
            {hasTopicData && (
              <>
                {weakCount > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-sm text-yellow-800">
                    ⚠ Focus on <strong>{weakCount} topic{weakCount > 1 ? "s" : ""}</strong> with scores below 60%.
                  </div>
                )}

                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 text-balance">By Topic</h2>
                <div className="space-y-4">
                  {topicAnalysis.map((a) => {
                    const barColor = a.avgPct >= 80 ? "bg-green-500" : a.avgPct >= 60 ? "bg-blue-500" : "bg-yellow-500";
                    const textColor = a.avgPct >= 80 ? "text-green-600" : a.avgPct >= 60 ? "text-blue-600" : "text-yellow-600";
                    return (
                      <div key={a.key} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <div className="flex items-center justify-between mb-3">
                          <TopicBadge topic={a.key} />
                          <span className={`text-lg font-bold ${textColor}`}>{a.avgPct}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3 overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${a.avgPct}%` }} />
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center text-xs">
                          <div>
                            <p className="text-gray-900 font-semibold tabular-nums">{a.totalScore}/{a.totalPossible}</p>
                            <p className="text-gray-400">Correct</p>
                          </div>
                          <div>
                            <p className="text-gray-900 font-semibold tabular-nums">{a.attempts}</p>
                            <p className="text-gray-400">Quizzes</p>
                          </div>
                          <div>
                            <p className="text-gray-900 font-semibold tabular-nums">{a.totalQuestions}</p>
                            <p className="text-gray-400">Questions</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Tips */}
            {(hasTopicData || hasAttemptData) && (
              <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-2 text-balance">💡 Tips</h3>
                <ul className="text-sm text-gray-600 space-y-1.5">
                  <li>• <strong>Green</strong> (≥80%): You&apos;re doing well — maintain with occasional practice.</li>
                  <li>• <strong>Blue</strong> (60–79%): Decent but room for improvement — review weak areas.</li>
                  <li>• <strong>Yellow</strong> (&lt;60%): Needs focus — spend extra time on these topics.</li>
                  <li>• Questions at the top of the &ldquo;Questions to Study&rdquo; list are your weakest — start there.</li>
                  <li>• Use <Link href="/study" className="underline">Study Mode</Link> to browse answers or <Link href="/review" className="underline">Review Mistakes</Link> to retry.</li>
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
