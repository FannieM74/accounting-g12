"use client";

import { useState } from "react";
import Link from "next/link";
import allQuestions from "@/lib/questions.json";
import type { Question } from "@/lib/types";
import { TOPIC_LABELS } from "@/lib/topics";
import TopicBadge from "@/components/TopicBadge";
import { linkify } from "@/lib/linkify";
import { optionLetter } from "@/lib/helpers";

const qs = allQuestions as Question[];

const topicsList = [...new Set(qs.map((q) => q.topic))];

export default function StudyPage() {
  const [selectedTopic, setSelectedTopic] = useState("");

  const filtered = selectedTopic ? qs.filter((q) => q.topic === selectedTopic) : qs;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4 inline-block">
          ← Home
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 text-balance">📖 Study Mode</h1>
            <p className="text-sm text-gray-500 mt-1">Study by reviewing questions with answers shown.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/study/topics" className="text-sm px-3 py-2 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors whitespace-nowrap">
              📚 Study Topics
            </Link>
            <select value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full sm:w-auto rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Topics</option>
              {topicsList.map((t) => (
                <option key={t} value={t}>{TOPIC_LABELS[t] || t}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-4"><span className="tabular-nums">{filtered.length}</span> question{filtered.length !== 1 ? "s" : ""}</p>

        <div className="space-y-4">
          {filtered.map((q) => {
            return (
              <div key={q.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5" style={{ contentVisibility: 'auto' }}>
                <p className="text-gray-900 font-medium mb-2 break-words">{q.question}</p>
                <div className="flex items-center gap-2 mb-3">
                  <TopicBadge topic={q.topic} />
                </div>
                <div className="space-y-2">
                  {q.options.map((opt, i) => (
                    <div key={i} className={`p-2.5 rounded-lg text-sm ${
                      i === q.correctAnswer
                        ? "bg-green-50 border border-green-200 text-green-800 font-medium"
                        : "bg-gray-50 border border-gray-200 text-gray-700"
                    }`}>
                      <span className="font-medium mr-2 shrink-0">{optionLetter(i)}.</span>
                      <span className="break-words">{opt}</span>
                      {i === q.correctAnswer && (
                        <span className="ml-2 text-xs text-green-600 shrink-0">✓ Correct</span>
                      )}
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
      </div>
    </main>
  );
}
