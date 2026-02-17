"use client";

import { useState } from "react";
import { createUpdate, deleteUpdate } from "./actions";

interface SiteUpdate {
  id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
}

const CATEGORIES = [
  { value: "feature", label: "🚀 Feature", color: "bg-purple-500/20 text-purple-300" },
  { value: "content", label: "📝 Content", color: "bg-orange-500/20 text-orange-300" },
  { value: "data", label: "📊 Data", color: "bg-green-500/20 text-green-300" },
  { value: "announcement", label: "📢 Announcement", color: "bg-blue-500/20 text-blue-300" },
];

function categoryBadge(cat: string) {
  const c = CATEGORIES.find((c) => c.value === cat) ?? CATEGORIES[3];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${c.color}`}>{c.label}</span>;
}

export default function UpdatesManager({ updates: initial }: { updates: SiteUpdate[] }) {
  const [updates, setUpdates] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const result = await createUpdate(fd);

    if (result.error) {
      setMessage(`Error: ${result.error}`);
    } else {
      setMessage("Update posted!");
      form.reset();
      // Optimistically add to top of list
      const newUpdate: SiteUpdate = {
        id: crypto.randomUUID(),
        title: fd.get("title") as string,
        body: fd.get("body") as string,
        category: fd.get("category") as string,
        created_at: new Date().toISOString(),
      };
      setUpdates([newUpdate, ...updates]);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this update?")) return;
    const result = await deleteUpdate(id);
    if (result.error) {
      alert(result.error);
    } else {
      setUpdates(updates.filter((u) => u.id !== id));
    }
  }

  return (
    <div className="space-y-8">
      {/* Post Form */}
      <form onSubmit={handleSubmit} className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">Post New Update</h2>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Title</label>
          <input
            name="title"
            required
            placeholder="e.g. Added Pick Projection Tab"
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#0a0f1a] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Body</label>
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Brief description of the update..."
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#0a0f1a] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
          <select
            name="category"
            defaultValue="announcement"
            className="rounded-lg border border-[#2a3a4e] bg-[#0a0f1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Posting..." : "Post Update"}
          </button>
          {message && (
            <span className={`text-xs ${message.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
              {message}
            </span>
          )}
        </div>
      </form>

      {/* Existing Updates */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-4">
          Previous Updates ({updates.length})
        </h2>

        {updates.length === 0 ? (
          <p className="text-sm text-gray-500">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {updates.map((u) => (
              <div
                key={u.id}
                className="flex items-start justify-between rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {categoryBadge(u.category)}
                    <span className="text-xs text-gray-500">
                      {new Date(u.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-white">{u.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{u.body}</p>
                </div>
                <button
                  onClick={() => handleDelete(u.id)}
                  className="ml-3 text-red-400/50 hover:text-red-400 text-xs transition-colors flex-shrink-0"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
