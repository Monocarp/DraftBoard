import { PositionAudit } from "./PositionAudit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Position Audit — Admin" };

export default function PositionsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Position Audit</h1>
      <PositionAudit />
    </div>
  );
}
