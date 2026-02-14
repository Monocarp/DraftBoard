import Link from "next/link";

export default function PlayerNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-12 text-center max-w-md">
        <h1 className="text-4xl font-bold text-white mb-4">Profile In Progress</h1>
        <p className="text-gray-400 mb-6">
          This player's full profile is still being compiled. Check back soon!
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Return to Big Board
        </Link>
      </div>
    </div>
  );
}
