"use client";

import { AlertTriangle, CheckCircle2, Snowflake, Wrench } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, Spinner, SyntheticNote, Table, useToast,
} from "@/components/ui";
import { api, inr, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function Recovery() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/recovery/scenarios");
  const [selected, setSelected] = useState<string>("");
  const [reason, setReason] = useState("Vehicle breakdown reported by driver");
  const [plan, setPlan] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const trips = data?.trips_at_risk || [];
  const active = selected || trips[0]?.id;

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.post<any>("/recovery/heal", {
        trip_id: active, event_type: "breakdown", description: reason,
      });
      setPlan(res);
      push(res.status === "feasible" ? "success" : "warning", `Recovery ${res.status}`, res.explanation?.slice(0, 120));
      reload();
    } catch (e: any) {
      push("error", "Recovery failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await api.post(`/recovery/${plan.recovery_id}/approve`);
      push("success", "Recovery plan approved", "No silent reassignment — this was your explicit approval.");
      setPlan(null);
      reload();
    } catch (e: any) {
      push("error", "Could not approve", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader title="ShadowFleet-Heal" eyebrow="Proactive recovery"
          subtitle="Freeze unaffected assignments, release only affected loads, retrieve feasible alternatives, then run a fast local repair." />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label>
            <div className="mb-1.5 text-[12px] font-semibold text-ink">Trip at risk</div>
            <select className="select" value={active} onChange={(e) => { setSelected(e.target.value); setPlan(null); }}>
              {trips.length === 0 && <option value="">No active trips</option>}
              {trips.map((t: any) => (
                <option key={t.id} value={t.id}>{t.trip_code} · {t.reg_no} · {titleCase(t.status)}</option>
              ))}
            </select>
          </label>
          <label>
            <div className="mb-1.5 text-[12px] font-semibold text-ink">Disruption</div>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button className="btn-primary" disabled={!active || busy} onClick={run}>
            {busy ? <Spinner /> : <Wrench size={14} />} Run recovery
          </button>
        </div>
      </Card>

      {plan && (
        <>
          <Card className={plan.status === "feasible" ? "border-emerald-200 bg-emerald-50/30" :
            plan.status === "partial" ? "border-amber-200 bg-amber-50/30" : "border-red-200 bg-red-50/30"}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge status={plan.status}>{plan.status}</Badge>
                  <span className="text-[11px] text-ink-muted">solved in {plan.solve_ms} ms</span>
                </div>
                <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-ink-muted">{plan.explanation}</p>
              </div>
              <button className="btn-primary btn-sm" disabled={busy || plan.status === "infeasible"} onClick={approve}>
                <CheckCircle2 size={13} /> Approve reassignment
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Affected loads", plan.affected_count ?? plan.assignments.length],
                ["Frozen commitments", plan.frozen?.length ?? 0],
                ["Extra cost", inr(plan.extra_cost)],
                ["Plan-change penalty", inr(plan.plan_stability_penalty)],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-white px-3 py-2.5">
                  <div className="label">{k}</div>
                  <div className="mt-0.5 text-[14px] font-semibold text-ink">{v}</div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card pad={false}>
              <div className="px-5 py-4"><SectionHeader title="Proposed reassignment" /></div>
              {plan.assignments?.length ? (
                <Table head={["Vehicle", "Action", "Shipments", "Distance", "Cost", "Delay"]}>
                  {plan.assignments.map((a: any, i: number) => (
                    <tr key={i}>
                      <td className="td font-semibold">{a.vehicle_id}</td>
                      <td className="td text-[11px] capitalize">{a.action.replace(/_/g, " ")}</td>
                      <td className="td text-[11px]">{a.shipment_ids.length}</td>
                      <td className="td">{a.distance_km} km</td>
                      <td className="td font-semibold">{inr(a.cost)}</td>
                      <td className="td text-[11px]">+{a.delay_min} min</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <div className="px-5 pb-5">
                  <EmptyState title="No feasible standby capacity"
                    body="Recovery is unavailable — the system cannot create a vehicle." icon={<AlertTriangle size={18} />} />
                </div>
              )}
            </Card>

            <Card>
              <SectionHeader title="Frozen (unaffected) commitments" subtitle="Plans already communicated to senders are not silently changed" />
              <div className="space-y-1.5">
                {(plan.frozen || []).map((f: any) => (
                  <div key={f.shipment_id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px]">
                    <Snowflake size={11} className="text-blue-500" />
                    <span className="font-medium text-ink">{f.code}</span>
                    <span className="text-ink-muted">frozen</span>
                  </div>
                ))}
                {!(plan.frozen || []).length && <div className="text-[12px] text-ink-muted">No other commitments to freeze.</div>}
              </div>
              {plan.uncovered?.length > 0 && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                  {plan.uncovered.length} load(s) could not be covered: {plan.uncovered.map((u: any) => u.code).join(", ")}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      <Card pad={false}>
        <div className="px-5 py-4"><SectionHeader title="Recent disruptions" /></div>
        <Table head={["When", "Type", "Description", "Severity", "Reported by"]}
          empty={!data?.recent_disruptions?.length}>
          {(data?.recent_disruptions || []).map((d: any) => (
            <tr key={d.id}>
              <td className="td text-[11px] text-ink-muted">{when(d.detected_at)}</td>
              <td className="td capitalize">{d.event_type.replace(/_/g, " ")}</td>
              <td className="td text-[11.5px]">{d.description}</td>
              <td className="td"><Badge status={d.severity === "high" ? "rejected" : "pending"}>{d.severity}</Badge></td>
              <td className="td text-[11px] text-ink-muted">{d.reported_by || "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card className="bg-soft/50">
        <p className="text-[11.5px] leading-relaxed text-ink-muted">
          <strong className="text-ink">No silent recovery.</strong> Every reassignment needs Admin approval, and the
          extra cost, added delay and number of changed commitments are shown before you approve. If no feasible
          backup exists, the platform says so rather than inventing capacity.
        </p>
      </Card>
      <SyntheticNote />
    </div>
  );
}
