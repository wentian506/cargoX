"use client";

import { Download, Printer } from "lucide-react";
import { BarsChart, Donut, LineTrend } from "@/components/charts";
import {
  Card, ErrorNote, Loading, Progress, SectionHeader, Stat, SyntheticNote, Table, useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function AdminAnalytics() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/analytics/admin");
  const overview = useApi<any>("/admin/overview");

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const exportCsv = async (kind: string) => {
    const text = await api.raw(`/analytics/export?kind=${kind}`);
    const blob = new Blob([text], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cargox-${kind}.csv`;
    a.click();
    push("success", `${kind} exported`);
  };

  const sh = data.shipments;
  const op = data.operations;
  const fair = data.fairness;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Reporting</div>
          <h2 className="mt-1 text-[20px] font-semibold text-ink">Operational, financial and fairness analytics</h2>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline btn-sm" onClick={() => exportCsv("shipments")}><Download size={13} /> Shipments</button>
          <button className="btn-outline btn-sm" onClick={() => exportCsv("allocations")}><Download size={13} /> Allocations</button>
          <button className="btn-outline btn-sm" onClick={() => exportCsv("trips")}><Download size={13} /> Trips</button>
          <button className="btn-ghost btn-sm" onClick={() => window.print()}><Printer size={13} /> Print / PDF</button>
        </div>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Shipments" value={sh.total} sub={`${kg(sh.volume_kg)} volume`} />
        <Stat label="On-time rate" value={op.on_time_rate !== null ? `${Math.round(op.on_time_rate * 100)}%` : "—"}
          sub={`${op.trips_delivered}/${op.trips_total} trips`} tone="good" />
        <Stat label="Fairness pass rate" value={fair.participation_pass_rate !== null ? `${Math.round(fair.participation_pass_rate * 100)}%` : "—"}
          sub={`${fair.allocations} allocations`} />
        <Stat label="Freight savings" value={inr(fair.total_savings, true)} sub="approved + pending" tone="good" />
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Senders" value={data.growth.senders} sub="accounts" />
        <Stat label="Transporters" value={data.growth.transporters} sub={`${data.growth.verified_transporters} verified`} />
        <Stat label="Active shipments" value={op.active} sub={`${op.delayed} delayed`} tone={op.delayed ? "warn" : "default"} />
        <Stat label="Capacity coverage" value={`${Math.round((overview.data?.capacity_coverage_ratio || 0) * 100)}%`}
          sub={kg(overview.data?.uncovered_demand_kg) + " uncovered"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <SectionHeader title="Volume by commodity" subtitle="All shipments excluding cancellations" />
          {sh.by_commodity?.length ? (
            <BarsChart data={sh.by_commodity.map((c: any) => ({ crop: titleCase(c.commodity), kg: Math.round(c.kg) }))}
              xKey="crop" series={[{ key: "kg", label: "Volume (kg)", colour: "#123D32" }]} />
          ) : <div className="py-10 text-center text-[12px] text-ink-muted">No data.</div>}
        </Card>
        <Card>
          <SectionHeader title="Status distribution" />
          {sh.by_status?.length ? (
            <Donut data={sh.by_status.map((s: any) => ({ name: titleCase(s.status), value: s.count }))} />
          ) : <div className="py-10 text-center text-[12px] text-ink-muted">No data.</div>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card pad={false}>
          <div className="px-5 py-4"><SectionHeader title="Pickup concentration" subtitle="Top villages by shipment count" /></div>
          <Table head={["Village", "Shipments", "Share"]}>
            {(sh.by_village || []).slice(0, 8).map((v: any) => (
              <tr key={v.village}>
                <td className="td font-medium">{v.village}</td>
                <td className="td">{v.count}</td>
                <td className="td w-32">
                  <Progress value={v.count / Math.max(...sh.by_village.map((x: any) => x.count))} />
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader title="Fairness & participation" />
            <div className="space-y-2.5 text-[12px]">
              {[
                ["Allocations computed", fair.allocations],
                ["Participation check pass rate", fair.participation_pass_rate !== null
                  ? `${Math.round(fair.participation_pass_rate * 100)}%` : "—"],
                ["Sender-approved", fair.approved],
                ["Total savings generated", inr(fair.total_savings)],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between border-b border-line pb-1.5 last:border-0">
                  <span className="text-ink-muted">{k}</span>
                  <span className="font-semibold text-ink">{v}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionHeader title="Forecast accuracy" subtitle="Measured against the seasonal-naive baseline once pilot logs exist" />
            <div className="rounded-xl border border-dashed border-line bg-soft/40 px-3.5 py-4 text-center">
              <div className="text-[12px] font-semibold text-ink">Not yet measurable</div>
              <div className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                MAE/MAPE and interval coverage require consented pilot arrival logs. The baseline is computed and stored
                with each forecast so this becomes measurable without changing the model.
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card pad={false}>
        <div className="px-5 py-4"><SectionHeader title="Recent simulations" subtitle="Policy comparisons recorded with their seeds" /></div>
        <Table head={["Scenario", "Seed", "Cost reduction", "Empty-km reduction", "Load factor gain"]}
          empty={!data.recent_simulations?.length}>
          {(data.recent_simulations || []).map((s: any) => (
            <tr key={s.id}>
              <td className="td font-medium">{s.scenario}</td>
              <td className="td font-mono text-[11px]">{s.seed}</td>
              <td className="td">{s.headline ? `−${s.headline.cost_reduction_pct}%` : "—"}</td>
              <td className="td">{s.headline ? `−${s.headline.empty_km_reduction_pct}%` : "—"}</td>
              <td className="td">{s.headline ? `+${Math.round(s.headline.load_factor_gain * 100)} pp` : "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <SyntheticNote>{data.disclaimer}</SyntheticNote>
    </div>
  );
}
