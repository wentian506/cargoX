"use client";

import { Activity, MapPin } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, SyntheticNote, Tabs,
} from "@/components/ui";
import { inr, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function TripMonitoring() {
  const { ready } = useGuard("admin");
  const { data, loading, error, reload } = useApi<any>("/admin/trips");
  const [tab, setTab] = useState("active");

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];
  const active = items.filter((t: any) => ["planned", "loading", "in_transit", "at_hub", "out_for_delivery"].includes(t.status));
  const done = items.filter((t: any) => t.status === "delivered");
  const list = tab === "active" ? active : tab === "done" ? done : items;

  return (
    <div className="space-y-4">
      <Card pad={false}>
        <div className="px-5 py-4">
          <Tabs tabs={[
            { key: "active", label: "In execution", count: active.length },
            { key: "done", label: "Completed", count: done.length },
            { key: "all", label: "All trips", count: items.length },
          ]} active={tab} onChange={setTab} />
        </div>
      </Card>

      {!list.length ? (
        <EmptyState title="No trips in this view" body="Trips appear once an assignment is confirmed."
          icon={<Activity size={18} />} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {list.map((t: any) => (
            <Card key={t.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">{t.trip_code}</span>
                    <Badge status={t.status} dot />
                    {t.delay_reported && <Badge status="pending">delayed</Badge>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-muted">
                    {t.reg_no} · {titleCase(t.vehicle_class)} · {t.transporter_name} · driver {t.driver_name || "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="label">Revenue</div>
                  <div className="text-[14px] font-semibold text-ink">{inr(t.revenue)}</div>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                {(t.shipments || []).map((s: any) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px]">
                    <span className="font-semibold text-ink">{s.code}</span>
                    <span className="capitalize text-ink-muted">{s.commodity} · {kg(s.quantity_kg)}</span>
                    <span className="inline-flex items-center gap-1 text-ink-muted">
                      <MapPin size={10} /> {s.pickup_village} → {s.destination_name}
                    </span>
                    <Badge status={s.status}>{s.status.replace(/_/g, " ")}</Badge>
                  </div>
                ))}
              </div>

              {t.legs?.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {t.legs.map((l: any) => (
                    <span key={l.id} className="chip border-line bg-soft text-[10px] text-ink-muted">
                      {titleCase(l.leg_type)} · {l.from_name} → {l.to_name}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-2.5 text-[10.5px] text-ink-muted">
                <span>started {when(t.started_at)}</span>
                {t.finished_at && <span>finished {when(t.finished_at)}</span>}
                <span>{Math.round(t.distance_km || 0)} km</span>
                {t.delay_reported && <span className="text-amber-700">report: {t.delay_reported}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <SyntheticNote>Trip positions are operational checkpoints from transporter actions, not GPS telemetry.</SyntheticNote>
    </div>
  );
}
