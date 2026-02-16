import { CleanupManager } from "./CleanupManager";

export default function CleanupPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Player Cleanup</h1>
        <p className="text-sm text-gray-400 mt-1">
          Find and remove players with missing position or school data.
        </p>
      </div>

      <CleanupManager />
    </div>
  );
}
