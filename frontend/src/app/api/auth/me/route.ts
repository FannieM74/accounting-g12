import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, destroyCurrentSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null });
  }
}

export async function DELETE(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || !origin.endsWith(host)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  try {
    await destroyCurrentSession();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("logout failed:", e);
    return NextResponse.json({ error: "Could not sign out." }, { status: 500 });
  }
}
