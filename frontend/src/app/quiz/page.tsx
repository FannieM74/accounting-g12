"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { saveQuizRecord, addMissedQuestions, recordAttempt } from "@/lib/storage";
import { dateSeed } from "@/lib/random";
import { buildQuiz } from "@/lib/quiz";
import { TOPIC_LABELS } from "@/lib/topics";
import QuestionCard from "@/components/QuestionCard";
import ProgressBar from "@/components/ProgressBar";

function QuizContent() {
  const searchParams = useSearchParams();
  const topic = searchParams.get("topic") || "";
  const section = searchParams.get("section") || "";
  const count = parseInt(searchParams.get("count") || "10");
  const returnTo = searchParams.get("returnTo") || "";

  const [seed, setSeed] = useState<number>(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [phase, setPhase] = useState<"quiz" | "review">("quiz");
  const daily = searchParams.get("daily") === "true";

  const mounted = seed !== 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeed(daily ? dateSeed() : Date.now());
  }, [daily]);

  const questions = useMemo(
    () => buildQuiz({ topic, section, count, seed }),
    [topic, section, count, seed]
  );

  const handleSelect = (optionIndex: number) => {
    if (!questions[currentIndex]) return;
    setAnswers((prev) => ({ ...prev, [questions[currentIndex].id]: optionIndex }));
  };

  const finishQuiz = () => {
    const score = questions.filter((q) => answers[q.id] === q.correctAnswer).length;
    const missed = questions.filter((q) => answers[q.id] !== q.correctAnswer).map((q) => q.id);
    addMissedQuestions(missed);
    questions.forEach((q) => recordAttempt(q.id, answers[q.id] === q.correctAnswer));
    saveQuizRecord({
      date: new Date().toISOString(),
      score,
      total: questions.length,
      topic: topic || undefined,
    });
    setPhase("review");
  };

  const goNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  useEffect(() => {
    if (phase !== "quiz") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        const idx = parseInt(e.key) - 1;
        setCurrentIndex((ci) => {
          const cur = questions[ci];
          if (cur && idx < cur.options.length) {
            setAnswers((prev) => ({ ...prev, [cur.id]: idx }));
          }
          return ci;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, questions]);

  const current = questions[currentIndex];
  const answered = Object.keys(answers).length;
  const selected = current ? (answers[current.id] ?? null) : null;
  const allAnswered = answered === questions.length && questions.length > 0;

  const score = useMemo(
    () => questions.filter((q) => answers[q.id] === q.correctAnswer).length,
    [questions, answers]
  );
  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  if (!mounted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 gap-4 px-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 gap-4 px-4">
        <p className="text-gray-500 text-lg">No questions found</p>
        <p className="text-gray-400 text-sm text-center">
          The selected topic or section has no questions yet — try another topic or start a general quiz.
        </p>
        <div className="flex gap-3">
          <Link href="/" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            Back home
          </Link>
          <Link href="/quiz?count=10" className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
            Start a 10-question quiz
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "review") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center mb-8">
            <p className="text-6xl mb-4">{pct >= 80 ? "🎉" : pct >= 60 ? "👍" : "💪"}</p>
            <h1 className={`text-3xl font-bold mb-2 text-balance ${pct >= 80 ? "text-green-600" : pct >= 60 ? "text-blue-600" : "text-yellow-600"}`}>
              {pct >= 80 ? "Excellent!" : pct >= 60 ? "Good effort!" : "Keep practicing!"}
            </h1>
            <p className="text-gray-400 text-sm mb-2">{TOPIC_LABELS[topic]} · {questions.length} questions</p>
            <div className="flex items-center justify-center gap-1 my-4">
              <span className="text-5xl font-bold text-gray-900 tabular-nums">{score}</span>
              <span className="text-2xl text-gray-400">/</span>
              <span className="text-3xl text-gray-500 tabular-nums">{questions.length}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2 max-w-xs mx-auto overflow-hidden">
              <div className={`h-full rounded-full ${pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : "bg-yellow-500"}`}
                style={{ width: `${pct}%` }} />
            </div>
            <p className="text-2xl font-bold text-gray-800 mb-6">{pct}%</p>
            <p className="sr-only" aria-live="polite">
              Quiz finished. You scored {score} out of {questions.length}, {pct} percent.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href={returnTo || "/"} className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                {returnTo ? "Back to Study" : "New Quiz"}
              </Link>
              <Link href="/results" className="px-6 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                History
              </Link>
            </div>
          </div>

          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 text-balance">Review Answers</h2>
          <div className="space-y-6">
            {questions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                selected={answers[q.id] ?? null}
                onSelect={() => {}}
                mode="review"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const topicLabel = topic ? ` · ${TOPIC_LABELS[topic]}` : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <Link href={returnTo || "/"} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 shrink-0">
            ← {returnTo ? "Back to Study" : "Quit"}
          </Link>
          <span className="text-sm text-gray-500 text-right truncate">
            {topicLabel} · {answered}/{questions.length}
          </span>
        </div>

        <ProgressBar current={currentIndex} total={questions.length} answered={answered} />

        <div className="mt-6">
          <QuestionCard question={current} selected={selected} onSelect={handleSelect} mode="quiz" />
        </div>

        <div className="flex items-center justify-between mt-6">
          <button onClick={goPrev} disabled={currentIndex === 0}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            ← Previous
          </button>
          {currentIndex < questions.length - 1 ? (
            <button onClick={goNext}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Next →
            </button>
          ) : (
            <button onClick={finishQuiz} disabled={!allAnswered}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {allAnswered ? "Finish Quiz" : `Answer all (${questions.length - answered} left)`}
            </button>
          )}
        </div>

        <div className="flex justify-center mt-4 gap-1.5">
          {questions.map((q, i) => (
            <button key={q.id} onClick={() => setCurrentIndex(i)}
              aria-label={`Go to question ${i + 1}`}
              className={`w-3 h-3 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                i === currentIndex ? "bg-blue-600 ring-2 ring-blue-300"
                : answers[q.id] !== undefined ? "bg-green-400" : "bg-gray-300"
              }`} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Loading...</p></main>}>
      <QuizContent />
    </Suspense>
  );
}
