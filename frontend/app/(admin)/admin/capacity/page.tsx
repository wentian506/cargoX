"use client";

import { Boxes, Gauge, ShieldCheck, Truck } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, Progress, SectionHeader, Stat, Table, useToast,
} from "@/components/ui";
import { api, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function AdminCapacity() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/capacity?status=all");
  const match = useApi<any>("/admin/capacity/match/view");
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const blocks = data?.items || [];
  const m = match.data;

  const rematch = async () => {
    setBusy(true);
    try {
      await api.post("/admin/capacity/match", {});
      match.reload();
      push("success", "Capacity re-matched against current demand");
    } catch (e: any) {
      push("error", "Match failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Committed capacity" value={kg(m?.committed_capacity_kg)} sub="published + reserved" icon={<Boxes size={15} />} />
        <Stat label="Current demand" value={kg(m?.demand_kg)} sub="open shipments" icon={<Truck size={15} />} />
        <Stat label="Coverage ratio" value={`${Math.round((m?.coverage_ratio || 0) * 100)}%`}
          sub={m?.uncovered_kg > 0 ? `${kg(m.uncovered_kg)} uncovered` : "fully covered"}
          tone={(m?.coverage_ratio || 0) >= 1 ? "good" : "warn"} icon={<Gauge size={15} />} />
        <Stat label="Verified blocks" value={blocks.filter((b: any) => b.verification_status === "verified").length}
          sub={`${blocks.length} total blocks`} icon={<ShieldCheck size={15} />} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title="Coverage analysis" subtitle={m?.gap_note} />
          <button className="btn-primary btn-sm" disabled={busy} onClick={rematch}>Re-match demand</button>
        </div>
        <div className="mb-2"><Progress value={Math.min(1, m?.coverage_ratio || 0)} tone={(m?.coverage_ratio || 0) >= 1 ? "emerald" : "amber"} /></div>
        {m?.candidates?.length > 0 && (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {m.candidates.slice(0, 6).map((c: any) => (
              <div key={c.id} className={`rounded-xl border px-3 py-2.5 ${c.sufficient && c.transporter_verified ? "border-emerald-200 bg-emerald-50/50" : "border-line"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-ink">{c.reg_no || c.vehicle_class}</span>
                  <Badge status={c.transporter_verified ? "verified" : "pending"}>
                    {c.transporter_verified ? "verified" : "unverified"}
                  </Badge>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-muted">
                  {titleCase(c.vehicle_class)} · {kg(c.payload_kg)} · fit {Math.round(c.fit_ratio * 100)}%
                </div>
                <div className="text-[10.5px] text-ink-muted">{c.transporter_name} · ₹{c.reserve_price_per_km}/km</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card pad={false}>
        <div className="px-5 py-4"><SectionHeader title="All capacity blocks" subtitle="Options Exchange register" /></div>
        {!blocks.length ? (
          <div className="px-5 pb-5"><EmptyState title="No blocks" body="Transporters have not published capacity yet."
            icon={<Boxes size={18} />} /></div>
        ) : (
          <Table head={["Vehicle", "Class", "Block", "Corridor", "Reserve", "Transporter", "Status", "Window"]}>
            {blocks.map((b: any) => (
              <tr key={b.id} className="transition-colors hover:bg-soft/60">
                <td className="td font-semibold">{b.reg_no || "—"}</td>
                <td className="td capitalize">{b.vehicle_class?.replace("_", " ")}</td>
                <td className="td">{kg(b.block_size_kg)}</td>
                <td className="td text-[11.5px] capitalize">{b.corridor}</td>
                <td className="td">₹{b.reserve_price_per_km}/km</td>
                <td className="td text-[12px]">
                  {b.transporter_name}
                  {b.verification_status === "verified" && <ShieldCheck size={11} className="ml-1 inline text-emerald" />}
                </td>
                <td className="td"><Badge status={b.status} /></td>
                <td className="td text-[10.5px] text-ink-muted">{when(b.window_to)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card className="bg-soft/50">
        <p className="text-[11.5px] leading-relaxed text-ink-muted">
          <strong className="text-ink">Coverage below 100%</strong> means standby capacity or a second wave is
          required. The planner will not force an assignment onto a vehicle that cannot legally carry the load.
        </p>
      </Card>
    </div>
  );
}
