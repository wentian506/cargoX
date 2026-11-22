"use client";

import { Brain, CalendarRange, TrendingUp } from "lucide-react";
import { useState } from "react";
import { ForecastRibbon } from "@/components/charts";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, Progress, SectionHeader, Stat, SyntheticNote, Table, Tabs,
} from "@/components/ui";
import { kg } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function HarvestPulse() {
  const { ready } = useGuard("admin");
  const [horizon, setHorizon] = useState(21);
  const { data, loading, error, reload } = useApi<any>(`/forecasts/harvestpulse?horizon_days=${horizon}`, [horizon]);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const clusters = data?.clusters || [];
  const totalP50 = clusters.reduce((a: number, c: any) => a + c.totals.p50_kg, 0);
  const totalCommitted = clusters.reduce((a: number, c: any) => a + (c.committed_capacity_kg || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label">HarvestPulse</div>
            <h2 className="mt-0.5 text-[16px] font-semibold text-ink">Harvest-ready demand genesis</h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-ink-muted">
              Layer A estimates the harvest window from crop phenology; Layer B applies selling-behaviour lag priors;
              Layer C aggregates to cluster-day demand with p10/p50/p90 bands. A seasonal-naive baseline is reported
              alongside so forecast error can be measured honestly.
            </p>
          </div>
          <Tabs tabs={[7, 14, 21, 35].map((h) => ({ key: String(h), label: `${h} days` }))}
            active={String(horizon)} onChange={(k) => setHorizon(Number(k))} size="sm" />
        </div>
      </Card>

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Forecast demand (p50)" value={kg(totalP50)} sub={`${horizon}-day horizon`} icon={<Brain size={15} />} />
        <Stat label="Committed capacity" value={kg(totalCommitted)} sub="published + reserved" tone="good" />
        <Stat label="Coverage" value={`${totalP50 ? Math.round((totalCommitted / totalP50) * 100) : 0}%`}
          sub={totalCommitted >= totalP50 ? "covered" : "standby needed"}
          tone={totalCommitted >= totalP50 ? "good" : "warn"} />
        <Stat label="Clusters" value={clusters.length} sub="active village clusters" icon={<CalendarRange size={15} />} />
      </div>

      {!clusters.length ? (
        <EmptyState title="No clusters" body="Seed cluster data to generate forecasts." />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {clusters.slice(0, 4).map((c: any) => (
              <Card key={c.cluster_id}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{c.cluster_id}</span>
                      <Badge status="active" className="capitalize">{c.crop_id}</Badge>
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-muted">
                      window {c.harvest_window.start} → {c.harvest_window.end} · method {c.method}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="label">p50 total</div>
                    <div className="text-[15px] font-semibold text-ink">{kg(c.totals.p50_kg)}</div>
                  </div>
                </div>

                <div className="mt-2"><ForecastRibbon data={c.ribbon} height={160} /></div>

                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  {[
                    ["p10", kg(c.totals.p10_kg)],
                    ["p50", kg(c.totals.p50_kg)],
                    ["p90", kg(c.totals.p90_kg)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-soft px-2 py-1.5">
                      <div className="text-[9.5px] uppercase tracking-wider text-ink-muted">{k}</div>
                      <div className="font-semibold text-ink">{v}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-2.5">
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="text-ink-muted">capacity coverage</span>
                    <span className="font-semibold text-ink">{Math.round((c.coverage_ratio || 0) * 100)}%</span>
                  </div>
                  <Progress value={Math.min(1, c.coverage_ratio || 0)} tone={(c.coverage_ratio || 0) >= 1 ? "emerald" : "amber"} />
                  <div className="mt-1 text-[10px] text-ink-muted">
                    committed {kg(c.committed_capacity_kg)} · gap {kg(c.gap_kg)}
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {Object.entries(c.lag_bands || {}).map(([band, k]) => (
                    <span key={band} className="chip border-line bg-white text-[10px] text-ink-muted">
                      {band}: {kg(Number(k))}
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          <Card pad={false}>
            <div className="px-5 py-4"><SectionHeader title="Cluster forecast table" subtitle="Consented aggregate output — never an individual farmer prediction" /></div>
            <Table head={["Cluster", "Crop", "p10", "p50", "p90", "Confidence", "Naive baseline", "Committed", "Coverage"]}>
              {clusters.map((c: any) => (
                <tr key={c.cluster_id} className="transition-colors hover:bg-soft/60">
                  <td className="td font-semibold text-ink">{c.cluster_id}</td>
                  <td className="td capitalize">{c.crop_id}</td>
                  <td className="td text-ink-muted">{kg(c.totals.p10_kg)}</td>
                  <td className="td font-semibold">{kg(c.totals.p50_kg)}</td>
                  <td className="td text-ink-muted">{kg(c.totals.p90_kg)}</td>
                  <td className="td">{Math.round(c.confidence * 100)}%</td>
                  <td className="td text-ink-muted">{kg(c.seasonal_naive_baseline_kg)}</td>
                  <td className="td">{kg(c.committed_capacity_kg)}</td>
                  <td className="td">
                    <Badge status={(c.coverage_ratio || 0) >= 1 ? "verified" : "pending"}>
                      {Math.round((c.coverage_ratio || 0) * 100)}%
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}

      <Card className="bg-soft/50">
        <div className="flex items-start gap-2.5">
          <TrendingUp size={14} className="mt-0.5 shrink-0 text-ink" />
          <p className="text-[11.5px] leading-relaxed text-ink-muted">{data?.method_note}</p>
        </div>
      </Card>
      <SyntheticNote>Forecasts are model outputs from crop priors and synthetic history, not field-validated predictions.</SyntheticNote>
    </div>
  );
}
