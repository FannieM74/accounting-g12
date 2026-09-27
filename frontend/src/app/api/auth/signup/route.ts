import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isValidEmail, createUser, createSession, passwordIssue, rateLimit, ensureSchema } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isDbConfigured) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  // origin check (CSRF hardening for cookie-setting mutations)
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || !origin.endsWith(host)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!rateLimit(`signup:${ip}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const pwIssue = passwordIssue(password);
  if (pwIssue) return NextResponse.json({ error: pwIssue }, { status: 400 });

  try {
    await ensureSchema();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "Email already registered." }, { status: 409 });
    }
    const user = await createUser(email, password);
    await createSession(user.id);
    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (e) {
    console.error("signup failed:", e);
    return NextResponse.json({ error: "Could not create the account. Please try again." }, { status: 500 });
  }
}
