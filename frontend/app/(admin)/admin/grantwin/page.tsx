"use client";

import { ArrowRight, MapPin, Truck, Warehouse } from "lucide-react";
import { useState } from "react";
import MapView from "@/components/LiveMap";
import {
  Badge, Card, ErrorNote, Loading, Progress, SectionHeader, Spinner, SyntheticNote, Table, useToast,
} from "@/components/ui";
import { api, kg, titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function GramTwin() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const hubs = useApi<any>("/hubs");
  const corridor = useApi<any>("/corridor");
  const [plan, setPlan] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  if (!ready) return null;
  if (hubs.loading && !hubs.data) return <Loading rows={3} />;
  if (hubs.error) return <ErrorNote message={hubs.error} onRetry={hubs.reload} />;

  const villages = corridor.data?.villages || [];
  const hubList = hubs.data?.items || [];
  const selection = hubs.data?.selection || {};

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.post<any>("/routes/generate", {
        village_ids: selected.length ? selected : villages.slice(0, 5).map((v: any) => v.id),
        destination_id: "M-KHN",
        demand_kg: 1800,
      });
      setPlan(res);
      push("success", "Route plan generated", res.single_echelon.solver);
    } catch (e: any) {
      push("error", "Could not generate", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="label">GramTwin-2E</div>
            <h2 className="mt-0.5 text-[16px] font-semibold text-ink">Two-stage relay: first-mile + line-haul</h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-ink-muted">
              Tier 1 collects farm-gate lots with a tractor-trolley, tempo or pickup into a surfaced-road micro-hub.
              Tier 2 moves the consolidated load to the mandi or warehouse in a larger LCV/truck, synchronised inside
              the hub transfer window.
            </p>
          </div>
          <button className="btn-primary" disabled={busy} onClick={generate}>
            {busy ? <Spinner /> : <Truck size={14} />} Generate relay plan
          </button>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card pad={false}>
          <div className="px-5 py-4">
            <SectionHeader title="Corridor map" subtitle="Click villages to include them in the plan (default: first 5)" />
          </div>
          <div className="px-2 pb-2">
            <MapView
              height={360}
              padding={0.15}
              onSelect={(p) => p.kind === "village" && toggle(p.id)}
              points={[
                ...villages.map((v: any) => ({
                  id: v.id, name: v.name, lat: v.lat, lng: v.lng, kind: "village" as const,
                  selected: selected.includes(v.id), meta: selected.includes(v.id) ? "selected" : "click to select",
                })),
                ...hubList.map((h: any) => ({
                  id: h.id, name: h.name, lat: h.lat, lng: h.lng, kind: "hub" as const,
                  meta: h.safety_verified ? "safety verified" : "candidate",
                })),
                ...(corridor.data?.mandis || []).map((m: any) => ({
                  id: m.id, name: m.name, lat: m.lat, lng: m.lng, kind: "mandi" as const,
                  meta: `queue ~${m.queue_minutes} min`,
                })),
              ]}
            />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader title="Hub selection" subtitle="Constrained k-median" />
            <div className="mb-3 flex items-center justify-between text-[12px]">
              <span className="text-ink-muted">coverage</span>
              <span className="font-semibold text-ink">{Math.round((selection.coverage || 0) * 100)}%</span>
            </div>
            <Progress value={selection.coverage || 0} tone={(selection.coverage || 0) > 0.6 ? "emerald" : "amber"} />
            <div className="mt-3 space-y-2">
              {(selection.hubs || []).map((h: any) => (
                <div key={h.id} className="rounded-xl border border-line px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-ink">{h.name}</span>
                    <Badge status={h.safety_verified ? "verified" : "pending"}>
                      {h.safety_verified ? "verified" : "candidate"}
                    </Badge>
                  </div>
                  <div className="text-[10.5px] text-ink-muted">
                    {kg(h.capacity_kg)} · {h.operating_window} · avg {h.avg_km} km
                  </div>
                </div>
              ))}
              {!selection.hubs?.length && <div className="text-[12px] text-ink-muted">{selection.note}</div>}
            </div>
          </Card>

          <Card>
            <SectionHeader title="All hubs" />
            <Table head={["Hub", "Type", "Window", "Capacity"]} dense>
              {hubList.map((h: any) => (
                <tr key={h.id}>
                  <td className="td py-2 text-[11.5px]">{h.name}</td>
                  <td className="td py-2">
                    <Badge status={h.safety_verified ? "verified" : "pending"}>{h.hub_type}</Badge>
                  </td>
                  <td className="td py-2 text-[10.5px] text-ink-muted">{h.operating_window}</td>
                  <td className="td py-2 text-[10.5px]">{kg(h.capacity_kg)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      </div>

      {plan && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionHeader title="Single-echelon (direct)" subtitle={`${plan.single_echelon.solver} · ${plan.single_echelon.solve_ms} ms`} />
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Routes", plan.single_echelon.routes.length],
                ["Distance", `${plan.single_echelon.total_km} km`],
                ["Load factor", `${Math.round((plan.single_echelon.load_factor || 0) * 100)}%`],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-lg bg-soft px-2.5 py-2">
                  <div className="text-[9.5px] uppercase tracking-wider text-ink-muted">{k}</div>
                  <div className="text-[12.5px] font-semibold text-ink">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {(plan.single_echelon.routes || []).map((r: any) => (
                <div key={r.vehicle_id} className="rounded-xl border border-line px-3 py-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-ink">{r.vehicle_id}</span>
                    <span className="text-ink-muted">{r.stops.length} stops · {r.load_factor ? Math.round(r.load_factor * 100) : 0}% load</span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-ink-muted">
                    {r.stops.map((s: any) => s.name).join(" → ")}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-ink/20">
            <SectionHeader title="Two-echelon relay" subtitle={plan.two_echelon.note} />
            <div className="mb-3 flex items-center gap-2">
              <Badge status={plan.two_echelon.mode === "two_echelon" ? "verified" : "pending"}>
                {plan.two_echelon.mode === "two_echelon" ? "two-echelon enabled" : "direct fallback"}
              </Badge>
              {plan.two_echelon.total_km && <span className="text-[11px] text-ink-muted">{plan.two_echelon.total_km} km</span>}
            </div>
            <div className="space-y-2">
              {(plan.two_echelon.legs || []).map((l: any, i: number) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink text-accent">
                    {l.leg_type === "line_haul" ? <Truck size={12} /> : <Warehouse size={12} />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold capitalize text-ink">{l.leg_type.replace("_", " ")}</div>
                    <div className="text-[10.5px] leading-snug text-ink-muted">
                      {l.stops?.join(" → ")} · {l.distance_km} km
                      {l.transfer_window && ` · transfer window ${l.transfer_window}`}
                    </div>
                  </div>
                  {i === 0 && <ArrowRight size={12} className="mt-2 ml-auto shrink-0 text-ink-muted" />}
                </div>
              ))}
            </div>
            {plan.two_echelon.hub && (
              <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                <MapPin size={12} /> Via {plan.two_echelon.hub.name}
              </div>
            )}
          </Card>
        </div>
      )}

      <Card className="bg-soft/50">
        <p className="text-[11.5px] leading-relaxed text-ink-muted">
          <strong className="text-ink">Hub feasibility gate.</strong> A hub must be safe, legally usable, open during
          the planned window and approved by the local partner. Where no hub qualifies, the planner falls back to
          direct trips rather than inventing an intermediate point.
        </p>
      </Card>
      <SyntheticNote />
    </div>
  );
}
