export default function Loading() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-8 w-48 rounded-lg bg-[#1a2332]" />
      <div className="h-4 w-72 rounded bg-[#1a2332]" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-[#111827]" />
        ))}
      </div>
    </div>
  );
}
