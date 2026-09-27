"use client";

import Link from "next/link";
import AuthWidget from "@/components/AuthWidget";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Accounting P1 · Practice & Study</h1>
            <p className="text-sm text-gray-500 mt-1">170 past Paper 1 multiple-choice questions (Nov 2022–2025). Study topics, take quizzes, and track your progress.</p>
          </div>
          <div className="hidden md:block">
            <AuthWidget />
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-lg text-gray-700 mb-6">Sharpen your exam skills with curated Paper 1 questions, study notes, and focused quizzes by topic.</p>
            <div className="flex gap-3">
              <Link href="/signup" className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
                Create account
              </Link>
              <Link href="/login" className="px-6 py-3 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
                Sign in
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                <h3 className="text-sm font-semibold">Study Topics</h3>
                <p className="text-xs text-gray-400 mt-1">Notes and practice questions organised by topic.</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                <h3 className="text-sm font-semibold">Progress Tracking</h3>
                <p className="text-xs text-gray-400 mt-1">Save results to your account and review your history with dates and scores.</p>
              </div>
            </div>
          </div>

          <div className="order-first md:order-last">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-2">Quick start</h2>
              <ol className="text-sm text-gray-500 list-decimal list-inside space-y-2">
                <li>Create an account (free)</li>
                <li>Study a topic or take a practice quiz</li>
                <li>View your dated results in the History page</li>
              </ol>
              <p className="text-xs text-gray-400 mt-4">By creating an account you can sync your progress across devices. Admins can view all user results.</p>
            </div>
          </div>
        </section>

        <footer className="mt-12 text-center text-xs text-gray-400">
          <p>Built for Grade 12 Accounting · Paper 1 practice</p>
        </footer>
      </div>
    </main>
  );
}
