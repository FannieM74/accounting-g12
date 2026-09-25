interface Props {
  current: number;
  total: number;
  answered: number;
}

export default function ProgressBar({ current, total, answered }: Props) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>
          Question {current + 1} of {total}
        </span>
        <span>{answered} answered</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`Quiz progress: ${answered} of ${total} questions answered`}
        className="w-full bg-gray-200 rounded-full h-2 overflow-hidden"
      >
        <div
          className="bg-blue-600 h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
