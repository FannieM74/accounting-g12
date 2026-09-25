"use client";

import type { Question } from "@/lib/types";
import { isBookmarked, toggleBookmark, isFlagged, toggleFlag } from "@/lib/storage";
import { useState, useCallback, useEffect } from "react";
import TopicBadge from "@/components/TopicBadge";
import { linkify } from "@/lib/linkify";
import { optionLetter } from "@/lib/helpers";

interface Props {
  question: Question;
  selected: number | null;
  onSelect: (index: number) => void;
  mode: "quiz" | "review";
}

export default function QuestionCard({ question, selected, onSelect, mode }: Props) {
  const [bookmarked, setBookmarked] = useState(false);
  const [flagged, setFlagged] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setBookmarked(isBookmarked(question.id));
    setFlagged(isFlagged(question.id));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [question.id]);

  const handleBookmark = useCallback(() => {
    const now = toggleBookmark(question.id);
    setBookmarked(now);
  }, [question.id]);

  const handleFlag = useCallback(() => {
    const now = toggleFlag(question.id);
    setFlagged(now);
  }, [question.id]);

  const isCorrect = selected === question.correctAnswer;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Question {question.id}
          </span>
          <TopicBadge topic={question.topic} />
        </div>
        <div className="flex items-center gap-2">
          {mode === "review" && (
            <button
              onClick={handleFlag}
              className={`text-sm transition-colors ${flagged ? "text-red-500" : "text-gray-300 hover:text-red-400"}`}
              aria-label={flagged ? "Remove flag" : "Flag question"}
            >
              {flagged ? "⚑" : "⚐"}
            </button>
          )}
          <button
            onClick={handleBookmark}
            className={`text-lg transition-colors ${bookmarked ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"}`}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark question"}
          >
            {bookmarked ? "★" : "☆"}
          </button>
        </div>
      </div>

      <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-6 leading-relaxed text-balance">
        {question.question}
      </h2>

      <div className="space-y-3">
        {question.options.map((option, idx) => {
          let classes = "w-full text-left break-words p-4 rounded-lg border-2 transition-colors duration-200 text-sm font-medium ";

          if (mode === "review") {
            if (idx === question.correctAnswer) {
              classes += "border-green-500 bg-green-50 text-green-800 ";
            } else if (idx === selected && !isCorrect) {
              classes += "border-red-500 bg-red-50 text-red-800 ";
            } else {
              classes += "border-gray-200 bg-gray-50 text-gray-500 ";
            }
          } else {
            if (idx === selected) {
              classes += "border-blue-500 bg-blue-50 text-blue-800 ";
            } else {
              classes += "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 ";
            }
          }

          return (
            <button
              key={idx}
              onClick={() => mode === "quiz" && onSelect(idx)}
              disabled={mode === "review"}
              className={classes}
              aria-pressed={mode === "quiz" ? idx === selected : undefined}
            >
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs font-bold mr-3 shrink-0 ${
                mode === "review" && idx === question.correctAnswer
                  ? "border-green-500 bg-green-500 text-white"
                  : mode === "review" && idx === selected && !isCorrect
                  ? "border-red-500 bg-red-500 text-white"
                  : mode === "quiz" && idx === selected
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-gray-300 text-gray-500"
              }`}>
                {optionLetter(idx)}
              </span>
              <span className="break-words">{option}</span>
              {mode === "review" && idx === question.correctAnswer && (
                <span className="sr-only">(correct answer)</span>
              )}
              {mode === "review" && idx === selected && !isCorrect && (
                <span className="sr-only">(your answer)</span>
              )}
            </button>
          );
        })}
      </div>

      {mode === "review" && (
        <div className="mt-6 p-4 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-sm font-medium text-blue-900 mb-1">
            {isCorrect ? "✓ Correct" : "✗ Incorrect"}
          </p>
          <p className="text-sm text-blue-800 leading-relaxed">{linkify(question.explanation)}</p>
        </div>
      )}
    </div>
  );
}
