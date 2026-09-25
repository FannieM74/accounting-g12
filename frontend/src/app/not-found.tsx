import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 gap-4 px-4">
      <p className="text-6xl font-bold text-gray-300">404</p>
      <h1 className="text-lg sm:text-xl font-semibold text-gray-900 text-balance">Page not found</h1>
      <p className="text-gray-500 text-sm text-center">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="mt-4 px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        Back to Home
      </Link>
    </main>
  );
}
