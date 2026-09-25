"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import allQuestions from "@/lib/questions.json";
import type { Question } from "@/lib/types";
import { getBookmarks } from "@/lib/storage";
import { optionLetter } from "@/lib/helpers";
import TopicBadge from "@/components/TopicBadge";
import { linkify } from "@/lib/linkify";

export default function BookmarksPage() {
  const [allQ, setAllQ] = useState<Question[]>([]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const ids = getBookmarks();
    const qs = allQuestions as Question[];
    const idSet = new Set(ids);
    setAllQ(qs.filter((q) => idSet.has(q.id)));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4 inline-block">
          ← Home
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 text-balance">★ Bookmarks</h1>

        {allQ.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg mb-2">No bookmarked questions yet</p>
            <p className="text-gray-400 text-sm mb-4">Star questions during the quiz to save them here</p>
            <Link
              href="/quiz"
              className="inline-block px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Start Quiz
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {allQ.map((q) => (
              <div key={q.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <TopicBadge topic={q.topic} />
                  <span className="text-xs text-gray-400">Q{q.id}</span>
                </div>
                <p className="text-sm text-gray-800 leading-relaxed break-words">{q.question}</p>
                <details className="mt-3">
                  <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
                    Show answer & explanation
                  </summary>
                  <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm font-medium text-green-800 break-words">
                      Answer: {optionLetter(q.correctAnswer)}. {q.options[q.correctAnswer]}
                    </p>
                    <p className="text-sm text-gray-600 mt-2">{linkify(q.explanation)}</p>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
