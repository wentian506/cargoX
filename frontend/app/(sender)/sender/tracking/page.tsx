"use client";

import { CheckCircle2, Clock, MapPin, Navigation, Radio, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import ArrivalClock from "@/components/ArrivalClock";
import LiveTripPanel from "@/components/LiveTripPanel";

import {
  Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, SyntheticNote, Tabs,
} from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { when } from "@/lib/api";
import { useGuard } from "@/lib/session";

export default function TrackingPage() {
  const { ready } = useGuard("sender");
  const ships = useApi<any>("/shipments?page_size=100");
  const [selected, setSelected] = useState<string | null>(null);
  const items = (ships.data?.items || []).filter((s: any) =>
    ["confirmed", "ready_for_pickup", "in_transit", "at_transfer_hub", "out_for_delivery", "delivered", "matched"].includes(s.status),
  );
  const active = selected || items[0]?.id;
  const detail = useApi<any>(active ? `/shipments/${active}/tracking` : null, [active]);
  // the tracking payload has no assignment block; the clock ships with the record
  const record = useApi<any>(active ? `/shipments/${active}` : null, [active]);

  if (!ready) return null;
  if (ships.loading && !ships.data) return <Loading rows={3} />;
  if (ships.error) return <ErrorNote message={ships.error} onRetry={ships.reload} />;

  if (!items.length) {
    return (
      <EmptyState
        title="Nothing in execution yet"
        body="Once Admin confirms an assignment, the trip appears here with its operational checkpoints."
        action={<Link href="/sender/shipments" className="btn-outline btn-sm">View all shipments</Link>}
        icon={<Truck size={18} />}
      />
    );
  }

  const d = detail.data;
  const s = d?.shipment;
  const trip = d?.trip;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card pad={false} className="h-fit overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <div className="label">In execution</div>
          <div className="text-[12.5px] font-semibold text-ink">{items.length} shipment(s)</div>
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {items.map((x: any) => (
            <button key={x.id} onClick={() => setSelected(x.id)}
              className={`w-full border-b border-line/70 px-4 py-3 text-left transition-colors last:border-0 hover:bg-soft ${
                active === x.id ? "bg-ink/[0.04]" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-ink">{x.code}</span>
                <Badge status={x.status} />
              </div>
              <div className="mt-0.5 truncate text-[11px] text-ink-muted">
                {x.pickup_village} → {x.destination_name}
              </div>
              <div className="text-[10.5px] text-ink-muted">{Math.round(x.quantity_kg)} kg · {x.commodity}</div>
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        {detail.loading && !d ? (
          <Loading rows={2} />
        ) : d && (
          <>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[19px] font-semibold text-ink">{s.code}</h2>
                    <Badge status={s.status} dot />
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    {s.pickup_village} → {s.destination_name} · {Math.round(s.quantity_kg)} kg · {s.commodity}
                  </p>
                </div>
                <Link href={`/sender/shipments/${s.id}`} className="btn-outline btn-sm">Open record</Link>
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-soft/50 px-3 py-2.5">
                <Radio size={14} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="text-[11.5px] leading-relaxed text-ink-muted">
                  <span className="font-semibold text-ink">Position source is labelled on every map.</span> A
                  transporter device fix shows as <b>live feed</b>; before any device reports, the marker is
                  interpolated from the planned legs and the trip clock and is marked <b>modelled</b>. The platform
                  never invents a location and never presents a model as a measurement.
                </div>
              </div>
            </Card>

            {(d?.arrival || record.data?.arrival) && <ArrivalClock data={d?.arrival || record.data?.arrival} />}

            {trip?.id && <LiveTripPanel tripId={trip.id} refreshMs={30000} height={330} />}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <SectionHeader title="Trip legs" subtitle={trip ? `Trip ${trip.code}` : "Not yet dispatched"} />
                {trip?.legs?.length ? (
                  <div className="space-y-2">
                    {trip.legs.map((leg: any) => (
                      <div key={leg.id} className="rounded-xl border border-line px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold capitalize text-ink">
                            {leg.leg_type.replace("_", " ")}
                          </span>
                          <Badge status={leg.status === "done" ? "delivered" : leg.status === "active" ? "in_transit" : "planned"}>
                            {leg.status}
                          </Badge>
                        </div>
                        <div className="mt-1 text-[11px] text-ink-muted">
                          {leg.from_name} → {leg.to_name} · {leg.distance_km} km · {leg.eta_minutes} min
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No legs recorded" body="Legs appear once the transporter starts the trip." />
                )}
                {trip && (
                  <div className="mt-3 flex items-center gap-2 text-[11.5px] text-ink-muted">
                    <Truck size={13} /> {trip.driver || "Driver not assigned"} · started {when(trip.started_at)}
                  </div>
                )}
              </Card>
            </div>

            <Card>
              <SectionHeader title="Checkpoint history" />
              <div className="space-y-3">
                {(d.events || []).slice().reverse().map((e: any) => (
                  <div key={e.id} className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald" />
                    <div>
                      <div className="text-[12.5px] font-medium text-ink">
                        {e.event_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </div>
                      {e.payload?.note && <div className="text-[11px] text-ink-muted">{e.payload.note}</div>}
                      <div className="text-[10.5px] text-ink-muted/80">{when(e.created_at)}</div>
                    </div>
                  </div>
                ))}
                {!(d.events || []).length && <div className="text-[12px] text-ink-muted">No checkpoints recorded yet.</div>}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
