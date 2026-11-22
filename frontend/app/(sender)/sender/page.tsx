"use client";

import {
  ArrowRight,
  Boxes,
  Compass,
  Container,
  IndianRupee,
  MapPin,
  PackagePlus,
  PiggyBank,
  Scale,
  Sparkles,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BarSeries,
  ChartLegend,
  DashCard,
  Gauge,
  Rows,
  Segmented,
  Sparkline,
} from "@/components/dashboard";
import LiveFleet from "@/components/LiveFleet";
import { Badge, EmptyState, ErrorNote, Loading, Progress, SyntheticNote, Table } from "@/components/ui";
import { inr, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard, useSession } from "@/lib/session";

const YELLOW = "#FFD60A";
const BLACK = "#171717";
const MUTED = "#DCDCDC";

export default function SenderOverview() {
  const { ready, user } = useGuard("sender");
  const { data, loading, error, reload } = useApi<any>("/analytics/sender");
  const ships = useApi<any>("/shipments?page_size=8");
  const notifs = useApi<any>("/notifications");
  const cap = useApi<any>("/capacity?status=published");
  const [range, setRange] = useState("30");

  const t = data?.totals || {};
  const items = ships.data?.items || [];
  const pendingAlloc = items.filter((s: any) => s.status === "awaiting_sender_approval");

  const { labels, series } = useMemo(() => {
    const rows = data?.by_commodity || [];
    const sorted = [...rows].sort((a: any, b: any) => b.kg - a.kg);
    return {
      labels: sorted.map((r: any) => titleCase(r.commodity)),
      series: [{ name: "Your volume", colour: YELLOW, values: sorted.map((r: any) => Math.round(r.kg)) }],
    };
  }, [data]);

  if (!ready) return <Loading rows={3} />;
  if (loading && !data) return <Loading rows={4} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const first = user?.full_name?.split(" ")[0] || "there";

  return (
    <div className="space-y-3">
      {/* welcome strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl3 border border-line bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-[12px] font-bold text-ink">
            {first.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <div className="text-[13.5px] font-semibold text-ink">Welcome back, {first}!</div>
            <div className="text-[10.5px] text-ink-faint">
              {user?.district || "Ludhiana"} · {String(user?.preferred_language || "pa").toUpperCase()} · your
              freight, savings and delivery history
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sender/tracking" className="btn-outline btn-sm">
            <MapPin size={12} /> Track
          </Link>
          <Link href="/sender/create" className="btn-primary btn-sm">
            <PackagePlus size={12} /> Create shipment
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Your consignments", value: t.shipments ?? 0, icon: <Container size={13} />, delta: 9, spark: [1, 2, 2, 3, 3, 4, 4, t.shipments ?? 0] },
          { label: "In plan", value: t.active ?? 0, icon: <Truck size={13} />, delta: 4, spark: [1, 1, 2, 2, 3, 3, 4, t.active ?? 0] },
          { label: "Freight committed", value: inr(t.freight_committed, true), icon: <IndianRupee size={13} />, delta: -2.4, spark: [11, 14, 17, 19, 21, 24, 26, 25] },
          { label: "Estimated savings", value: inr(t.estimated_savings, true), icon: <PiggyBank size={13} />, delta: 18, spark: [0, 60, 140, 220, 300, 380, 450, Math.round(t.estimated_savings || 0)] },
        ].map((k) => (
          <div key={k.label} className="rounded-xl3 border border-line bg-white px-4 py-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-ink-muted">{k.label}</span>
              <span className="grid h-6 w-6 place-items-center rounded-full border border-line text-ink-faint">{k.icon}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className="text-[24px] font-semibold leading-none tracking-[-0.02em] text-ink">{k.value}</span>
              <Sparkline values={k.spark} width={72} height={26} colour={k.delta >= 0 ? YELLOW : "#C9C9C9"} />
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px]">
              <span className={k.delta >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-500"}>
                {k.delta > 0 ? "+" : ""}
                {k.delta}%
              </span>
              <span className="text-ink-faint">vs last month</span>
            </div>
          </div>
        ))}
      </div>

      {pendingAlloc.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl3 border border-accent bg-accent-50 px-4 py-3">
          <Scale size={15} className="text-ink" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-ink">
              {pendingAlloc.length} fair-share proposal{pendingAlloc.length > 1 ? "s" : ""} awaiting your approval
            </div>
            <div className="text-[10.5px] text-ink-muted">
              Accepting is optional — declining keeps you on solo travel at solo cost.
            </div>
          </div>
          <Link href="/sender/costs" className="btn-dark btn-sm">
            Review <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* main row */}
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <DashCard
          title="Freight volume"
          subtitle="Kilograms by commodity in your book"
          right={
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { key: "30", label: "30d" },
                { key: "90", label: "90d" },
                { key: "all", label: "All" },
              ]}
            />
          }
          action="Analytics"
          href="/sender/analytics"
        >
          {labels.length ? (
            <>
              <BarSeries
                labels={labels}
                series={series}
                height={252}
                format={(n) => `${(n / 1000).toFixed(1)}t`}
                highlight={0}
                barColour={(i) => (i === 0 ? YELLOW : "#FFE873")}
              />
              <ChartLegend
                items={[
                  { name: "Largest commodity", colour: YELLOW },
                  { name: "Your other commodities", colour: "#FFE873" },
                ]}
              />
            </>
          ) : (
            <EmptyState
              title="No consignments yet"
              body="Create your first shipment — Admin reviews it and coordinates the rest."
              action={
                <Link href="/sender/create" className="btn-primary btn-sm">
                  <PackagePlus size={12} /> Create shipment
                </Link>
              }
            />
          )}
        </DashCard>

        <DashCard title="Fair-share performance" subtitle="Solo cost vs pooled share">
          <Gauge
            value={(() => {
              const rows = data?.cost_allocation || [];
              const solo = rows.reduce((a: number, r: any) => a + (r.solo || 0), 0);
              return solo ? rows.reduce((a: number, r: any) => a + (r.saving || 0), 0) / solo : 0;
            })()}
            label="of your pooled solo cost saved"
          />
          <div className="mt-4 space-y-2.5">
            {(data?.cost_allocation || []).slice(0, 3).map((a: any) => (
              <div key={a.shipment} className="rounded-xl2 bg-soft px-3 py-2">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="font-semibold text-ink">{a.shipment}</span>
                  <Badge status={a.approval} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-muted">
                  <span>share {inr(a.share)}</span>
                  <span className="line-through">{inr(a.solo)}</span>
                  <span className="font-semibold text-emerald-600">−{inr(a.saving)}</span>
                </div>
                <div className="mt-1.5">
                  <Progress value={a.solo ? 1 - a.share / a.solo : 0} height="h-1.5" />
                </div>
              </div>
            ))}
            {!(data?.cost_allocation || []).length && (
              <div className="rounded-xl2 bg-soft px-3 py-3 text-[10.5px] text-ink-muted">
                No pooled allocation yet — solo cost applies until you join a coalition.
              </div>
            )}
          </div>
          <Link
            href="/sender/costs"
            className="mt-3 inline-flex items-center gap-1 text-[10.5px] font-medium text-ink-muted hover:text-ink"
          >
            Full freight breakdown <ArrowRight size={11} />
          </Link>
        </DashCard>
      </div>

      {/* live map strip — scoped to this sender's freight */}
      <LiveFleet height={300} title="Your freight in motion" />

      {/* second row */}
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <DashCard
          title="My shipments"
          subtitle="Every consignment and where it stands"
          action="Open register"
          href="/sender/shipments"
          pad={false}
        >
          <Table head={["Shipment", "Commodity", "Qty", "Route", "Freight", "Status"]}>
            {items.slice(0, 6).map((s: any) => (
              <tr key={s.id} className="transition-colors hover:bg-soft/60">
                <td className="td font-semibold text-ink">{s.code}</td>
                <td className="td capitalize text-[11.5px]">{s.commodity}</td>
                <td className="td text-[11.5px]">{kg(s.quantity_kg)}</td>
                <td className="td text-[11.5px] text-ink-muted">
                  {s.pickup_village} → {s.destination_name}
                </td>
                <td className="td text-[11.5px] font-medium">{s.freight_estimate ? inr(s.freight_estimate) : "—"}</td>
                <td className="td">
                  <Badge status={s.status} dot />
                </td>
              </tr>
            ))}
          </Table>
        </DashCard>

        <div className="space-y-3">
          <DashCard title="Destination edge" action="Compare" href="/sender/destinations">
            <Rows
              items={[
                { icon: <Compass size={12} />, title: "Mandi Gobindgarh", meta: "queue ~55 min · net realisation", value: "best", tone: "good", href: "/sender/destinations" },
                { icon: <Compass size={12} />, title: "Khanna Mandi", meta: "queue ~40 min · closer", value: "+₹12/q", href: "/sender/destinations" },
                { icon: <Scale size={12} />, title: "ValueClock", meta: "price minus freight minus queue cost", value: "open", href: "/sender/destinations" },
              ]}
            />
          </DashCard> 

          <DashCard title="Capacity available" action="Find transport" href="/sender/capacity">
            <div className="flex items-center justify-between rounded-xl2 bg-accent-50 px-3 py-2.5">
              <div>
                <div className="text-[16px] font-semibold text-ink">
                  {(cap.data?.items || []).length || 0}
                </div>
                <div className="text-[9.5px] text-ink-muted">published blocks</div>
              </div>
              <Boxes size={18} className="text-ink/70" />
            </div>
            <Rows
              items={(cap.data?.items || []).slice(0, 2).map((b: any) => ({
                icon: <Truck size={12} />,
                title: `${titleCase(b.vehicle_class || "vehicle")} · ${kg(b.payload_kg || b.available_kg || 0)}`,
                meta: b.corridor || "corridor not stated",
                value: b.reserve_price_per_km ? `₹${b.reserve_price_per_km}/km` : undefined,
              }))}
            />
            {!(cap.data?.items || []).length && (
              <div className="mt-2 text-[10.5px] text-ink-muted">No published capacity right now.</div>
            )}
          </DashCard>
        </div>
      </div>

      {/* notifications row */}
      <DashCard title="Updates" subtitle="Operational events on your shipments" action="All notifications" href="/sender/notifications">
        {(notifs.data?.items || []).length ? (
          <Rows
            items={(notifs.data?.items || []).slice(0, 4).map((n: any) => ({
              icon: <Sparkles size={12} />,
              title: n.title,
              meta: `${when(n.created_at)}${n.body ? " · " + n.body : ""}`,
            }))}
          />
        ) : (
          <div className="rounded-xl2 bg-soft px-3 py-3 text-[10.5px] text-ink-muted">
            Nothing yet — updates appear as Admin reviews and pools your shipments.
          </div>
        )}
      </DashCard>

      <SyntheticNote />
    </div>
  );
}
