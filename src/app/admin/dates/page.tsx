import { getSourceDates } from "./actions";
import { SourceDatesManager } from "./SourceDatesManager";

export const metadata = { title: "Source Dates — Admin" };

export default async function SourceDatesPage() {
  const dates = await getSourceDates();

  const rankings = dates.filter((d) => d.source_type === "ranking");
  const mocks = dates.filter((d) => d.source_type === "mock");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Source Dates</h1>
        <p className="mt-1 text-sm text-gray-400">
          Track when each ranking or mock draft source was last updated. Dates auto-update when you upload new data.
        </p>
      </div>

      <SourceDatesManager rankings={rankings} mocks={mocks} />
    </div>
  );
}
