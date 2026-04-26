"use client";
import { useEffect } from "react";
import Link from "next/link";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
      <h2 className="text-xl font-semibold text-white">Failed to load player profile</h2>
      <p className="text-sm text-gray-400 max-w-md">{error.message || "Could not fetch player data. Please try again."}</p>
      <div className="flex gap-3">
        <button onClick={reset} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400 transition-colors">Try again</button>
        <Link href="/" className="rounded-lg border border-[#2a3a4e] px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors">Back to board</Link>
      </div>
    </div>
  );
}
