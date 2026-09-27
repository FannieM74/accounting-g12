"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Me {
  id: string;
  email: string;
  role: string;
}

export default function AuthWidget() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setMe(data.user || null);
    } catch {
      setMe(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function signOut() {
    await fetch("/api/auth/me", { method: "DELETE" }).catch(() => {});
    setMe(null);
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  if (!loaded) return <span className="w-16" aria-hidden="true" />;

  if (!me) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/login"
          className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center uppercase">
          {me.email.slice(0, 1)}
        </span>
        <span className="hidden sm:inline max-w-[120px] truncate">{me.email}</span>
        <span aria-hidden="true" className="text-xs text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 z-50"
        >
          <p className="px-3 py-1.5 text-xs text-gray-400 truncate border-b border-gray-100">{me.email}</p>
          <Link href="/results" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" role="menuitem">
            📊 My results
          </Link>
          {me.role === "admin" && (
            <Link href="/admin" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" role="menuitem">
              🛡️ Admin
            </Link>
          )}
          <button
            onClick={signOut}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
