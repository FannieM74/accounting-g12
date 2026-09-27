import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("users_email_idx").on(t.email)]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // SHA-256 hash of the session token
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

export const quizResults = sqliteTable(
  "quiz_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // ISO 8601 of quiz completion
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    topic: text("topic"),
    section: text("section"),
    daily: integer("daily", { mode: "boolean" }),
    durationMs: integer("duration_ms"),
    questionIds: text("question_ids"), // JSON array
    missedIds: text("missed_ids"), // JSON array
  },
  (t) => [index("quiz_results_user_idx").on(t.userId), index("quiz_results_date_idx").on(t.date)]
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type QuizResultRow = typeof quizResults.$inferSelect;
