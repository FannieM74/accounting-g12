"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import allQuestions from "@/lib/questions.json";
import type { Question } from "@/lib/types";
import { getMissedQuestions, clearMissedQuestions, removeMissedQuestion } from "@/lib/storage";
import { optionLetter } from "@/lib/helpers";
import TopicBadge from "@/components/TopicBadge";
import { linkify } from "@/lib/linkify";

export default function ReviewPage() {
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const ids = getMissedQuestions();
    if (ids.length === 0) return;
    const qs = allQuestions as Question[];
    const idSet = new Set(ids);
    setQuestions(qs.filter((q) => idSet.has(q.id)));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const [cleared, setCleared] = useState(false);

  const handleClear = () => {
    clearMissedQuestions();
    setQuestions([]);
    setCleared(true);
  };

  const handleRemove = (id: number) => {
    removeMissedQuestion(id);
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4 inline-block">
          ← Home
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 text-balance">❌ Review Mistakes</h1>
          {questions.length > 0 && (
            <button onClick={handleClear}
              className="text-sm text-red-600 hover:text-red-800 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
              Clear all
            </button>
          )}
        </div>

        {questions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg mb-2">
              {cleared ? "Cleared! No mistakes to review." : "No mistakes recorded yet."}
            </p>
            <p className="text-gray-400 text-sm mb-4">
              Mistakes are automatically saved when you finish a quiz.
            </p>
            <Link href="/"
              className="inline-block px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Take a Quiz
            </Link>
          </div>
        )}

        {questions.length > 0 && (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {questions.length} question{questions.length > 1 ? "s" : ""} to review
            </p>
            <div className="space-y-4">
              {questions.map((q) => {
                return (
                  <div key={q.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 font-medium mb-2 break-words">{q.question}</p>
                        <TopicBadge topic={q.topic} />
                      </div>
                      <button onClick={() => handleRemove(q.id)}
                        className="text-gray-400 hover:text-green-600 text-sm shrink-0 mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                        ✓ Got it
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
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
