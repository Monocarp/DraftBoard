import { WalterFootballManager } from "./WalterFootballManager";

export default function WalterFootballPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Walter Football Profiles</h1>
        <p className="text-sm text-gray-400 mt-1">
          Scrape scouting reports from walterfootball.com and import them into Supabase.
        </p>
      </div>

      <WalterFootballManager />
    </div>
  );
}
