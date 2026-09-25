"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import studyNotes from "@/lib/study-notes.json";
import { getTopicProgress, getStudyBookmarks, getStudyPlan, clearStudyPlan, getTopicAccuracy, setStudyPlan } from "@/lib/storage";
import { getDarkMode, setDarkMode } from "@/lib/dark";
import { TOPIC_COLORS } from "@/lib/topics";

const DAY_OPTIONS = [7, 10, 14, 21, 28, 30, 42, 60];

export default function StudyTopicsPage() {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(false);
  const [selectedDays, setSelectedDays] = useState(21);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setDark(getDarkMode());
    setBookmarks(getStudyBookmarks());
  }, []);

  useEffect(() => {
    if (!showPlanModal) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setShowPlanModal(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showPlanModal]);

  const totalSections = studyNotes.reduce((sum, t) => sum + t.sections.length, 0);

  const topics = studyNotes.map((topic) => {
    const viewed = mounted ? getTopicProgress(topic.slug) : [];
    const total = topic.sections.length;
    const progress = total > 0 ? Math.round((viewed.length / total) * 100) : 0;
    const accuracy = mounted ? getTopicAccuracy(topic.slug) : null;
    return { ...topic, viewed, viewedCount: viewed.length, totalSections: total, progress, accuracy };
  });

  const plan = mounted ? getStudyPlan() : null;
  const totalCompleted = topics.reduce((sum, t) => sum + t.viewedCount, 0);

  let planStatus: { label: string; color: string; behind: number } | null = null;
  if (plan && mounted) {
    const start = new Date(plan.startDate);
    const target = new Date(plan.targetDate);
    const today = new Date();
    const totalDays = Math.ceil((target.getTime() - start.getTime()) / 86400000);
    const elapsedDays = Math.ceil((today.getTime() - start.getTime()) / 86400000);
    const expectedProgress = totalDays > 0 ? Math.round((elapsedDays / totalDays) * totalSections) : 0;
    const behind = expectedProgress - totalCompleted;
    if (today >= target) {
      planStatus = { label: totalCompleted >= totalSections ? "Completed!" : "Time's up", color: totalCompleted >= totalSections ? "text-green-600" : "text-red-600", behind };
    } else if (behind > 0) {
      planStatus = { label: `Behind by ${behind} section${behind > 1 ? "s" : ""}`, color: "text-red-600", behind };
    } else if (behind < 0) {
      planStatus = { label: `Ahead by ${Math.abs(behind)} section${Math.abs(behind) > 1 ? "s" : ""}`, color: "text-green-600", behind };
    } else {
      planStatus = { label: "On track", color: "text-blue-600", behind: 0 };
    }
  }

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    setDarkMode(next);
  };

  const handleStartPlan = () => {
    setStudyPlan(selectedDays);
    setShowPlanModal(false);
  };

  const handleResetPlan = () => {
    clearStudyPlan();
  };

  const filteredTopics = showBookmarksOnly
    ? topics.map((t) => ({
        ...t,
        sections: t.sections.filter((s) => bookmarks.includes(s.id)),
      })).filter((t) => t.sections.length > 0)
    : topics;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            ← Home
          </Link>
          <button onClick={toggleDark} className="text-xl rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Toggle dark mode">
            {dark ? "☀️" : "🌙"}
          </button>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">📚 Study Topics</h1>
          <p className="text-gray-600 dark:text-gray-400">Study the complete Accounting P1 curriculum by domain. Track your progress as you go through each section.</p>
        </div>

        {/* Study Plan */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 mb-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3 text-balance">📅 Study Plan</h2>
          {!plan ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="days-select" className="text-sm text-gray-600 dark:text-gray-400">Duration:</label>
              <select
                id="days-select"
                value={selectedDays}
                onChange={(e) => setSelectedDays(parseInt(e.target.value))}
                className="rounded-lg border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </select>
            </div>
              <button
                onClick={() => setShowPlanModal(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Start Study Plan
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-900 dark:text-white tabular-nums">{totalCompleted}/{totalSections}</span> sections completed
                  {planStatus && (
                    <span className={`ml-2 font-medium ${planStatus.color}`}>· {planStatus.label}</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {plan.days} days · ~{Math.ceil(totalSections / plan.days)} sections/day · Target: {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(plan.targetDate))}
                </p>
              </div>
              <button
                onClick={handleResetPlan}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              >
                Reset Plan
              </button>
            </div>
          )}
        </div>

        {/* Plan Modal */}
        {showPlanModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overscroll-contain" onClick={() => setShowPlanModal(false)} role="dialog" aria-modal="true">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-2 text-balance">Start Study Plan</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                You&apos;ll study <span className="font-medium">{totalSections} sections</span> in <span className="font-medium">{selectedDays} days</span>.
                That&apos;s about <span className="font-medium">{Math.ceil(totalSections / selectedDays)} sections per day</span>.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPlanModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 dark:text-white text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartPlan}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Start
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filter */}
        {bookmarks.length > 0 && (
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                showBookmarksOnly
                  ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400"
                  : "border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800"
              }`}
            >
              ⭐ Bookmarked ({bookmarks.length})
            </button>
          </div>
        )}

        {/* Domain Overview Table */}
        <nav aria-label="Exam domains" className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700">
            <h2 className="font-semibold text-gray-900 dark:text-white text-balance">Exam Domains</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {topics.map((topic) => (
              <Link
                key={topic.slug}
                href={`/study/topic/${topic.slug}`}
                className="block px-5 py-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0 mt-0.5">{topic.icon}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white break-words">{topic.title}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-gray-500 dark:text-gray-400">{topic.totalSections} sections</span>
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${TOPIC_COLORS[topic.slug] || "bg-gray-100 text-gray-800"}`}>
                        {topic.weight}
                      </span>
                      {topic.accuracy && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          topic.accuracy.accuracy >= 70 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                          topic.accuracy.accuracy >= 50 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {topic.accuracy.accuracy}% quiz
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 justify-center">
                      <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">{topic.viewedCount}/{topic.totalSections}</span>
                      <span className="text-xs text-gray-400">-</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{topic.progress}%</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-[width]"
                    style={{ width: `${topic.progress}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </nav>

        {/* Study Sections Breakdown */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700">
            <h2 className="font-semibold text-gray-900 dark:text-white text-balance">Study Sections Breakdown</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Click any section to start studying that topic.</p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {filteredTopics.map((topic) => (
              <div key={topic.slug} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <span>{topic.icon}</span>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{topic.title}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TOPIC_COLORS[topic.slug] || "bg-gray-100 text-gray-800"}`}>
                    {topic.weight}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {topic.sections.map((section) => {
                    const isBookmarked = bookmarks.includes(section.id);
                    return (
                      <Link
                        key={section.id}
                        href={`/study/topic/${topic.slug}#${section.id}`}
                        className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          isBookmarked
                            ? "border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20"
                            : "border-gray-200 dark:border-slate-600 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-slate-700"
                        }`}
                      >
                        {isBookmarked && <span className="text-yellow-600 text-xs">⭐</span>}
                        {topic.viewed.includes(section.id) && (
                          <span className="text-green-600 text-xs">✓</span>
                        )}
                        <span className="text-gray-700 dark:text-gray-300">{section.title}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/study" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
            ← Back to Question Study Mode
          </Link>
        </div>
      </div>
    </main>
  );
}
