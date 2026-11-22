"use client";

import { CheckCircle2, Info, Route, Sparkles, Truck, Warehouse } from "lucide-react";
import { useState } from "react";
import MapView from "@/components/LiveMap";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, Modal, SectionHeader, Spinner, SyntheticNote, useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function PlanningPage() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const pools = useApi<any>("/admin/pools");
  const [poolId, setPoolId] = useState<string>("");
  const [plan, setPlan] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [transporters, setTransporters] = useState<any[]>([]);
  const [selectedCand, setSelectedCand] = useState<any>(null);

  if (!ready) return null;
  if (pools.loading && !pools.data) return <Loading rows={3} />;
  if (pools.error) return <ErrorNote message={pools.error} onRetry={pools.reload} />;

  const list = (pools.data?.items || []).filter((p: any) => p.status === "approved" || p.status === "proposed");
  const active = poolId || list[0]?.id;

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.post<any>("/admin/plans/generate", { pool_id: active });
      setPlan(res);
      push("success", "Plan generated", `${res.route_plan.solver} in ${res.route_plan.solve_ms} ms`);
    } catch (e: any) {
      push("error", "Planning failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const openAssign = async () => {
    setBusy(true);
    try {
      const [match, tr] = await Promise.all([
        api.post<any>("/admin/capacity/match", { pool_id: active }),
        api.get<any>("/transporters"),
      ]);
      setCandidates(match.candidates || []);
      setTransporters(tr.items || []);
      setSelectedCand((match.candidates || []).find((c: any) => c.sufficient && c.transporter_verified) || match.candidates?.[0]);
      setAssignOpen(true);
    } catch (e: any) {
      push("error", "Could not load candidates", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const assign = async () => {
    if (!selectedCand) return;
    setBusy(true);
    try {
      const res = await api.post<any>("/admin/assignments", {
        pool_id: active, transporter_id: selectedCand.transporter_id, vehicle_id: selectedCand.vehicle_id,
      });
      push("success", "Assignment proposed", res.message);
      setAssignOpen(false);
    } catch (e: any) {
      push("error", "Assignment failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[260px] flex-1">
            <div className="label">Pool to plan</div>
            <select className="select mt-1" value={active} onChange={(e) => { setPoolId(e.target.value); setPlan(null); }}>
              {list.length === 0 && <option value="">No approved pools</option>}
              {list.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.corridor} · {p.members?.length} consignments · {kg(p.total_kg)} ({p.status})
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary" disabled={!active || busy} onClick={generate}>
            {busy ? <Spinner /> : <Route size={14} />} Generate plan
          </button>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-muted">
          Generates a CVRPTW solution on road-adjusted distances with OR-Tools guided local search, plus a
          two-echelon assembly (first-mile collection to a verified hub, then line-haul). Falls back to greedy
          insertion if the solver is unavailable.
        </p>
      </Card>

      {!plan ? (
        <EmptyState title="No plan generated yet" body="Choose an approved pool and generate a route plan."
          icon={<Route size={18} />} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Solver", plan.route_plan.solver],
              ["Solve time", `${plan.route_plan.solve_ms} ms`],
              ["Total distance", `${plan.route_plan.total_km} km`],
              ["Load factor", `${Math.round((plan.route_plan.load_factor || 0) * 100)}%`],
            ].map(([k, v]) => (
              <Card key={k}>
                <div className="label">{k}</div>
                <div className="mt-1 text-[15px] font-semibold text-ink">{v}</div>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card pad={false}>
              <div className="px-5 py-4"><SectionHeader title="Route plan" subtitle="Stops ordered by the solver" /></div>
              <div className="px-2 pb-2">
                <MapView
                  height={320}
                  padding={0.3}
                  points={(plan.route_plan.routes || []).flatMap((r: any) => r.stops.map((s: any) => ({
                    id: `${r.vehicle_id}-${s.id}`, name: s.name, lat: s.lat, lng: s.lng, kind: "stop" as const,
                    meta: `${Math.round(s.demand_kg)} kg · ETA ${s.eta_min}`,
                  })))}
                  edges={(plan.route_plan.routes || []).flatMap((r: any) =>
                    r.stops.slice(1).map((s: any, i: number) => ({
                      from: [r.stops[i].lng, r.stops[i].lat] as [number, number],
                      to: [s.lng, s.lat] as [number, number],
                      flip: true,
                      tone: "first_mile" as const,
                    })))}
                />
              </div>
            </Card>

            <div className="space-y-4">
              <Card>
                <SectionHeader title="Vehicle routes" />
                <div className="space-y-2">
                  {(plan.route_plan.routes || []).map((r: any) => (
                    <div key={r.vehicle_id} className="rounded-xl border border-line px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12.5px] font-semibold text-ink">{r.vehicle_id}</span>
                        <Badge status="confirmed">{titleCase(r.vehicle_class)}</Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-ink-muted">
                        {r.stops.length} stops · {r.distance_km} km · {kg(r.load_kg)} / {kg(r.capacity_kg)} ({Math.round(r.load_factor * 100)}%)
                      </div>
                      <div className="text-[10.5px] text-ink-muted">Cost {inr(r.cost)}</div>
                    </div>
                  ))}
                  {plan.route_plan.unassigned?.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                      {plan.route_plan.unassigned.length} stop(s) could not be served with current capacity.
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <SectionHeader title="Hub selection" subtitle="Constrained k-median over the village graph" />
                {plan.hub_choice.hubs?.length ? (
                  <div className="space-y-2">
                    {plan.hub_choice.hubs.map((h: any) => (
                      <div key={h.id} className="rounded-xl border border-line px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-ink">{h.name}</span>
                          <Badge status={h.safety_verified ? "verified" : "pending"}>
                            {h.safety_verified ? "verified" : "candidate"}
                          </Badge>
                        </div>
                        <div className="text-[10.5px] text-ink-muted">
                          coverage {Math.round((h.coverage || 0) * 100)}% · avg {h.avg_km} km · {h.operating_window}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-[12px] text-ink-muted">{plan.hub_choice.note}</div>}
              </Card>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionHeader title="Two-echelon assembly" subtitle={plan.two_echelon.note} />
              <div className="mb-3 flex items-center gap-2">
                <Badge status={plan.two_echelon.mode === "two_echelon" ? "verified" : "pending"}>
                  {plan.two_echelon.mode === "two_echelon" ? "two-echelon" : "direct"}
                </Badge>
                {plan.two_echelon.total_km && <span className="text-[11px] text-ink-muted">{plan.two_echelon.total_km} km total</span>}
              </div>
              <div className="space-y-2">
                {(plan.two_echelon.legs || []).map((l: any, i: number) => (
                  <div key={i} className="rounded-xl border border-line px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold capitalize text-ink">
                        {l.leg_type === "line_haul" ? <Truck size={12} /> : <Warehouse size={12} />}
                        {l.leg_type.replace("_", " ")}
                      </span>
                      <span className="text-[11px] text-ink-muted">{l.vehicle_class ? titleCase(l.vehicle_class) : ""}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-ink-muted">
                      {l.stops?.join(" → ")} · {l.distance_km} km
                      {l.transfer_window ? ` · transfer ${l.transfer_window}` : ""}
                      {l.eta_min ? ` · ETA ${l.eta_min} min` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <SectionHeader title="Compatibility & next step" />
              <div className={`rounded-xl border px-3 py-2.5 ${plan.compatibility.compatible ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <Sparkles size={13} className={plan.compatibility.compatible ? "text-emerald-600" : "text-red-600"} />
                  <span className={plan.compatibility.compatible ? "text-emerald-800" : "text-red-700"}>
                    {plan.compatibility.compatible ? "AgroCompat cleared" : "AgroCompat blocked"}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-muted">{plan.compatibility.recommendation}</div>
              </div>

              <div className="mt-4 space-y-2">
                <button className="btn-primary w-full" disabled={busy} onClick={openAssign}>
                  <Truck size={14} /> Match capacity & create assignment
                </button>
                <a href="/admin/allocations" className="btn-outline w-full">
                  <CheckCircle2 size={14} /> Compute fair share (required before dispatch)
                </a>
              </div>
              <p className="mt-3 text-[10.5px] leading-relaxed text-ink-muted">
                Assignment requires an existing Shapley allocation for every consignment in the pool.
              </p>
            </Card>
          </div>
        </>
      )}

      <SyntheticNote>Route distances use road-adjusted geometry; travel times are modelled, not observed.</SyntheticNote>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Create assignment"
        description="Only verified vehicles with sufficient payload are selectable." width="max-w-xl"
        footer={<>
          <button className="btn-outline" onClick={() => setAssignOpen(false)}>Cancel</button>
          <button className="btn-primary" disabled={busy || !selectedCand} onClick={assign}>
            {busy ? <Spinner /> : <Truck size={14} />} Propose assignment
          </button>
        </>}>
        <div className="space-y-2">
          {candidates.map((c: any) => (
            <button key={c.id} onClick={() => setSelectedCand(c)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                selectedCand?.id === c.id ? "border-ink bg-ink/[0.04]" : "border-line hover:border-ink/25"}`}>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-ink">{c.reg_no}</span>
                <div className="flex gap-1.5">
                  {c.sufficient ? <Badge status="verified">fits load</Badge> : <Badge status="pending">too small</Badge>}
                  {c.transporter_verified ? <Badge status="approved">verified</Badge> : <Badge status="rejected">unverified</Badge>}
                </div>
              </div>
              <div className="mt-0.5 text-[11px] text-ink-muted">
                {c.transporter_name} · {titleCase(c.vehicle_class)} · {kg(c.payload_kg)} · ₹{c.reserve_price_per_km}/km
              </div>
            </button>
          ))}
          {!candidates.length && <div className="text-[12px] text-ink-muted">No published capacity blocks available.</div>}
        </div>
      </Modal>
    </div>
  );
}
