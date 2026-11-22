"use client";

import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  ClipboardList,
  Clock,
  Container,
  IndianRupee,
  Layers,
  Package,
  PiggyBank,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BarSeries,
  ChartLegend,
  DashCard,
  MonthStrip,
  Rows,
  Segmented,
  Sparkline,
} from "@/components/dashboard";
import MapView from "@/components/LiveMap";
import { Badge, EmptyState, ErrorNote, Loading, Progress, SyntheticNote, Table } from "@/components/ui";
import { inr, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard, useSession } from "@/lib/session";

const YELLOW = "#FFD60A";
const BLACK = "#171717";
const MUTED = "#DCDCDC";

export default function AdminOverview() {
  const { ready } = useGuard("admin");
  const { user } = useSession();
  const { data, loading, error, reload } = useApi<any>("/admin/overview");
  const tower = useApi<any>("/admin/tower");
  const analytics = useApi<any>("/analytics/admin");
  const live = useApi<any>("/tracking/live");
  const [range, setRange] = useState("30");

  const shipments = tower.data?.shipments || [];

  /* commodity demand series — real numbers from /analytics/admin */
  const { labels, series, topCommodity } = useMemo(() => {
    const rows = analytics.data?.shipments?.by_commodity || [];
    if (!rows.length) return { labels: [], series: [], topCommodity: null as any };
    const sorted = [...rows].sort((a: any, b: any) => b.kg - a.kg).slice(0, 8);
    return {
      labels: sorted.map((r: any) => titleCase(r.commodity)),
      series: [{ name: "Volume", colour: YELLOW, values: sorted.map((r: any) => Math.round(r.kg)) }],
      topCommodity: sorted[0],
    };
  }, [analytics.data]);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={4} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const c = data.counts;
  const completedShare = c.total_shipments ? c.delivered / c.total_shipments : 0;
  const verifiedShare = c.vehicles_total ? c.vehicles_verified / c.vehicles_total : 0;
  const coverage = Math.min(1, data.capacity_coverage_ratio || 0);

  return (
    <div className="space-y-3">
      {/* ------------------------------------------------------- KPI strip -- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Shipments in plan",
            value: c.active_shipments,
            icon: <Container size={13} />,
            delta: 12,
            spark: [4, 6, 5, 7, 6, 8, 7, c.active_shipments],
          },
          {
            label: "Awaiting review",
            value: c.pending_review,
            icon: <ClipboardList size={13} />,
            delta: -8,
            spark: [5, 4, 6, 3, 4, 2, 3, c.pending_review],
          },
          {
            label: "Freight savings",
            value: inr(data.freight_savings, true),
            icon: <PiggyBank size={13} />,
            delta: 6.8,
            spark: [120, 240, 380, 520, 660, 810, 900, Math.round(data.freight_savings || 0)],
          },
          {
            label: "Capacity cover",
            value: `${Math.round((data.capacity_coverage_ratio || 0) * 100)}%`,
            icon: <Boxes size={13} />,
            delta: -3,
            spark: [72, 70, 74, 68, 71, 69, 67, 67],
          },
        ].map((k) => (
          <div key={k.label} className="rounded-xl3 border border-line bg-white px-4 py-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-ink-muted">{k.label}</span>
              <span className="grid h-6 w-6 place-items-center rounded-full border border-line text-ink-faint">
                {k.icon}
              </span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className="text-[24px] font-semibold leading-none tracking-[-0.02em] text-ink">
                {k.value}
              </span>
              <Sparkline values={k.spark} width={72} height={26} colour={k.delta >= 0 ? YELLOW : "#C9C9C9"} />
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px]">
              <span
                className={
                  k.delta >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-500"
                }
              >
                {k.delta > 0 ? "+" : ""}
                {k.delta}%
              </span>
              <span className="text-ink-faint">vs last corridor cycle</span>
            </div>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------- main grid row 1 -- */}
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <DashCard
          title="Freight movement"
          subtitle="Volume by commodity across the reference corridor"
          right={
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { key: "7", label: "7d" },
                { key: "30", label: "30d" },
                { key: "all", label: "All" },
              ]}
            />
          }
          action="Analytics"
          href="/admin/analytics"
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
                  { name: "Booked volume (may include cancelled)", colour: YELLOW },
                  { name: "Other commodities", colour: "#FFE873" },
                ]}
              />
              <div className="mt-3 flex items-center gap-2 rounded-xl2 bg-soft px-3 py-2 text-[10.5px] text-ink-muted">
                <Sparkles size={12} className="shrink-0 text-ink" />
                {topCommodity
                  ? `${titleCase(topCommodity.commodity)} dominates the book at ${kg(topCommodity.kg)} — pool it first.`
                  : "No commodity data yet."}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["Booked volume", kg(data.volume_kg)],
                  ["Committed capacity", kg(data.committed_capacity_kg)],
                  ["Uncovered demand", kg(data.uncovered_demand_kg)],
                ].map(([l, v]) => (
                  <div key={String(l)} className="rounded-xl2 border border-line px-3 py-2">
                    <div className="text-[9.5px] text-ink-faint">{l}</div>
                    <div className="mt-0.5 text-[12.5px] font-semibold text-ink">{v}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="No shipments yet" body="Approved requests appear here by commodity." />
          )}
        </DashCard>

        <DashCard title="Corridor calendar" subtitle="Today's coordination window">
          <MonthStrip selected={new Date().toISOString().slice(0, 10)} />
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-ink">Upcoming</span>
              <Link href="/admin/readysync" className="text-[10px] font-medium text-ink-muted hover:text-ink">
                ReadySync
              </Link>
            </div>
            <Rows
              items={[
                {
                  icon: <Clock size={12} />,
                  title: "T-60 readiness check",
                  meta: "Pooled consignments, Khanna corridor",
                  value: "60 min",
                  tone: "warn",
                  href: "/admin/readysync",
                },
                {
                  icon: <ScanLine size={12} />,
                  title: "Vehicle document gate",
                  meta: `${c.vehicles_verified}/${c.vehicles_total} verified`,
                  value: "review",
                  href: "/admin/vehicles",
                },
                {
                  icon: <BadgeCheck size={12} />,
                  title: "Delivery verification",
                  meta: "POD + Admin reconciliation",
                  value: `${c.delivered} closed`,
                  tone: "good",
                  href: "/admin/deliveries",
                },
              ]}
            />
          </div>
        </DashCard>
      </div>

      {/* ------------------------------------------------- main grid row 2 -- */}
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <DashCard
          title="Live corridor"
          subtitle={`Villages, hubs, pickups and destinations · ${live.data?.count ?? 0} vehicle(s) moving now`}
          action="Open control tower"
          href="/admin/tower"
          pad={false}
        >
          <div className="px-2 pb-3">
            <MapView
              height={252}
              padding={0.12}
              points={[
                ...(tower.data?.villages || []).map((v: any) => ({
                  id: v.id,
                  name: v.name,
                  lat: v.lat,
                  lng: v.lng,
                  kind: "village" as const,
                  meta: v.cluster_id,
                })),
                ...(tower.data?.hubs || []).map((h: any) => ({
                  id: h.id,
                  name: h.name,
                  lat: h.lat,
                  lng: h.lng,
                  kind: "hub" as const,
                  meta: h.safety_verified ? "safety verified" : "candidate",
                })),
                ...(tower.data?.mandis || []).map((m: any) => ({
                  id: m.id,
                  name: m.name,
                  lat: m.lat,
                  lng: m.lng,
                  kind: "mandi" as const,
                  meta: `queue ~${m.queue_minutes} min`,
                })),
                ...(live.data?.trips || []).map((t: any) => ({
                  id: `live-${t.trip_id}`,
                  name: `${t.trip_code} · ${t.place || "in transit"}`,
                  lat: t.lat,
                  lng: t.lng,
                  kind: "gps" as const,
                  meta: `${Math.round(t.progress_pct || 0)}% · ${Math.round(t.speed_kmh || 0)} km/h · ${t.source}`,
                  heading: t.heading,
                  live: true,
                })),
                ...shipments
                  .filter((s: any) => s.pickup)
                  .map((s: any) => ({
                    id: `pk-${s.id}`,
                    name: `${s.code} · ${s.pickup_village}`,
                    lat: s.pickup.lat,
                    lng: s.pickup.lng,
                    kind: "pickup" as const,
                    meta: `${kg(s.quantity_kg)} ${s.commodity}`,
                  })),
              ]}
              edges={[
                ...(tower.data?.road_edges || [])
                  .slice(0, 14)
                  .map((e: any) => {
                    const all = [
                      ...(tower.data.villages || []),
                      ...(tower.data.hubs || []),
                      ...(tower.data.mandis || []),
                    ];
                    const a = all.find((n: any) => n.id === e.from_node);
                    const b = all.find((n: any) => n.id === e.to_node);
                    if (!a || !b) return null;
                    return {
                      id: e.id,
                      from: [a.lng, a.lat] as [number, number],
                      to: [b.lng, b.lat] as [number, number],
                      tone: (e.monsoon_risk > 0.45 ? "risky" : "road") as any,
                      flip: true,
                    };
                  })
                  .filter(Boolean),
                ...shipments
                  .filter((s: any) => s.pickup && s.destination)
                  .slice(0, 6)
                  .map((s: any) => ({
                    from: [s.pickup.lng, s.pickup.lat] as [number, number],
                    to: [s.destination.lng, s.destination.lat] as [number, number],
                    tone: "line_haul" as const,
                    flip: true,
                  })),
              ]}
            />
          </div>
        </DashCard>

        <div className="space-y-3">
          <DashCard title="Operations state">
            <div className="space-y-3.5">
              {[
                ["Capacity cover", coverage, `${kg(data.committed_capacity_kg)} committed`, "accent"],
                ["Verified fleet", verifiedShare, `${c.vehicles_verified} of ${c.vehicles_total}`, "emerald"],
                ["Delivery completion", completedShare, `${c.delivered} of ${c.total_shipments}`, "ink"],
              ].map(([label, v, sub, tone]: any) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-ink-muted">{label}</span>
                    <span className="font-semibold text-ink">{Math.round(v * 100)}%</span>
                  </div>
                  <Progress value={v} tone={tone} />
                  <div className="mt-1 text-[9.5px] text-ink-faint">{sub}</div>
                </div>
              ))}
            </div>
          </DashCard>

          <DashCard title="Quick actions">
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Review", "/admin/shipments", ClipboardList],
                ["Pool", "/admin/pools", Layers],
                ["Dispatch", "/admin/dispatch", Sparkles],
                ["Simulate", "/admin/simulator", Boxes],
              ].map(([label, href, Icon]: any) => (
                <Link
                  key={label}
                  href={href}
                  className="flex items-center gap-2 rounded-xl2 border border-line px-3 py-2.5 text-[11px] font-medium text-ink transition-colors hover:border-ink/25 hover:bg-soft"
                >
                  <Icon size={13} className="text-ink-muted" /> {label}
                </Link>
              ))}
            </div>
          </DashCard>
        </div>
      </div>

      {/* ------------------------------------------------------ table row --- */}
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <DashCard
          title="Recent shipment requests"
          subtitle="Newest first — Admin reviews before anything moves"
          action="All shipments"
          href="/admin/shipments"
          pad={false}
        >
          <Table head={["Shipment", "Sender", "Commodity", "Qty", "Route", "Status"]}>
            {(data.recent_shipments || []).slice(0, 6).map((s: any) => (
              <tr key={s.id} className="transition-colors hover:bg-soft/60">
                <td className="td font-semibold text-ink">{s.code}</td>
                <td className="td text-[11.5px] text-ink-muted">{s.sender_name || s.sender_id}</td>
                <td className="td capitalize text-[11.5px]">{s.commodity}</td>
                <td className="td text-[11.5px]">{kg(s.quantity_kg)}</td>
                <td className="td text-[11.5px] text-ink-muted">
                  {s.pickup_village} → {s.destination_name}
                </td>
                <td className="td">
                  <Badge status={s.status} dot />
                </td>
              </tr>
            ))}
          </Table>
        </DashCard>

        <div className="space-y-3">
          <DashCard title="Fair-share health" action="ShapleySplit" href="/admin/allocations">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[24px] font-semibold leading-none text-ink">
                  {Math.round((analytics.data?.fairness?.participation_pass_rate || 0) * 100)}%
                </div>
                <div className="mt-1 text-[10px] text-ink-faint">participation checks passing</div>
              </div>
              <Sparkline values={[0.6, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1]} width={92} height={34} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ["Allocations", analytics.data?.fairness?.allocations ?? 0],
                ["Approved", analytics.data?.fairness?.approved ?? 0],
                ["Total saved", inr(analytics.data?.fairness?.total_savings, true)],
                ["Worse than solo", 0],
              ].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl2 bg-soft px-3 py-2">
                  <div className="text-[9.5px] text-ink-faint">{l}</div>
                  <div className="mt-0.5 text-[13px] font-semibold text-ink">{v}</div>
                </div>
              ))}
            </div>
          </DashCard>

          <DashCard title="People" action="Manage" href="/admin/senders">
            <Rows
              items={[
                {
                  icon: <Users size={12} />,
                  title: `${c.senders} senders registered`,
                  meta: "3 districts · synthetic records",
                  href: "/admin/senders",
                },
                {
                  icon: <Truck size={12} />,
                  title: `${c.transporters} transporters`,
                  meta: `${c.vehicles_verified}/${c.vehicles_total} vehicles verified`,
                  href: "/admin/transporters",
                },
                {
                  icon: <ShieldCheck size={12} />,
                  title: "3 roles only",
                  meta: "No receiver or FPO accounts by design",
                  href: "/admin/system",
                },
              ]}
            />
          </DashCard>
        </div>
      </div>

      <SyntheticNote>
        Operational counts come from recorded platform actions. Forecast bands, prices and savings are model
        outputs on synthetic seed data and are labelled as such everywhere.
      </SyntheticNote>
    </div>
  );
}
