import { getSiteUpdates } from "@/lib/data";
import UpdatesManager from "./UpdatesManager";

export default async function AdminUpdatesPage() {
  const updates = await getSiteUpdates();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Site Updates</h1>
      <UpdatesManager updates={updates} />
    </div>
  );
}
