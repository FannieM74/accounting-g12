"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import allQuestions from "@/lib/questions.json";
import type { Question } from "@/lib/types";
import { optionLetter } from "@/lib/helpers";
import TopicBadge from "@/components/TopicBadge";
import { linkify } from "@/lib/linkify";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  const doSearch = (q: string) => {
    setQuery(q);
    clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(() => {
      setLoading(true);
      setSearched(true);
      const qs = allQuestions as Question[];
      const lower = q.toLowerCase();
      const res = qs.filter(
        (qq) =>
          qq.question.toLowerCase().includes(lower) ||
          qq.explanation.toLowerCase().includes(lower)
      );
      setResults(res);
      setLoading(false);
    }, 300);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4 inline-block">
          ← Home
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 text-balance">🔍 Search Questions</h1>
        <p className="text-gray-500 text-sm mb-6">Search questions and explanations by keyword.</p>

        <div className="relative mb-6">
          <input
            id="search-input"
            type="text"
            value={query}
            onChange={(e) => doSearch(e.target.value)}
            placeholder="Search for anything..."
            className="w-full rounded-xl border border-gray-300 px-4 py-3 pl-10 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <label htmlFor="search-input" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-text">🔍</label>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400">No results found for &ldquo;{query}&rdquo;</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{results.length} result{results.length !== 1 ? "s" : ""}</p>
            {results.map((q) => {
              return (
                <div key={q.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <p className="text-gray-900 font-medium mb-2">{q.question}</p>
                  <TopicBadge topic={q.topic} />
                  <div className="mt-3 space-y-2">
                    {q.options.map((opt, i) => (
                      <div key={i} className={`p-2.5 rounded-lg text-sm ${
                        i === q.correctAnswer
                          ? "bg-green-50 border border-green-200 text-green-800"
                          : "bg-gray-50 border border-gray-200 text-gray-700"
                      }`}>
                        <span className="font-medium mr-2">{optionLetter(i)}.</span>
                        {opt}
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
        )}
      </div>
    </main>
  );
}
