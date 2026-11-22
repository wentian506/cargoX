"use client";

import { Download, TrendingDown } from "lucide-react";
import { BarsChart, Donut, LineTrend } from "@/components/charts";
import { Card, ErrorNote, Loading, SectionHeader, Stat, SyntheticNote, useToast } from "@/components/ui";
import { api, inr, kg, titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function SenderAnalytics() {
  const { ready } = useGuard("sender");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/analytics/sender");

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const t = data?.totals || {};
  const exportCsv = async () => {
    const text = await api.raw("/analytics/export?kind=shipments");
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cargox-shipments.csv";
    a.click();
    URL.revokeObjectURL(url);
    push("success", "CSV exported");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Your performance</div>
          <h2 className="mt-1 text-[20px] font-semibold text-ink">Freight, savings and delivery history</h2>
        </div>
        <button className="btn-outline btn-sm" onClick={exportCsv}><Download size={13} /> Export CSV</button>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Shipments" value={t.shipments ?? 0} sub={`${t.delivered ?? 0} delivered`} />
        <Stat label="Volume" value={kg(t.volume_kg)} sub="all consignments" />
        <Stat label="Freight committed" value={inr(t.freight_committed, true)} sub="incl. estimates" />
        <Stat label="Savings" value={inr(t.estimated_savings, true)} tone="good"
          sub="vs travelling alone" icon={<TrendingDown size={15} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <SectionHeader title="Monthly freight & volume" subtitle="Recorded platform activity" />
          {data?.monthly?.length ? (
            <LineTrend
              data={data.monthly.map((m: any) => ({ month: m.month, freight: Math.round(m.freight), kg: Math.round(m.kg) }))}
              xKey="month"
              series={[{ key: "freight", label: "Freight (₹)", colour: "#123D32" }, { key: "kg", label: "Volume (kg)", colour: "#16A36A" }]}
            />
          ) : <div className="py-10 text-center text-[12px] text-ink-muted">No monthly history yet.</div>}
        </Card>

        <Card>
          <SectionHeader title="Status mix" />
          {data?.by_status?.length ? (
            <Donut data={data.by_status.map((s: any) => ({ name: titleCase(s.status), value: s.count }))} />
          ) : <div className="py-10 text-center text-[12px] text-ink-muted">No data.</div>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Volume by commodity" />
          {data?.by_commodity?.length ? (
            <BarsChart
              data={data.by_commodity.map((c: any) => ({ crop: titleCase(c.commodity), kg: Math.round(c.kg) }))}
              xKey="crop"
              series={[{ key: "kg", label: "Volume (kg)", colour: "#16A36A" }]}
            />
          ) : <div className="py-10 text-center text-[12px] text-ink-muted">No data.</div>}
        </Card>

        <Card>
          <SectionHeader title="Cost allocation history" subtitle="Your share vs solo cost per consignment" />
          {data?.cost_allocation?.length ? (
            <div className="space-y-2">
              {data.cost_allocation.map((c: any) => (
                <div key={c.shipment} className="flex items-center justify-between rounded-lg bg-soft px-3 py-2 text-[12px]">
                  <span className="font-medium text-ink">{c.shipment}</span>
                  <span className="text-ink-muted line-through">{inr(c.solo)}</span>
                  <span className="font-semibold text-ink">{inr(c.share)}</span>
                  <span className="text-emerald-600">−{inr(c.saving)}</span>
                  <span className="text-[10.5px] capitalize text-ink-muted">{c.approval}</span>
                </div>
              ))}
            </div>
          ) : <div className="py-10 text-center text-[12px] text-ink-muted">No allocations yet.</div>}
        </Card>
      </div>

      <SyntheticNote>
        Figures come from recorded platform actions. Savings compare your allocated share against the modelled
        standalone cost of an exclusive vehicle.
      </SyntheticNote>
    </div>
  );
}
