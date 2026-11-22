"use client";

import { Route, Waypoints } from "lucide-react";
import { Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, Stat, SyntheticNote, Table } from "@/components/ui";
import { inr, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function BackhaulAdmin() {
  const { ready } = useGuard("admin");
  const { data, loading, error, reload } = useApi<any>("/backhaul/summary");

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Stat label="Offers presented" value={items.length} sub="across all transporters" icon={<Waypoints size={15} />} />
        <Stat label="Accepted" value={data?.accepted ?? 0} sub="return loads taken" tone="good" />
        <Stat label="Extra revenue" value={inr(data?.extra_revenue, true)} sub="accepted offers only" tone="good" />
      </div>

      <Card pad={false}>
        <div className="px-5 py-4">
          <SectionHeader title="CrossFlow-Backhaul register" subtitle="Return-load decisions and their economics" />
        </div>
        {!items.length ? (
          <div className="px-5 pb-5">
            <EmptyState title="No return-load decisions yet"
              body="Transporters see opportunities on their own screens and accept or reject them there."
              icon={<Route size={18} />} />
          </div>
        ) : (
          <Table head={["Transporter", "Cargo", "Lane", "Extra km", "Revenue", "Time", "Status", "When"]}>
            {items.map((o: any) => (
              <tr key={o.id} className="transition-colors hover:bg-soft/60">
                <td className="td text-[12px]">{o.transporter}</td>
                <td className="td capitalize">{o.cargo_type}</td>
                <td className="td text-[11.5px]">{o.from_name} → {o.to_name}</td>
                <td className="td">{o.extra_distance_km} km</td>
                <td className="td font-semibold">{inr(o.revenue)}</td>
                <td className="td">{o.time_hours} h</td>
                <td className="td"><Badge status={o.status === "accepted" ? "approved" : "rejected"}>{o.status}</Badge></td>
                <td className="td text-[10.5px] text-ink-muted">{when(o.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card className="bg-soft/50">
        <p className="text-[11.5px] leading-relaxed text-ink-muted">
          <strong className="text-ink">Incremental rule.</strong> {data?.note} AgroCompat still applies, and a return
          load that would jeopardise the next committed trip is flagged and not recommended.
        </p>
      </Card>
      <SyntheticNote />
    </div>
  );
}
