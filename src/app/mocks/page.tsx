import { getMocks } from "@/lib/data";
import MockDraftsView from "./MockDraftsView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mock Drafts — 2026 Draft Board",
  description: "Compare mock drafts from 17+ sources for the 2026 NFL Draft.",
};

export default async function MocksPage() {
  const { mocks, mock_dates } = await getMocks();
  return <MockDraftsView mocks={mocks} mockDates={mock_dates} />;
}
