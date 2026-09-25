import { describe, it, expect } from "vitest";
import { buildQuiz, shuffleOptions } from "@/lib/quiz";
import type { Question } from "@/lib/types";

const makeQuestion = (id: number, topic = "governance", options = 4): Question => ({
  id,
  question: `Question ${id}?`,
  options: Array.from({ length: options }, (_, i) => `Option ${id}-${i}`),
  correctAnswer: 0,
  explanation: "expl",
  topic,
  section: `${topic}-s1`,
});

const pool: Question[] = [
  makeQuestion(1),
  makeQuestion(2, "cash-flow"),
  makeQuestion(3),
  makeQuestion(4, "income-statement"),
  makeQuestion(5, "cash-flow"),
];

describe("buildQuiz", () => {
  it("is fully deterministic for the same seed (order AND options)", () => {
    const a = buildQuiz({ seed: 20260925, questions: pool });
    const b = buildQuiz({ seed: 20260925, questions: pool });
    expect(a).toEqual(b);
  });

  it("shuffles options and remaps correctAnswer correctly", () => {
    const q = makeQuestion(10);
    const out = shuffleOptions(q, 123);
    expect([...out.options].sort()).toEqual([...q.options].sort());
    expect(out.options[out.correctAnswer]).toBe(q.options[q.correctAnswer]);
  });

  it("keeps every question's correct answer text identical after shuffle", () => {
    const quiz = buildQuiz({ seed: 777, questions: pool });
    for (const out of quiz) {
      const original = pool.find((q) => q.id === out.id)!;
      expect(out.options[out.correctAnswer]).toBe(original.options[original.correctAnswer]);
      expect([...out.options].sort()).toEqual([...original.options].sort());
    }
  });

  it("respects the requested count", () => {
    expect(buildQuiz({ seed: 1, count: 3, questions: pool })).toHaveLength(3);
  });

  it("clamps count to pool size", () => {
    expect(buildQuiz({ seed: 1, count: 99, questions: pool })).toHaveLength(pool.length);
  });

  it("defaults to the whole pool when count is omitted", () => {
    expect(buildQuiz({ seed: 1, questions: pool })).toHaveLength(pool.length);
  });

  it("filters by topic", () => {
    const quiz = buildQuiz({ seed: 1, topic: "cash-flow", questions: pool });
    expect(quiz).toHaveLength(2);
    expect(quiz.every((q) => q.topic === "cash-flow")).toBe(true);
  });

  it("returns [] when no questions match", () => {
    expect(buildQuiz({ seed: 1, topic: "nope", questions: pool })).toEqual([]);
  });

  it("produces different quizzes for different seeds", () => {
    const a = buildQuiz({ seed: 1, questions: pool });
    const b = buildQuiz({ seed: 2, questions: pool });
    expect(a).not.toEqual(b);
  });
});

describe("buildQuiz against the real question bank", () => {
  it("daily quiz (same date seed) is repeatable across calls", async () => {
    const { default: allQuestions } = await import("@/lib/questions.json");
    const opts = { seed: 20260925, count: 10, questions: allQuestions as Question[] };
    expect(buildQuiz(opts)).toEqual(buildQuiz(opts));
  });
});
