import { StatsSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="h-8 bg-gray-200 rounded w-48 mx-auto mb-2 animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-64 mx-auto animate-pulse" />
        </div>
        <StatsSkeleton />
      </div>
    </main>
  );
}
