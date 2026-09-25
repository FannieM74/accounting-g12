import allQuestions from "@/lib/questions.json";
import type { Question } from "@/lib/types";
import { shuffleArray } from "@/lib/random";

export interface QuizOptions {
  topic?: string;
  section?: string;
  count?: number;
  seed: number;
  /** Override the question pool (used by tests). */
  questions?: Question[];
}

/** Shuffle a question's options deterministically, remapping correctAnswer. */
export function shuffleOptions(q: Question, seed: number): Question {
  const indices = shuffleArray(
    q.options.map((_, i) => i),
    seed
  );
  return {
    ...q,
    options: indices.map((i) => q.options[i]),
    correctAnswer: indices.indexOf(q.correctAnswer),
  };
}

/**
 * Build a quiz deterministically from a seed: same seed always produces the
 * same question order AND the same option order within every question.
 * Each question's option shuffle is derived from seed + question id so
 * per-question seeds stay unique inside one quiz.
 */
export function buildQuiz(opts: QuizOptions): Question[] {
  const source = opts.questions ?? (allQuestions as Question[]);
  let pool = source;
  if (opts.topic) pool = pool.filter((q) => q.topic === opts.topic);
  if (opts.section) pool = pool.filter((q) => q.section === opts.section);
  const shuffled = shuffleArray(pool, opts.seed);
  const count = opts.count === undefined ? shuffled.length : Math.min(opts.count, shuffled.length);
  return shuffled.slice(0, count).map((q) => shuffleOptions(q, opts.seed + q.id));
}
