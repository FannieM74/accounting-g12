"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getQuizHistory } from "@/lib/storage";
import { TOPIC_LABELS } from "@/lib/topics";
import type { QuizRecord } from "@/lib/types";

function ResultsContent() {
  const searchParams = useSearchParams();
  const scoreParam = parseInt(searchParams.get("score") || "0");
  const totalParam = parseInt(searchParams.get("total") || "0");

  const [history, setHistory] = useState<QuizRecord[]>([]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setHistory(getQuizHistory());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const latestPct = totalParam > 0 ? Math.round((scoreParam / totalParam) * 100) : 0;

  const latestMessage = latestPct >= 80 ? "Excellent!" : latestPct >= 60 ? "Good effort!" : "Keep practicing!";

  const topicLabel = (t?: string) => TOPIC_LABELS[t || ""] || t || "";

  const today = new Date().toDateString();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4 inline-block">
          ← Home
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 text-balance">📊 Quiz History</h1>

        {totalParam > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center mb-8">
            <p className="text-5xl mb-2">{latestPct >= 80 ? "🎉" : latestPct >= 60 ? "👍" : "💪"}</p>
            <h2 className={`text-lg sm:text-xl font-bold text-balance ${latestPct >= 80 ? "text-green-600" : latestPct >= 60 ? "text-blue-600" : "text-yellow-600"}`}>
              {latestMessage}
            </h2>
            <p className="text-gray-400 text-sm mt-1">{today}</p>
            <div className="flex items-center justify-center gap-1 my-4">
              <span className="text-4xl font-bold text-gray-900 tabular-nums">{scoreParam}</span>
              <span className="text-xl text-gray-400">/</span>
              <span className="text-2xl text-gray-500 tabular-nums">{totalParam}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2 overflow-hidden max-w-xs mx-auto">
              <div className={`h-full rounded-full ${latestPct >= 80 ? "bg-green-500" : latestPct >= 60 ? "bg-blue-500" : "bg-yellow-500"}`}
                style={{ width: `${latestPct}%` }} />
            </div>
            <p className="text-xl font-bold text-gray-800">{latestPct}%</p>
          </div>
        )}

        {history.length === 0 && totalParam === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg mb-2">No quiz history yet</p>
            <p className="text-gray-400 text-sm mb-4">Complete a quiz to see your scores here</p>
            <Link href="/quiz"
              className="inline-block px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
              Start Quiz
            </Link>
          </div>
        )}

        {history.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-balance">Past Results</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {history.map((r, i) => {
                const pct = Math.round((r.score / r.total) * 100);
                return (
                  <div key={i} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`text-lg ${pct >= 80 ? "" : pct >= 60 ? "" : ""}`}>
                        {pct >= 80 ? "🟢" : pct >= 60 ? "🟡" : "🔴"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 tabular-nums">
                          {r.score}/{r.total}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {new Date(r.date).toLocaleDateString()}
                          {` · ${topicLabel(r.topic)}`}
                        </p>
                      </div>
                    </div>
                      <span className={`text-sm font-bold tabular-nums ${pct >= 80 ? "text-green-600" : pct >= 60 ? "text-blue-600" : "text-yellow-600"}`}>
                        {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <Link href="/quiz"
            className="flex-1 text-center py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            New Quiz
          </Link>
          <Link href="/"
            className="flex-1 text-center py-3 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center">Loading...</main>}>
      <ResultsContent />
    </Suspense>
  );
}
