import { getSiteUpdates } from "@/lib/data";

const CATEGORY_CONFIG: Record<string, { emoji: string; label: string; color: string; border: string }> = {
  feature:      { emoji: "🚀", label: "Feature",      color: "bg-purple-500/15 text-purple-300", border: "border-purple-500/30" },
  content:      { emoji: "📝", label: "Content",      color: "bg-orange-500/15 text-orange-300", border: "border-orange-500/30" },
  data:         { emoji: "📊", label: "Data",         color: "bg-green-500/15 text-green-300",  border: "border-green-500/30" },
  announcement: { emoji: "📢", label: "Announcement", color: "bg-blue-500/15 text-blue-300",   border: "border-blue-500/30" },
};

function getCat(category: string) {
  return CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.announcement;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dateKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return null; // use full date instead
}

export default async function UpdatesPage() {
  const updates = await getSiteUpdates();

  // Group by date
  const grouped: { date: string; items: typeof updates }[] = [];
  for (const u of updates) {
    const dk = dateKey(u.created_at);
    const last = grouped[grouped.length - 1];
    if (last?.date === dk) {
      last.items.push(u);
    } else {
      grouped.push({ date: dk, items: [u] });
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Draft Wire</h1>
        <p className="text-sm text-gray-400 mt-1">Latest updates, features, and data changes throughout the 2026 draft cycle.</p>
      </div>

      {updates.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm">No updates yet. Check back soon!</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gradient-to-b from-orange-500/40 via-[#2a3a4e] to-transparent" />

          <div className="space-y-8">
            {grouped.map((group) => (
              <div key={group.date}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-4 relative">
                  <div className="w-[39px] flex justify-center">
                    <div className="h-2.5 w-2.5 rounded-full bg-orange-500/60 ring-4 ring-[#0a0f1a]" />
                  </div>
                  <span className="text-xs font-semibold text-orange-400/80 uppercase tracking-wider">
                    {group.date}
                  </span>
                </div>

                {/* Update cards */}
                <div className="space-y-3 ml-[39px] pl-5">
                  {group.items.map((u) => {
                    const cat = getCat(u.category);
                    const ago = timeAgo(u.created_at);
                    return (
                      <div
                        key={u.id}
                        className={`rounded-xl border ${cat.border} bg-[#0d1320]/80 backdrop-blur-sm p-4 transition-colors hover:bg-[#111827]/80`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cat.color}`}>
                            {cat.emoji} {cat.label}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {ago ?? formatDate(u.created_at)}
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-white mb-1">{u.title}</h3>
                        <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">{u.body}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
