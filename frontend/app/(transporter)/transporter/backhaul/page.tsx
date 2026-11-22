"use client";

import { ArrowRight, Info, Route, Waypoints } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, Spinner, SyntheticNote, Stat, useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function BackhaulPage() {
  const { ready } = useGuard("transporter");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/backhaul/opportunities");
  const [busy, setBusy] = useState<string | null>(null);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const opps = data?.items || [];

  const respond = async (o: any, accept: boolean) => {
    setBusy(`${o.cargo_type}-${o.lane_km}`);
    try {
      await api.post("/backhaul/offers", {
        cargo_type: o.cargo_type, from_name: "Return corridor", to_name: "Ludhiana",
        extra_distance_km: o.extra_distance_km, revenue: o.revenue, time_hours: o.time_hours, accept,
      });
      push("success", accept ? "Return load accepted" : "Return load declined",
        accept ? `₹${o.revenue} added to this corridor.` : "Admin notified.");
      reload();
    } catch (e: any) {
      push("error", "Could not respond", e?.message);
    } finally {
      setBusy(null);
    }
  };

  const accepted = (data?.offers || []).filter((o: any) => o.status === "accepted");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Open opportunities" value={opps.length} sub="on your current corridors" icon={<Waypoints size={15} />} />
        <Stat label="Recommended" value={opps.filter((o: any) => o.recommend).length}
          sub="net positive and safe" tone="good" />
        <Stat label="Accepted return loads" value={accepted.length}
          sub={inr(accepted.reduce((a: number, o: any) => a + o.revenue, 0), true)} />
      </div>

      {!opps.length ? (
        <EmptyState title="No return-load opportunities" body={data?.note || "Return matching needs an executed trip corridor."}
          icon={<Route size={18} />} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {opps.map((o: any) => {
            const key = `${o.cargo_type}-${o.lane_km}`;
            return (
              <Card key={key} className={o.recommend ? "ring-1 ring-emerald/30" : ""}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{o.label}</span>
                      {o.recommend && <Badge status="verified">recommended</Badge>}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-ink-muted">
                      {o.lane_km} km lane · +{o.extra_distance_km} km detour · {o.time_hours} h
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="label">Net gain</div>
                    <div className={`text-[17px] font-semibold ${o.net_gain > 0 ? "text-ink" : "text-red-600"}`}>
                      {inr(o.net_gain)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ["Load", kg(o.load_kg)],
                    ["Revenue", inr(o.revenue)],
                    ["Extra cost", inr(o.extra_cost)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-soft px-2.5 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-ink-muted">{k}</div>
                      <div className="text-[12px] font-semibold text-ink">{v}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className={`chip ${o.compatible ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-red-200 bg-red-50 text-red-700"}`}>
                      {o.compatible ? "compatible with outbound cargo" : "incompatible cargo"}
                    </span>
                    {o.jeopardises_next_trip && <Badge status="cancelled">next trip at risk</Badge>}
                  </div>
                  {o.compatibility_notes?.length > 0 && (
                    <ul className="text-[10.5px] text-ink-muted">
                      {o.compatibility_notes.slice(0, 2).map((n: string) => <li key={n}>• {n}</li>)}
                    </ul>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-[10px] leading-snug text-ink-muted">{o.rule}</span>
                  <div className="flex gap-1.5">
                    <button className="btn-emerald btn-sm" disabled={busy === key || !o.compatible || o.jeopardises_next_trip}
                      onClick={() => respond(o, true)}>
                      {busy === key ? <Spinner size={12} /> : <ArrowRight size={12} />} Accept
                    </button>
                    <button className="btn-ghost btn-sm" disabled={busy === key} onClick={() => respond(o, false)}>
                      Reject
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-soft/50">
        <div className="flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-ink" />
          <div className="text-[11.5px] leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">The rule is explicit:</span> accept only when incremental
            revenue exceeds incremental cost and the next committed trip is not placed at risk. AgroCompat still
            applies — an incompatible return cargo is blocked even if the money looks good.
          </div>
        </div>
      </Card>

      <SyntheticNote />
    </div>
  );
}
