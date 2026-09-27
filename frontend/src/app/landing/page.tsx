"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthWidget from "@/components/AuthWidget";

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <svg className="absolute -right-40 -top-40 opacity-30" width="720" height="720" viewBox="0 0 720 720" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g1" x1="0" x2="1">
              <stop offset="0" stopColor="#60A5FA" />
              <stop offset="1" stopColor="#3B82F6" />
            </linearGradient>
          </defs>
          <circle cx="200" cy="200" r="220" fill="url(#g1)" />
          <circle cx="520" cy="520" r="160" fill="#BFDBFE" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-20">
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className={`text-4xl sm:text-5xl font-extrabold leading-tight text-gray-900 transform transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"}`}>
              Accounting P1 Practice
              <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent"> · Focused · Fast · Proven</span>
            </h1>
            <p className="mt-3 text-lg text-gray-600 max-w-xl">
              170 exam-style MCQs from November 2022–2025. Study curated notes,
              take targeted quizzes, and track your progress.
            </p>

          </div>

          <div className="hidden md:block">
            <AuthWidget />
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <p className="text-lg text-gray-700 mb-4">Sharpen your exam skills with curated Paper 1 questions, structured study notes, and focused quizzes by topic.</p>

            <div className="flex gap-3">
              <Link href="/signup" className="inline-flex items-center gap-3 px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-500 text-white shadow-md hover:from-blue-700 hover:to-indigo-600 transition">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14c-4.418 0-8 1.79-8 4v1h16v-1c0-2.21-3.582-4-8-4z" />
                </svg>
                Create account
              </Link>

              <Link href="/login" className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-gray-200 text-gray-700 hover:bg-white shadow-sm transition">
                Sign in
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Study Topics</h3>
                <p className="text-xs text-gray-500 mt-1">Structured notes and practice questions by topic.</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Timed Quizzes</h3>
                <p className="text-xs text-gray-500 mt-1">Exam-style timed quizzes with instant review.</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Track Progress</h3>
                <p className="text-xs text-gray-500 mt-1">Dated history, scores and improvement trends.</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Admin Tools</h3>
                <p className="text-xs text-gray-500 mt-1">Admins can view aggregated user performance.</p>
              </div>
            </div>

            <blockquote className="mt-6 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-l-4 border-blue-300 rounded-lg">
              <p className="text-sm text-gray-700">"This app helped me focus my revision by topic and improved my Paper 1 score quickly."</p>
              <footer className="mt-2 text-xs text-gray-500"> Grade 12 learner</footer>
            </blockquote>
          </div>

          <div className="flex items-center justify-center">
            <div className="bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 w-full max-w-md">
              <svg viewBox="0 0 320 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="30" width="300" height="160" rx="14" fill="#EFF6FF" />
                <g transform="translate(30, 50)">
                  <rect x="0" y="58" width="28" height="62" rx="4" fill="#60A5FA" />
                  <rect x="46" y="28" width="28" height="92" rx="4" fill="#3B82F6" />
                  <rect x="92" y="10" width="28" height="110" rx="4" fill="#06B6D4" />
                  <rect x="138" y="40" width="28" height="80" rx="4" fill="#7C3AED" />
                  <text x="0" y="-6" className="text-xs" fill="#475569">Performance</text>
                </g>
              </svg>
            </div>
          </div>
        </section>

        <footer className="mt-16 text-center text-xs text-gray-400">
          <p>Made for Grade 12 Accounting  Paper 1 practice</p>
        </footer>
      </div>
    </main>
  );
}
