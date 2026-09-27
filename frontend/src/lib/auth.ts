import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { db, client } from "./db";
import { users, sessions } from "./db/schema";
import type { User } from "./db/schema";

export const SESSION_COOKIE = "acct12_session";
const SESSION_TTL_DAYS = 30;

// -- Passwords (Argon2id) --

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// -- Password strength --

export function passwordIssue(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (pw.length > 200) return "Password is too long.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
}

// -- Sessions (opaque token; only its SHA-256 is stored) --

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url"); // 256-bit
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000);
  await db.insert(sessions).values({ id: tokenHash, userId, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export type SafeUser = Pick<User, "id" | "email" | "role" | "createdAt">;

export async function getCurrentUser(): Promise<SafeUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256(token);
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, tokenHash));
    return null;
  }
  return { id: row.user.id, email: row.user.email, role: row.user.role, createdAt: row.user.createdAt };
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  }
  store.delete(SESSION_COOKIE);
}

// -- Signup / login (expects sanitized, validated input) --

const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

export async function createUser(email: string, password: string): Promise<SafeUser> {
  email = normalizeEmail(email);
  const passwordHash = await hashPassword(password);
  const id = randomBytes(16).toString("hex");
  // first registered account becomes admin (unless ADMIN_EMAIL is set and differs)
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const countRows = await client.execute("SELECT COUNT(*) AS c FROM users");
  const count = Number(countRows.rows[0]?.c ?? 0);
  const role = count === 0 && !adminEmail ? "admin" : adminEmail === email ? "admin" : "user";
  await db.insert(users).values({ id, email, passwordHash, role });
  return { id, email, role, createdAt: new Date() };
}

export async function authenticate(email: string, password: string): Promise<SafeUser | null> {
  email = normalizeEmail(email);
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) {
    // burn comparable time so missing-user and bad-password take similar time
    await hashPassword("dummy-password-for-timing");
    return null;
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) return null;
  return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
}

// -- Rate limiting (in-memory sliding window; per serverless instance) --

const attempts = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    attempts.set(key, arr);
    return false;
  }
  arr.push(now);
  attempts.set(key, arr);
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) {
      if (v.every((t) => now - t >= windowMs)) attempts.delete(k);
    }
  }
  return true;
}

// -- Migration helpers for tables (dev convenience; prod uses migrations) --

export async function ensureSchema(): Promise<void> {
  await client.execute(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL
  )`);
  await client.execute(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  await client.execute(`CREATE TABLE IF NOT EXISTS quiz_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    topic TEXT,
    section TEXT,
    daily INTEGER,
    duration_ms INTEGER,
    question_ids TEXT,
    missed_ids TEXT
  )`);
  await client.execute(`CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS quiz_results_user_idx ON quiz_results (user_id)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS quiz_results_date_idx ON quiz_results (date)`);
  // one attempt per user per exact timestamp — makes result sync idempotent
  await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS quiz_results_user_date_uq ON quiz_results (user_id, date)`);
  // drop duplicates that may predate the unique index (keep the earliest row)
  await client.execute(`DELETE FROM quiz_results WHERE id NOT IN (
    SELECT MIN(id) FROM quiz_results GROUP BY user_id, date
  )`);
}

// -- constant-time string compare helper (used for origin checks) --

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
