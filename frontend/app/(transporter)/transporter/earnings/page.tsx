"use client";

import { Download, Wallet } from "lucide-react";
import { BarsChart } from "@/components/charts";
import { Card, ErrorNote, Loading, SectionHeader, Stat, SyntheticNote, Table, useToast } from "@/components/ui";
import { api, inr, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function Earnings() {
  const { ready } = useGuard("transporter");
  const { push } = useToast();
  const perf = useApi<any>("/transporters/me/performance");
  const trips = useApi<any>("/trips/mine");

  if (!ready) return null;
  if (perf.loading && !perf.data) return <Loading rows={3} />;
  if (perf.error) return <ErrorNote message={perf.error} onRetry={perf.reload} />;

  const p = perf.data || {};
  const items = trips.data?.items || [];
  const chart = items.slice(0, 8).reverse().map((t: any) => ({
    trip: t.trip_code?.slice(-6) || "—",
    revenue: Math.round(t.revenue || 0),
    km: Math.round(t.distance_km || 0),
  }));

  const exportCsv = async () => {
    const text = await api.raw("/analytics/export?kind=trips");
    const blob = new Blob([text], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cargox-trips.csv";
    a.click();
    push("success", "CSV exported");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Revenue</div>
          <h2 className="mt-1 text-[20px] font-semibold text-ink">Earnings &amp; trip economics</h2>
        </div>
        <button className="btn-outline btn-sm" onClick={exportCsv}><Download size={13} /> Export CSV</button>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Completed revenue" value={inr(p.revenue_completed, true)} sub={`${p.trips_completed} trips`} tone="good" icon={<Wallet size={15} />} />
        <Stat label="In-flight revenue" value={inr(p.revenue_active, true)} sub={`${p.trips_active} active`} tone="warn" />
        <Stat label="Revenue per km" value={`₹${p.revenue_per_km ?? 0}`} sub={`${p.km_completed} km`} />
        <Stat label="Empty-km estimate" value={`${p.empty_km_estimate} km`} sub="18% derived from legs" />
      </div>

      <Card>
        <SectionHeader title="Revenue by trip" subtitle="Most recent trips" />
        {chart.length ? (
          <BarsChart data={chart} xKey="trip"
            series={[{ key: "revenue", label: "Revenue (₹)", colour: "#16A36A" }, { key: "km", label: "Distance (km)", colour: "#B8E986" }]} />
        ) : <div className="py-10 text-center text-[12px] text-ink-muted">No trips yet.</div>}
      </Card>

      <Card pad={false}>
        <div className="px-5 py-4"><SectionHeader title="Trip register" /></div>
        <Table head={["Trip", "Vehicle", "Shipments", "Distance", "Revenue", "Status", "Started"]}
          empty={!items.length}>
          {items.map((t: any) => (
            <tr key={t.id} className="transition-colors hover:bg-soft/60">
              <td className="td font-semibold text-ink">{t.trip_code}</td>
              <td className="td">{t.reg_no} <span className="text-[10.5px] text-ink-muted">({titleCase(t.vehicle_class)})</span></td>
              <td className="td">{t.shipments?.length || 0}</td>
              <td className="td">{Math.round(t.distance_km || 0)} km</td>
              <td className="td font-semibold">{inr(t.revenue)}</td>
              <td className="td">{titleCase(t.status)}</td>
              <td className="td text-[11.5px] text-ink-muted">{when(t.started_at)}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <SyntheticNote>
        Earnings are recorded assignment revenue. No settlement or payout is processed in this build — payment flows
        require a regulated partner.
      </SyntheticNote>
    </div>
  );
}
