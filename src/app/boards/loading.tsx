export default function Loading() {
  return (
    <div className="animate-pulse space-y-6 max-w-4xl mx-auto px-4 py-6">
      <div className="h-6 w-32 rounded bg-[#1a2332]" />
      <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-6 space-y-4">
        <div className="flex gap-4">
          <div className="h-16 w-16 rounded-full bg-[#1a2332]" />
          <div className="space-y-2">
            <div className="h-7 w-48 rounded bg-[#1a2332]" />
            <div className="h-4 w-32 rounded bg-[#1a2332]" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-[#1a2332]" />
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-6 space-y-3">
        <div className="h-5 w-32 rounded bg-[#1a2332]" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 rounded bg-[#1a2332]" style={{ width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </div>
    </div>
  );
}
