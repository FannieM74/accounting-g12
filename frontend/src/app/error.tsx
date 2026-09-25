"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 gap-4 px-4">
      <p className="text-6xl">⚠️</p>
      <h1 className="text-lg sm:text-xl font-semibold text-gray-900 text-balance">Something went wrong</h1>
      <p className="text-gray-500 text-sm text-center max-w-md">{error.message || "An unexpected error occurred"}</p>
      <button
        onClick={reset}
        className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        Try again
      </button>
    </main>
  );
}
