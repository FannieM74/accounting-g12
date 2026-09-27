"use client";

import { useState } from "react";
import Link from "next/link";

interface AdminUser {
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

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "—";
const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
const fmtDur = (ms: number | null) => {
  if (!ms || ms < 0) return "";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

export default function AdminDashboard({ users }: { users: AdminUser[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const totalUsers = users.length;
  const totalQuizzes = users.reduce((a, u) => a + u.quizzesTaken, 0);
  const allPcts = users.flatMap((u) => u.results.map((r) => (r.total > 0 ? (r.score / r.total) * 100 : 0)));
  const globalAvg = allPcts.length ? Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length) : 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block">
          ← Home
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">🛡️ Admin · User Data</h1>
        <p className="text-xs text-gray-400 mb-6">
          All user account info and quiz results. Passwords are stored as Argon2id hashes and are never visible to anyone.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-blue-600 tabular-nums">{totalUsers}</p>
            <p className="text-xs text-gray-500 mt-1">Users</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-green-600 tabular-nums">{totalQuizzes}</p>
            <p className="text-xs text-gray-500 mt-1">Quizzes Taken</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-purple-600 tabular-nums">{globalAvg}%</p>
            <p className="text-xs text-gray-500 mt-1">Avg Score</p>
          </div>
        </div>

        {users.length === 0 && <p className="text-gray-400 text-center py-8">No users yet.</p>}

        <div className="space-y-4">
          {users.map((u) => {
            const open = openId === u.id;
            return (
              <div key={u.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setOpenId(open ? null : u.id)}
                  aria-expanded={open}
                  className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {u.email}
                      {u.role === "admin" && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 align-middle">
                          admin
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 tabular-nums">
                      joined {fmtDate(u.createdAt)} · {u.quizzesTaken} quiz{u.quizzesTaken === 1 ? "" : "zes"} · avg {u.avgPct}% · best {u.bestPct}%
                    </p>
                  </div>
                  <span className="text-gray-400 text-lg shrink-0" aria-hidden="true">{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    {u.results.length === 0 ? (
                      <p className="text-sm text-gray-400">No quiz results yet.</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {u.results.map((r, i) => {
                          const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
                          return (
                            <li key={i} className="py-2.5 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm text-gray-800 tabular-nums">
                                  {r.score}/{r.total} · {pct}%
                                  {r.daily ? " · Daily" : ""}
                                </p>
                                <p className="text-xs text-gray-400 tabular-nums">
                                  {fmtDateTime(r.date)}
                                  {r.topic ? ` · ${r.topic}` : ""}
                                  {r.durationMs ? ` · ${fmtDur(r.durationMs)}` : ""}
                                </p>
                              </div>
                              <div className="w-20 shrink-0">
                                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : "bg-yellow-500"}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <p className="text-xs text-gray-400 mt-3">Last activity: {fmtDateTime(u.lastActive)}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
