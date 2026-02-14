import { getMocks } from "@/lib/data";
import MockDraftsView from "./MockDraftsView";

export const metadata = {
  title: "Mock Drafts — 2026 Draft Board",
  description: "Compare mock drafts from 17+ sources for the 2026 NFL Draft.",
};

export default function MocksPage() {
  const { mocks, mock_dates } = getMocks();
  return <MockDraftsView mocks={mocks} mockDates={mock_dates} />;
}
