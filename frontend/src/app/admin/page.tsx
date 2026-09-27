import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { getCurrentUser, ensureSchema } from "@/lib/auth";
import type { SafeUser } from "@/lib/auth";
import { db, isDbConfigured } from "@/lib/db";
import { users, quizResults } from "@/lib/db/schema";
import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";

interface AdminUserData {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  quizzesTaken: number;
  avgPct: number;
  bestPct: number;
  lastActive: string | null;
  results: { date: string; score: number; total: number; topic: string | null; daily: boolean | null; durationMs: number | null }[];
}

export default async function AdminPage() {
  if (!isDbConfigured) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4">
        <p className="text-gray-500 text-center">The database is not configured yet — admin features are unavailable.</p>
      </main>
    );
  }
  let user: SafeUser | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }
  if (!user) redirect("/login?next=%2Fadmin");
  if (user.role !== "admin") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-gray-700 font-medium">Admin access required.</p>
          <p className="text-gray-400 text-sm mt-1">This area is restricted to administrators.</p>
        </div>
      </main>
    );
  }

  await ensureSchema();
  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
  const allResults = await db.select().from(quizResults).orderBy(desc(quizResults.date));
  const byUser = new Map<string, typeof allResults>();
  for (const r of allResults) {
    const list = byUser.get(r.userId) || [];
    list.push(r);
    byUser.set(r.userId, list);
  }
  const data: AdminUserData[] = allUsers.map((u) => {
    const results = byUser.get(u.id) || [];
    const pcts = results.map((r) => (r.total > 0 ? (r.score / r.total) * 100 : 0));
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      quizzesTaken: results.length,
      avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0,
      bestPct: pcts.length ? Math.round(Math.max(...pcts)) : 0,
      lastActive: results[0]?.date ?? null,
      results: results.map((r) => ({
        date: r.date,
        score: r.score,
        total: r.total,
        topic: r.topic,
        daily: r.daily,
        durationMs: r.durationMs,
      })),
    };
  });

  return <AdminDashboard users={data} />;
}
