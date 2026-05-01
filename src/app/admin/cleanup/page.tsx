import { CleanupManager } from "./CleanupManager";
import { SchoolAuditTab } from "./SchoolAuditTab";

export default function CleanupPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Player Cleanup</h1>
        <p className="text-sm text-gray-400 mt-1">
          Audit and fix player data quality issues.
        </p>
      </div>

      <CleanupTabs />
    </div>
  );
}

// Tabs are rendered client-side via a wrapper so we can keep the page as a server component
import { CleanupTabs } from "./CleanupTabs";
