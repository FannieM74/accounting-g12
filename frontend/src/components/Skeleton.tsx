export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center animate-pulse">
          <div className="h-7 bg-gray-200 rounded w-12 mx-auto mb-1" />
          <div className="h-3 bg-gray-200 rounded w-16 mx-auto" />
        </div>
      ))}
    </div>
  );
}
