import { getPositionColor, normalizePosition } from "@/lib/types";

export default function PositionBadge({ position }: { position: string | null }) {
  const normalized = normalizePosition(position);
  const colorClass = getPositionColor(normalized);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${colorClass}`}
    >
      {normalized || "—"}
    </span>
  );
}
