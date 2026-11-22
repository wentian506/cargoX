"use client";

import { Gauge, ShieldCheck, TrendingUp, Truck } from "lucide-react";
import { RadarScore } from "@/components/charts";
import { Card, ErrorNote, Loading, Progress, SectionHeader, Stat, SyntheticNote } from "@/components/ui";
import { inr } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function Performance() {
  const { ready } = useGuard("transporter");
  const perf = useApi<any>("/transporters/me/performance");
  const vehicles = useApi<any>("/vehicles");

  if (!ready) return null;
  if (perf.loading && !perf.data) return <Loading rows={3} />;
  if (perf.error) return <ErrorNote message={perf.error} onRetry={perf.reload} />;

  const p = perf.data || {};
  const radar = [
    { metric: "Utilisation", a: Math.round((p.utilisation || 0) * 100), b: 45 },
    { metric: "Revenue/km", a: Math.min(100, Math.round(((p.revenue_per_km || 0) / 60) * 100)), b: 50 },
    { metric: "Completion", a: p.trips_total ? Math.round((p.trips_completed / p.trips_total) * 100) : 0, b: 60 },
    { metric: "Fleet verified", a: p.vehicles ? Math.round((p.vehicles_verified / p.vehicles) * 100) : 0, b: 100 },
    { metric: "Low empty-km", a: Math.max(0, 100 - Math.round(((p.empty_km_estimate || 0) / Math.max(p.km_completed || 1, 1)) * 100 * 3)), b: 50 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Fleet utilisation" value={`${Math.round((p.utilisation || 0) * 100)}%`}
          sub="active trips / vehicles" icon={<Gauge size={15} />} tone="warn" />
        <Stat label="Trips completed" value={p.trips_completed ?? 0} sub={`${p.trips_total ?? 0} total`}
          icon={<TrendingUp size={15} />} tone="good" />
        <Stat label="Verified vehicles" value={`${p.vehicles_verified ?? 0}/${p.vehicles ?? 0}`}
          sub="assignment eligible" icon={<ShieldCheck size={15} />} />
        <Stat label="Revenue per km" value={`₹${p.revenue_per_km ?? 0}`} sub="completed trips" icon={<Truck size={15} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Fleet profile" subtitle="Your fleet against a typical rural baseline (synthetic benchmark)" />
          <RadarScore data={radar} />
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader title="Vehicle economics" />
            <div className="space-y-3">
              {(vehicles.data?.items || []).map((v: any) => (
                <div key={v.id}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-ink">{v.reg_no}</span>
                    <span className="text-ink-muted">₹{v.cost_per_km}/km · {v.payload_kg} kg</span>
                  </div>
                  <div className="mt-1"><Progress value={v.verified ? 1 : 0.4} tone={v.verified ? "emerald" : "amber"} /></div>
                  <div className="mt-0.5 text-[10px] text-ink-muted">
                    {v.verified ? "verified — assignment eligible" : "pending verification"}
                  </div>
                </div>
              ))}
              {!(vehicles.data?.items || []).length && (
                <div className="text-[12px] text-ink-muted">No vehicles registered.</div>
              )}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Reliability" />
            <div className="space-y-2 text-[12px]">
              {[
                ["On-time rate", p.on_time_rate !== null ? `${Math.round((p.on_time_rate || 0) * 100)}%` : "—", "from recorded trips"],
                ["Completed revenue", inr(p.revenue_completed, true), "verified trips"],
                ["Empty-km estimate", `${p.empty_km_estimate} km`, "derived, not telemetry"],
              ].map(([k, v, s]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-ink-muted">{k}</span>
                  <span className="font-semibold text-ink">{v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <SyntheticNote>
        The benchmark line is a synthetic reference. CARGOX does not claim fleet-wide performance statistics without
        validated operational logs.
      </SyntheticNote>
    </div>
  );
}
