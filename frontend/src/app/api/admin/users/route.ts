import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { users, quizResults } from "@/lib/db/schema";
import { getCurrentUser, ensureSchema } from "@/lib/auth";
import type { SafeUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AdminUserData {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
  results: {
    date: string;
    score: number;
    total: number;
    topic?: string | null;
    section?: string | null;
    daily?: boolean | null;
    durationMs?: number | null;
  }[];
  quizzesTaken: number;
  avgPct: number;
  bestPct: number;
  lastActive: string | null;
}

export async function GET() {
  if (!isDbConfigured) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  let user: SafeUser | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: user ? 403 : 401 });
  }
  try {
    await ensureSchema();
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    const allResults = await db.select().from(quizResults).orderBy(desc(quizResults.date));
    const byUser = new Map<string, AdminUserData["results"]>();
    for (const r of allResults) {
      const list = byUser.get(r.userId) || [];
      list.push({
        date: r.date,
        score: r.score,
        total: r.total,
        topic: r.topic,
        section: r.section,
        daily: r.daily,
        durationMs: r.durationMs,
      });
      byUser.set(r.userId, list);
    }
    const data: AdminUserData[] = allUsers.map((u) => {
      const results = byUser.get(u.id) || [];
      const pcts = results.map((r) => (r.total > 0 ? (r.score / r.total) * 100 : 0));
      return {
        id: u.id,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        results,
        quizzesTaken: results.length,
        avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0,
        bestPct: pcts.length ? Math.round(Math.max(...pcts)) : 0,
        lastActive: results[0]?.date ?? null,
      };
    });
    return NextResponse.json({ users: data });
  } catch (e) {
    console.error("admin GET failed:", e);
    return NextResponse.json({ error: "Could not load admin data." }, { status: 500 });
  }
}
