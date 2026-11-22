"use client";

import { Boxes, Search, ShieldCheck, Truck } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, Table, Tabs,
} from "@/components/ui";
import { inr, kg, when } from "@/lib/api";
import { useApi, VEHICLE_CLASSES } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function FindTransportation() {
  const { ready } = useGuard("sender");
  const [cls, setCls] = useState("all");
  const { data, loading, error, reload } = useApi<any>(
    `/capacity?status=published${cls !== "all" ? `&vehicle_class=${cls}` : ""}`, [cls]);
  const myShips = useApi<any>("/shipments?page_size=100");

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const blocks = data?.items || [];
  const demand = (myShips.data?.items || [])
    .filter((s: any) => ["pending_admin_review", "planning", "matched"].includes(s.status))
    .reduce((a: number, s: any) => a + s.quantity_kg, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="label">Published capacity</div>
          <div className="mt-1.5 text-[22px] font-semibold text-ink">{data?.summary?.published ?? 0} blocks</div>
          <div className="text-[11px] text-ink-muted">{kg(data?.summary?.committed_kg)} committed</div>
        </Card>
        <Card>
          <div className="label">Your open demand</div>
          <div className="mt-1.5 text-[22px] font-semibold text-ink">{kg(demand)}</div>
          <div className="text-[11px] text-ink-muted">awaiting Admin planning</div>
        </Card>
        <Card>
          <div className="label">Coverage</div>
          <div className="mt-1.5 text-[22px] font-semibold text-ink">
            {demand ? `${Math.round(((data?.summary?.committed_kg || 0) / demand) * 100)}%` : "—"}
          </div>
          <div className="text-[11px] text-ink-muted">committed vs your demand</div>
        </Card>
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <SectionHeader title="Available transportation" subtitle="Transporters publish blocks; Admin matches them to pooled demand" />
          <Tabs
            tabs={[{ key: "all", label: "All" }, ...VEHICLE_CLASSES.map((v) => ({ key: v.key, label: v.label }))]}
            active={cls}
            onChange={setCls}
            size="sm"
          />
        </div>

        {!blocks.length ? (
          <div className="px-5 pb-5">
            <EmptyState title="No published capacity" body="Transporters publish capacity blocks through the Options Exchange."
              icon={<Boxes size={18} />} />
          </div>
        ) : (
          <Table head={["Vehicle", "Class", "Capacity", "Corridor", "Window", "Reserve price", "Transporter", "Status"]}>
            {blocks.map((b: any) => (
              <tr key={b.id} className="transition-colors hover:bg-soft/60">
                <td className="td font-semibold">{b.reg_no || "—"}</td>
                <td className="td capitalize">{b.vehicle_class?.replace("_", " ")}</td>
                <td className="td">{kg(b.payload_kg)}</td>
                <td className="td text-[12px] capitalize">{b.corridor || "any"}</td>
                <td className="td text-[11.5px] text-ink-muted">
                  {when(b.window_from)} → {when(b.window_to)}
                </td>
                <td className="td">₹{b.reserve_price_per_km}/km</td>
                <td className="td">
                  <div className="flex items-center gap-1.5 text-[12px]">
                    {b.transporter_name}
                    {b.verification_status === "verified" && <ShieldCheck size={12} className="text-emerald" />}
                  </div>
                </td>
                <td className="td"><Badge status={b.status} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <p className="px-1 text-[10.5px] leading-relaxed text-ink-muted">
        You do not book directly from this list — Admin coordinates the actual assignment so pooling, compatibility
        and fair-share costing are applied first. Published capacity is shown so you can see what is available on
        your corridor.
      </p>
    </div>
  );
}
