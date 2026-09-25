"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import studyNotes from "@/lib/study-notes.json";
import { markSectionViewed, unmarkSection, getTopicProgress, toggleStudyBookmark, isStudyBookmarked, getTopicAccuracy } from "@/lib/storage";
import { getDarkMode, setDarkMode } from "@/lib/dark";
import { TOPIC_COLORS } from "@/lib/topics";

function estimateReadingTime(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

function scrollIntoViewRespectingMotion(el: HTMLElement, block: ScrollLogicalPosition = "start") {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block });
}

export default function StudyTopicClient({ slug }: { slug: string }) {
  const topic = studyNotes.find((t) => t.slug === slug);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [viewedSections, setViewedSections] = useState<string[]>([]);
  const [dark, setDark] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setViewedSections(getTopicProgress(slug));
    setDark(getDarkMode());
    setBookmarks(new Set(studyNotes.find((t) => t.slug === slug)?.sections.filter((s) => isStudyBookmarked(s.id)).map((s) => s.id) || []));
  }, [slug]);

  useEffect(() => {
    if (!mounted || !topic) return;
    const hash = window.location.hash.replace("#", "");
    if (hash && topic.sections.find((s) => s.id === hash)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedSections((prev) => {
        const next = new Set(prev);
        next.add(hash);
        return next;
      });
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) scrollIntoViewRespectingMotion(el);
      }, 100);
    }
  }, [mounted, slug, topic]);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    setDarkMode(next);
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const navigateToSection = (direction: "prev" | "next", currentIndex: number) => {
    if (!topic) return;
    const targetIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= topic.sections.length) return;
    const target = topic.sections[targetIndex];
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.add(target.id);
      return next;
    });
    setFocusedIndex(targetIndex);
    setTimeout(() => {
      const el = document.getElementById(target.id);
      if (el) scrollIntoViewRespectingMotion(el);
    }, 100);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!topic) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, topic.sections.length - 1));
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === " " && focusedIndex >= 0) {
      e.preventDefault();
      toggleSection(topic.sections[focusedIndex].id);
    }
  }, [focusedIndex, topic]);

  useEffect(() => {
    if (!mounted) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted, handleKeyDown]);

  useEffect(() => {
    if (focusedIndex >= 0 && sectionRefs.current[focusedIndex]) {
      sectionRefs.current[focusedIndex]?.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  }, [focusedIndex]);

  if (!topic) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2 text-balance">Topic Not Found</h1>
          <Link href="/study/topics" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
            ← Back to Study Topics
          </Link>
        </div>
      </main>
    );
  }

  const progress = topic.sections.length > 0
    ? Math.round((viewedSections.length / topic.sections.length) * 100)
    : 0;

  const accuracy = mounted ? getTopicAccuracy(slug) : null;

  const expandAll = () => {
    setExpandedSections(new Set(topic.sections.map((s) => s.id)));
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  const handleComplete = (sectionId: string, sectionIndex: number) => {
    if (viewedSections.includes(sectionId)) {
      unmarkSection(slug, sectionId);
      setViewedSections((prev) => prev.filter((s) => s !== sectionId));
    } else {
      markSectionViewed(slug, sectionId);
      setViewedSections((prev) => [...prev, sectionId]);
      if (sectionIndex < topic.sections.length - 1) {
        navigateToSection("next", sectionIndex);
      }
    }
  };

  const handleBookmark = (sectionId: string) => {
    const now = toggleStudyBookmark(sectionId);
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (now) next.add(sectionId);
      else next.delete(sectionId);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link href="/study/topics" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            ← Topics
          </Link>
          <button onClick={toggleDark} className="text-xl rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Toggle dark mode">
            {dark ? "☀️" : "🌙"}
          </button>
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{topic.icon}</span>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white text-balance">{topic.title}</h1>
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${TOPIC_COLORS[topic.slug] || "bg-gray-100 text-gray-800"}`}>
              {topic.weight}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-gray-600 dark:text-gray-400">{topic.sections.length} sections · {viewedSections.length}/{topic.sections.length} completed</p>
            {accuracy && (
              <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${
                accuracy.accuracy >= 70 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                accuracy.accuracy >= 50 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              }`}>
                {accuracy.accuracy}% quiz accuracy
              </span>
            )}
          </div>
          <div className="mt-3 w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={expandAll}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Collapse All
          </button>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {topic.sections.map((section, index) => {
            const isExpanded = expandedSections.has(section.id);
            const isViewed = viewedSections.includes(section.id);
            const isBookmarked = bookmarks.has(section.id);
            const isFocused = focusedIndex === index;
            const readingTime = estimateReadingTime(section.content);

            return (
              <div
                key={section.id}
                id={section.id}
                ref={(el) => { sectionRefs.current[index] = el; }}
                className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border overflow-hidden transition-[border-color,ring] ${
                  isFocused
                    ? "border-blue-400 dark:border-blue-500 ring-2 ring-blue-100 dark:ring-blue-900/30"
                    : "border-gray-200 dark:border-slate-700"
                }`}
                style={{ contentVisibility: 'auto' }}
              >
                <button
                  onClick={() => { toggleSection(section.id); setFocusedIndex(index); }}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium text-gray-400 shrink-0 w-8">
                      {index + 1}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white break-words">
                      {section.title}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {readingTime} min
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleBookmark(section.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); handleBookmark(section.id); } }}
                      className={`text-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${isBookmarked ? "text-yellow-500" : "text-gray-300 dark:text-gray-600 hover:text-yellow-400"}`}
                      aria-label={isBookmarked ? "Remove bookmark" : "Bookmark section"}
                    >
                      {isBookmarked ? "⭐" : "☆"}
                    </span>
                    {mounted && isViewed && (
                      <span className="text-green-600 text-sm">✓</span>
                    )}
                    <span className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                      ▼
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-100 dark:border-slate-700">
                    <div className="pt-4">
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        {section.content.split("\n").map((line, i) => {
                          if (!line.trim()) return <br key={i} />;

                          if (line.startsWith("**") && line.endsWith("**")) {
                            return (
                              <p key={i} className="font-bold text-gray-900 dark:text-white mt-3 mb-1">
                                {line.replace(/\*\*/g, "")}
                              </p>
                            );
                          }

                          if (line.startsWith("- **")) {
                            const parts = line.replace("- **", "").split("**: ");
                            if (parts.length === 2) {
                              return (
                                <div key={i} className="ml-4 my-1">
                                  <span className="font-semibold text-gray-900 dark:text-white">{parts[0]}:</span>
                                  <span className="text-gray-700 dark:text-gray-300"> {parts[1].replace(/\*\*/g, "")}</span>
                                </div>
                              );
                            }
                          }

                          if (line.startsWith("- ")) {
                            return (
                              <div key={i} className="ml-4 my-1 text-gray-700 dark:text-gray-300">
                                • {line.replace("- ", "").replace(/\*\*/g, "")}
                              </div>
                            );
                          }

                          if (line.match(/^\d+\.\s+\*\*/)) {
                            const match = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*:\s*(.*)/);
                            if (match) {
                              return (
                                <div key={i} className="ml-4 my-1">
                                  <span className="font-semibold text-gray-900 dark:text-white">{match[1]}. {match[2]}:</span>
                                  <span className="text-gray-700 dark:text-gray-300"> {match[3].replace(/\*\*/g, "")}</span>
                                </div>
                              );
                            }
                          }

                          return (
                            <p key={i} className="text-gray-700 dark:text-gray-300 my-1 break-words">
                              {line.replace(/\*\*/g, "")}
                            </p>
                          );
                        })}
                      </div>

                      {section.examTip && (
                        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                          <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-400 mb-1">💡 Exam Tip</p>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300 break-words">{section.examTip}</p>
                        </div>
                      )}

                      {/* Practice Questions, Complete, Navigation */}
                      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                          <Link
                            href={`/quiz?topic=${slug}&section=${section.id}&returnTo=${encodeURIComponent(`/study/topic/${slug}#${section.id}`)}`}
                            className="inline-flex items-center justify-center sm:justify-start gap-2 px-4 py-2 rounded-lg text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors font-medium"
                          >
                            🎯 Practice Questions
                          </Link>

                          <div className="flex items-center gap-3 flex-1 justify-center">
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {mounted && isViewed ? "Marked as complete" : "Read this section?"}
                            </span>
                            <button
                              onClick={() => handleComplete(section.id, index)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                mounted && isViewed
                                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800"
                                  : "bg-blue-600 text-white hover:bg-blue-700"
                              }`}
                            >
                              {mounted && isViewed ? "✓ Completed" : "Mark as Complete"}
                            </button>
                          </div>

                          <div className="flex items-center gap-2 justify-center sm:justify-end">
                            <button
                              onClick={() => navigateToSection("prev", index)}
                              disabled={index === 0}
                              className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-slate-600 dark:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              ← Previous
                            </button>
                            <button
                              onClick={() => navigateToSection("next", index)}
                              disabled={index === topic.sections.length - 1}
                              className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-slate-600 dark:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              Next →
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <Link href="/study/topics" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
            ← Back to All Study Topics
          </Link>
        </div>
      </div>
    </div>
  );
}
