import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { quizResults } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IncomingResult {
  date: string;
  score: number;
  total: number;
  topic?: string;
  section?: string;
  daily?: boolean;
  durationMs?: number;
  questionIds?: number[];
  missedIds?: number[];
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function validate(r: IncomingResult): string | null {
  if (typeof r.date !== "string" || Number.isNaN(Date.parse(r.date))) return "Invalid date.";
  if (!isInt(r.score) || r.score < 0 || r.score > 1000) return "Invalid score.";
  if (!isInt(r.total) || r.total < 1 || r.total > 1000) return "Invalid total.";
  if (r.score > r.total) return "Score cannot exceed total.";
  if (r.topic !== undefined && r.topic !== null && typeof r.topic !== "string") return "Invalid topic.";
  if (r.section !== undefined && r.section !== null && typeof r.section !== "string") return "Invalid section.";
  if (r.durationMs !== undefined && r.durationMs !== null && (!isInt(r.durationMs) || r.durationMs < 0 || r.durationMs > 86_400_000)) return "Invalid duration.";
  const idsOk = (a: unknown) =>
    a === undefined || a === null || (Array.isArray(a) && a.every((x) => isInt(x) && x >= 0 && x < 100000) && a.length <= 500);
  if (!idsOk(r.questionIds) || !idsOk(r.missedIds)) return "Invalid question ids.";
  return null;
}

export async function GET() {
  if (!isDbConfigured) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    await ensureSchemaSafe();
    const rows = await db
      .select()
      .from(quizResults)
      .where(eq(quizResults.userId, user.id))
      .orderBy(desc(quizResults.date))
      .limit(500);
    return NextResponse.json({
      results: rows.map((r) => ({
        date: r.date,
        score: r.score,
        total: r.total,
        topic: r.topic ?? undefined,
        section: r.section ?? undefined,
        daily: r.daily === null ? undefined : Boolean(r.daily),
        durationMs: r.durationMs ?? undefined,
        questionIds: r.questionIds ? JSON.parse(r.questionIds) : undefined,
        missedIds: r.missedIds ? JSON.parse(r.missedIds) : undefined,
      })),
    });
  } catch (e) {
    console.error("results GET failed:", e);
    return NextResponse.json({ error: "Could not load results." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isDbConfigured) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || !origin.endsWith(host)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    await ensureSchemaSafe();
    let body: { results?: IncomingResult[]; result?: IncomingResult };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const incoming = body.results ?? (body.result ? [body.result] : []);
    if (!Array.isArray(incoming) || incoming.length === 0 || incoming.length > 250) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }
    for (const r of incoming) {
      const err = validate(r);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    await db
      .insert(quizResults)
      .values(
        incoming.map((r) => ({
          userId: user.id,
          date: r.date,
          score: r.score,
          total: r.total,
          topic: r.topic ?? null,
          section: r.section ?? null,
          daily: r.daily ?? null,
          durationMs: r.durationMs ?? null,
          questionIds: r.questionIds ? JSON.stringify(r.questionIds) : null,
          missedIds: r.missedIds ? JSON.stringify(r.missedIds) : null,
        }))
      )
      .onConflictDoNothing({ target: [quizResults.userId, quizResults.date] });
    return NextResponse.json({ ok: true, saved: incoming.length });
  } catch (e) {
    console.error("results POST failed:", e);
    return NextResponse.json({ error: "Could not save results." }, { status: 500 });
  }
}

async function ensureSchemaSafe() {
  const { ensureSchema } = await import("@/lib/auth");
  await ensureSchema();
}

export async function DELETE(req: NextRequest) {
  if (!isDbConfigured) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || !origin.endsWith(host)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    await ensureSchemaSafe();
    await db.delete(quizResults).where(eq(quizResults.userId, user.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("results DELETE failed:", e);
    return NextResponse.json({ error: "Could not clear results." }, { status: 500 });
  }
}
