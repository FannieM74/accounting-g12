"use client";

import { useEffect, useRef } from "react";
import type { QuizRecord } from "@/lib/types";

/**
 * Syncs local quiz history to the user's account (server DB) when signed in.
 * - sends only records the server does not have yet (dedupe on exact ISO timestamp)
 * - pulls server records and merges (newest-first, dedupe) into localStorage
 * Runs once per page load of the results page; keeps both stores consistent.
 */
export default function useResultSync() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        const me = await meRes.json().catch(() => ({}));
        const user = me?.user;
        if (!user) return; // anonymous — localStorage only

        const KEY = "acct12-history";
        const local: QuizRecord[] = (() => {
          try {
            return JSON.parse(localStorage.getItem(KEY) || "[]");
          } catch {
            return [];
          }
        })();

        // 1. pull server results and merge into local
        const res = await fetch("/api/results", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json().catch(() => ({ results: [] }));
          const server: QuizRecord[] = data.results || [];
          const seen = new Set(local.map((r) => r.date));
          const merged = [...local];
          for (const r of server) {
            if (!seen.has(r.date)) {
              merged.push(r);
              seen.add(r.date);
            }
          }
          if (merged.length !== local.length) {
            merged.sort((a, b) => (a.date < b.date ? 1 : -1));
            localStorage.setItem(KEY, JSON.stringify(merged.slice(0, 200)));
          }
        }

        // 2. push local records the server is missing (batch)
        const push = local.slice(0, 200);
        if (push.length > 0) {
          await fetch("/api/results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ results: push }),
          }).catch(() => {});
        }
      } catch {
        // non-fatal: local history remains usable offline
      }
    })();
  }, []);
}
