import { getMocks } from "@/lib/data";
import MockDraftsView from "./MockDraftsView";
import { getActiveDraftYear, siteTitle } from "@/lib/draft-year";

export const revalidate = 3600;

export async function generateMetadata() {
  return {
    title: await siteTitle("Mock Drafts"),
    description: `Compare mock drafts from 17+ sources for the ${await getActiveDraftYear()} NFL Draft.`,
  };
}

export default async function MocksPage() {
  const { mocks, mock_dates } = await getMocks();
  return <MockDraftsView mocks={mocks} mockDates={mock_dates} />;
}
