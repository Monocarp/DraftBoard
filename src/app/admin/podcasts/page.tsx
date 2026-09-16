import { PodcastsManager } from "./PodcastsManager";

// Server actions invoked from this page inherit these settings. Each processing
// step is designed to finish well inside the limit (measured: ≤ ~70 s for three
// 23 MB audio pieces); 300 s is the Vercel Hobby maximum.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export default function PodcastsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Podcasts</h1>
        <p className="text-sm text-gray-400 mt-1">
          Transcribe First Draft, NFL Stock Exchange and McShay Show episodes, review the
          player commentary extracted from them, and publish it to player profiles.
        </p>
      </div>
      <PodcastsManager />
    </div>
  );
}
