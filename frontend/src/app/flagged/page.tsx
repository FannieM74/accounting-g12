"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import allQuestions from "@/lib/questions.json";
import { getFlagged, toggleFlag } from "@/lib/storage";
import type { Question } from "@/lib/types";
import { optionLetter } from "@/lib/helpers";
import TopicBadge from "@/components/TopicBadge";
import { linkify } from "@/lib/linkify";

export default function FlaggedPage() {
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const ids = getFlagged();
    if (ids.length === 0) return;
    const qs = allQuestions as Question[];
    const idSet = new Set(ids);
    setQuestions(qs.filter((q) => idSet.has(q.id)));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const handleUnflag = (id: number) => {
    toggleFlag(id);
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4 inline-block">
          ← Home
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 text-balance">❓ Flagged Questions</h1>

        {questions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg mb-2">No flagged questions</p>
            <p className="text-gray-400 text-sm mb-4">
              Flag questions that seem incorrect during review to check them later.
            </p>
            <Link href="/"
              className="inline-block px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Home
            </Link>
          </div>
        )}

        {questions.length > 0 && (
          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-medium mb-2 break-words">{q.question}</p>
                    <TopicBadge topic={q.topic} />
                  </div>
                  <button onClick={() => handleUnflag(q.id)}
                    className="text-xs text-gray-400 hover:text-red-600 shrink-0 mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                    Remove flag
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {q.options.map((opt, i) => (
                    <div key={i} className={`p-2.5 rounded-lg text-sm ${
                      i === q.correctAnswer
                        ? "bg-green-50 border border-green-200 text-green-800"
                        : "bg-gray-50 border border-gray-200 text-gray-700"
                    }`}>
                      <span className="font-medium mr-2 shrink-0">{optionLetter(i)}.</span>
                      <span className="break-words">{opt}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-sm text-gray-500 bg-blue-50 rounded-lg p-3 break-words">
                  {linkify(q.explanation)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
