import { DraftBuzzManager } from "./DraftBuzzManager";

// Import steps call the existing DraftBuzz importer ~40 profiles at a time.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export default function DraftBuzzPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">DraftBuzz</h1>
        <p className="text-sm text-gray-400 mt-1">
          Collect every NFL Draft Buzz profile from your own browser, review what came back, then import it
          into player profiles through the same importer the DraftBuzz spreadsheet upload uses.
        </p>
      </div>
      <DraftBuzzManager />
    </div>
  );
}
