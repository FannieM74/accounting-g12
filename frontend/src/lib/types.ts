export interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  topic: string;
  section: string;
}

/**
 * Quiz attempt record (v2).
 * v1 records (date/score/total/topic) are migrated in place by storage.ts —
 * the extra fields are optional so old entries stay valid without a wipe.
 */
export interface QuizRecord {
  date: string; // ISO 8601 timestamp of quiz completion
  score: number;
  total: number;
  topic?: string; // topic slug if the quiz was filtered by topic
  section?: string; // section id if the quiz was filtered by study section
  daily?: boolean; // true for the Daily Quiz
  durationMs?: number; // wall-clock time from quiz start to finish
  questionIds?: number[]; // ids asked, in the order they were asked
  missedIds?: number[]; // ids answered incorrectly
}
