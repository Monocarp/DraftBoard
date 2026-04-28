import { getCollegeReviewData } from "./actions";
import { CollegeReviewManager } from "./CollegeReviewManager";

export const revalidate = 0;

export default async function CollegeReviewPage() {
  const { pending, canonicals } = await getCollegeReviewData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">College Review</h1>
        <p className="mt-1 text-sm text-gray-400">
          School names that couldn&apos;t be auto-normalized. Map each to a canonical name to
          back-fill existing players and prevent future mismatches.
        </p>
      </div>

      {pending.length > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          {pending.length} school name{pending.length !== 1 ? "s" : ""} need attention.
        </div>
      )}

      <CollegeReviewManager initialPending={pending} canonicals={canonicals} />
    </div>
  );
}
