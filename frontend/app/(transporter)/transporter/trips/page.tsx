"use client";

import {
  AlertTriangle, CheckCircle2, Flag, MapPin, PackageCheck, Play, Route, Truck,
} from "lucide-react";
import { useState } from "react";
import ArrivalClock from "@/components/ArrivalClock";
import LiveTripPanel from "@/components/LiveTripPanel";
import LiveMap from "@/components/LiveMap";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, Modal, SectionHeader, Spinner, SyntheticNote, Tabs, useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

const NEXT: Record<string, { action: string; label: string; icon: any; tone: string }> = {
  planned: { action: "start", label: "Start trip", icon: Play, tone: "btn-primary" },
  loading: { action: "confirm_loading", label: "Confirm loading", icon: PackageCheck, tone: "btn-emerald" },
  in_transit: { action: "confirm_delivery", label: "Report delivery", icon: CheckCircle2, tone: "btn-primary" },
  at_hub: { action: "depart_hub", label: "Depart hub", icon: Route, tone: "btn-emerald" },
  out_for_delivery: { action: "confirm_delivery", label: "Report delivery", icon: CheckCircle2, tone: "btn-emerald" },
};

export default function TripManagement() {
  const { ready } = useGuard("transporter");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/trips/mine");
  const [tab, setTab] = useState("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [incident, setIncident] = useState<{ trip: any; kind: string } | null>(null);
  const [note, setNote] = useState("");

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];
  const active = items.filter((t: any) => ["planned", "loading", "in_transit", "at_hub", "out_for_delivery"].includes(t.status));
  const done = items.filter((t: any) => t.status === "delivered");
  const list = tab === "active" ? active : tab === "done" ? done : items;

  const act = async (tripId: string, action: string) => {
    setBusy(tripId);
    try {
      const res = await api.post<any>(`/trips/${tripId}/action`, { action });
      push("success", "Trip updated", res.message);
      reload();
    } catch (e: any) {
      push("error", "Could not update trip", e?.message);
    } finally {
      setBusy(null);
    }
  };

  const report = async () => {
    if (!incident) return;
    setBusy(incident.trip.id);
    try {
      const res = await api.post<any>(`/trips/${incident.trip.id}/action`, { action: incident.kind, note });
      push("warning", "Reported to Admin", res.message);
      setIncident(null); setNote("");
      reload();
    } catch (e: any) {
      push("error", "Could not report", e?.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Tabs tabs={[
            { key: "active", label: "Active", count: active.length },
            { key: "done", label: "Completed", count: done.length },
            { key: "all", label: "All", count: items.length },
          ]} active={tab} onChange={setTab} />
          <span className="text-[11px] text-ink-muted">Trip actions are audit-logged</span>
        </div>
      </Card>

      {!list.length ? (
        <EmptyState title="No trips in this view" body="Accepted assignments become trips once Admin confirms dispatch."
          icon={<Route size={18} />} />
      ) : (
        <div className="space-y-4">
          {list.map((t: any) => {
            const next = NEXT[t.status];
            return (
              <Card key={t.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-ink">{t.trip_code}</span>
                      <Badge status={t.status} dot />
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-ink-muted">
                      {t.reg_no} · {titleCase(t.vehicle_class)} · driver {t.driver_name || "unassigned"} · {kg(t.shipments?.reduce((a: number, s: any) => a + s.quantity_kg, 0))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="label">Revenue</div>
                    <div className="text-[16px] font-semibold text-ink">{inr(t.revenue)}</div>
                    <div className="text-[10.5px] text-ink-muted">{Math.round(t.distance_km || 0)} km</div>
                  </div>
                </div>

                {t.delay_reported && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>Reported: {t.delay_reported}. Admin has been notified for recovery planning.</span>
                  </div>
                )}

                {t.arrival && !["delivered", "cancelled"].includes(t.status) && (
                  <ArrivalClock data={t.arrival} className="mt-3" compact />
                )}

                <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
                  <div className="space-y-1.5">
                    {(t.shipments || []).map((s: any) => (
                      <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2 text-[11.5px]">
                        <span className="font-semibold text-ink">{s.code}</span>
                        <span className="capitalize text-ink-muted">{s.commodity} · {Math.round(s.quantity_kg)} kg</span>
                        <span className="inline-flex items-center gap-1 text-ink-muted">
                          <MapPin size={10} /> {s.pickup_village} → {s.destination_name}
                        </span>
                        <Badge status={s.status}>{s.status.replace(/_/g, " ")}</Badge>
                      </div>
                    ))}
                  </div>

                  <div>
                    {["planned", "in_transit", "loading", "at_hub", "out_for_delivery"].includes(t.status) ? (
                      <LiveTripPanel tripId={t.id} height={190} refreshMs={45000} />
                    ) : (
                      <div className="rounded-xl bg-soft/60 p-2">
                        <LiveMap
                          height={170}
                          padding={0.35}
                          legend={false}
                          points={(t.shipments || []).slice(0, 3).map((s: any, i: number) => ({
                            id: `p${i}-${s.id}`, name: s.pickup_village, lat: s.pickup_lat, lng: s.pickup_lng,
                            kind: "pickup" as const,
                          }))}
                          edges={(t.shipments || []).filter((s: any, i: number) => i > 0).map((s: any) => ({
                            from: [t.shipments[0].pickup_lng, t.shipments[0].pickup_lat],
                            to: [s.pickup_lng, s.pickup_lat],
                            flip: true,
                            tone: "first_mile" as const,
                            dashed: true,
                          }))}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {t.legs?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.legs.map((l: any) => (
                      <span key={l.id} className="chip border-line bg-white text-ink-muted">
                        {titleCase(l.leg_type)} · {l.from_name} → {l.to_name} · {l.distance_km} km
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {next && (
                    <button className={`${next.tone} btn-sm`} disabled={busy === t.id} onClick={() => act(t.id, next.action)}>
                      {busy === t.id ? <Spinner size={12} /> : <next.icon size={13} />} {next.label}
                    </button>
                  )}
                  {t.status === "in_transit" && (
                    <button className="btn-outline btn-sm" disabled={busy === t.id}
                      onClick={() => act(t.id, "arrive_hub")}>Arrived at hub</button>
                  )}
                  {["planned", "loading", "in_transit", "at_hub"].includes(t.status) && (
                    <>
                      <button className="btn-ghost btn-sm" onClick={() => setIncident({ trip: t, kind: "report_delay" })}>
                        <Flag size={12} /> Report delay
                      </button>
                      <button className="btn-danger btn-sm" onClick={() => setIncident({ trip: t, kind: "breakdown" })}>
                        <AlertTriangle size={12} /> Breakdown
                      </button>
                    </>
                  )}
                  {t.status === "delivered" && (
                    <span className="text-[11px] text-emerald-600">
                      Delivery reported {when(t.finished_at)} — Admin verifies POD and closes the record.
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SyntheticNote>
        Trip status changes update the sender&apos;s tracking timeline immediately. Positions are checkpoints, not GPS.
      </SyntheticNote>

      <Modal open={!!incident} onClose={() => setIncident(null)}
        title={incident?.kind === "breakdown" ? "Report a breakdown" : "Report a delay"}
        description="Admin is notified and can generate recovery options."
        footer={<>
          <button className="btn-outline" onClick={() => setIncident(null)}>Cancel</button>
          <button className="btn-danger" disabled={!note.trim() || busy === incident?.trip.id} onClick={report}>
            {busy === incident?.trip.id ? <Spinner /> : null} Submit report
          </button>
        </>}>
        <textarea className="input min-h-[92px]" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Describe the issue, expected duration and current location." />
      </Modal>
    </div>
  );
}
