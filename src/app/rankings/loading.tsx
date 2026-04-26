export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-40 rounded-lg bg-[#1a2332]" />
      <div className="h-4 w-64 rounded bg-[#1a2332]" />
      <div className="mt-4 h-28 rounded-xl bg-[#111827]" />
      <div className="mt-2 space-y-px">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-[#111827]" />
        ))}
      </div>
    </div>
  );
}
