export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-lg bg-[#1a2332]" />
      <div className="h-4 w-72 rounded bg-[#1a2332]" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-lg bg-[#111827]" />
        ))}
      </div>
      <div className="mt-2 space-y-px">
        {Array.from({ length: 32 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-[#111827]" />
        ))}
      </div>
    </div>
  );
}
