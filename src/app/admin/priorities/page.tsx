import { getSourcePriorities } from "./actions";
import { PriorityManager } from "./PriorityManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bio Source Priorities — Admin" };

export default async function PrioritiesPage() {
  const entries = await getSourcePriorities();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Bio Source Priorities</h1>
        <p className="mt-1 text-sm text-gray-400">
          Manage which data sources take precedence for player bio fields (height, weight, age, year, etc.).
          Higher priority sources win when multiple sources provide the same field.
        </p>
      </div>

      <PriorityManager entries={entries} />
    </div>
  );
}
