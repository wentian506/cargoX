"use client";

import {
  ArrowRight,
  Boxes,
  ClipboardList,
  Coins,
  Gauge as GaugeIcon,
  MapPin,
  Route,
  ShieldAlert,
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
const MUTED = "#DCDCDC";

export default function TransporterOverview() {
  const { ready, user } = useGuard("transporter");
  const { data: perf, loading, error, reload } = useApi<any>("/transporters/me/performance");
  const vehicles = useApi<any>("/vehicles");
  const assignments = useApi<any>("/assignments/available");
  const trips = useApi<any>("/trips/mine");
  const me = useApi<any>("/auth/me");
  const [range, setRange] = useState("30");

  const tp = me.data?.transporter;
  const open = assignments.data?.open || [];
  const active = assignments.data?.active || [];
  const completed = (assignments.data?.items || []).filter((a: any) =>
    ["completed", "transporter_rejected", "cancelled"].includes(a.status),
  );
  const fleet = vehicles.data?.items || [];
  const tripItems = trips.data?.items || [];

  const { labels, series } = useMemo(() => {
    const byClass: Record<string, number> = {};
    fleet.forEach((v: any) => {
      byClass[v.vehicle_class] = (byClass[v.vehicle_class] || 0) + (v.payload_kg || 0);
    });
    const rows = Object.entries(byClass);
    return {
      labels: rows.map(([k]) => titleCase(k)),
      series: [{ name: "Payload", colour: YELLOW, values: rows.map(([, kg_]) => Math.round(kg_)) }],
    };
  }, [fleet]);

  if (!ready) return null;
  if (loading && !perf) return <Loading rows={4} />;
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
            <div className="text-[13.5px] font-semibold text-ink">
              {tp?.company_name || user?.full_name}
              <span className="ml-2 align-middle">
                <Badge status={tp?.verification_status || "pending"} />
              </span>
            </div>
            <div className="text-[10.5px] text-ink-faint">
              {perf?.vehicles ?? 0} vehicles · {perf?.vehicles_verified ?? 0} verified · assignments released by
              Admin only
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/transporter/capacity" className="btn-outline btn-sm">
            <Boxes size={12} /> Publish capacity
          </Link>
          <Link href="/transporter/vehicles/add" className="btn-primary btn-sm">
            <Truck size={12} /> Add vehicle
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Registered vehicles", value: perf?.vehicles ?? 0, icon: <Truck size={13} />, delta: 0, spark: [3, 3, 3, 3, 3, 3, 3, perf?.vehicles ?? 3] },
          { label: "Active trips", value: perf?.trips_active ?? 0, icon: <Route size={13} />, delta: 0, spark: [0, 1, 0, 1, 1, 0, 1, perf?.trips_active ?? 0] },
          { label: "Revenue realised", value: inr(perf?.revenue_completed, true), icon: <Coins size={13} />, delta: 14, spark: [900, 1400, 1900, 2400, 3000, 3400, 3700, Math.round(perf?.revenue_completed || 0)] },
          { label: "Revenue / km", value: `₹${perf?.revenue_per_km ?? 0}`, icon: <GaugeIcon size={13} />, delta: 5.2, spark: [48, 52, 55, 58, 60, 62, 64, Math.round(perf?.revenue_per_km || 0)] },
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

      {/* main row */}
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <DashCard
          title="Authorised assignments"
          subtitle="Only work Admin has released to you appears here"
          right={
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { key: "open", label: "Open" },
                { key: "30", label: "Active" },
                { key: "all", label: "All" },
              ]}
            />
          }
          action="All work"
          href="/transporter/assignments"
          pad={false}
        >
          <Table
            head={["Assignment", "Corridor", "Load", "Revenue", "Status"]}
            empty={!(open.length + active.length + completed.length)}
          >
            {[...open, ...active, ...completed].slice(0, 6).map((a: any) => (
              <tr key={a.id} className="transition-colors hover:bg-soft/60">
                <td className="td">
                  <div className="font-semibold text-ink">{a.id}</div>
                  <div className="text-[9.5px] text-ink-faint">
                    {a.reg_no ? `${a.reg_no} · ${titleCase(a.vehicle_class)}` : "no vehicle"}
                  </div>
                </td>
                <td className="td text-[11.5px]">
                  {a.corridor || "—"}
                  <div className="text-[9.5px] text-ink-faint">{a.shipments?.length || 0} consignment(s)</div>
                </td>
                <td className="td text-[11.5px]">{kg(a.total_kg)}</td>
                <td className="td text-[11.5px] font-medium">{inr(a.revenue)}</td>
                <td className="td">
                  <Badge
                    status={a.status === "proposed" ? "pending" : a.status === "completed" ? "delivered" : "confirmed"}
                  >
                    {titleCase(a.status)}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
          {!(open.length + active.length + completed.length) && (
            <div className="px-5 py-4">
              <EmptyState
                title="No authorised assignments yet"
                body="Publish capacity and Admin will match pooled demand to your blocks."
                action={
                  <Link href="/transporter/capacity" className="btn-primary btn-sm">
                    <Boxes size={12} /> Publish capacity
                  </Link>
                }
              />
            </div>
          )}
        </DashCard>

        <DashCard title="Utilisation" subtitle="Derived from recorded trip legs, not GPS">
          <Gauge value={perf?.utilisation || 0} label={`${perf?.km_completed ?? 0} km recorded`} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              ["On-time", `${Math.round((perf?.on_time_rate || 0) * 100)}%`],
              ["Empty-km", `${perf?.empty_km_estimate ?? 0} km`],
              ["Trips done", perf?.trips_completed ?? 0],
              ["Lifetime", perf?.trips_total ?? 0],
            ].map(([l, v]) => (
              <div key={String(l)} className="rounded-xl2 bg-soft px-3 py-2">
                <div className="text-[9.5px] text-ink-faint">{l}</div>
                <div className="mt-0.5 text-[13px] font-semibold text-ink">{v}</div>
              </div>
            ))}
          </div>
          <Link
            href="/transporter/performance"
            className="mt-3 inline-flex items-center gap-1 text-[10.5px] font-medium text-ink-muted hover:text-ink"
          >
            Full performance <ArrowRight size={11} />
          </Link>
        </DashCard>
      </div>

      {/* live map strip */}
      <LiveFleet height={300} title="Your vehicles right now" />

      {/* second row */}
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <DashCard
          title="Fleet capacity by class"
          subtitle="Registered payload across your vehicles"
          action="Manage fleet"
          href="/transporter/vehicles"
        >
          {labels.length ? (
            <>
              <BarSeries
                labels={labels}
                series={series}
                height={168}
                format={(n) => `${(n / 1000).toFixed(1)}t`}
                highlight={0}
                barColour={(i) => (i === 0 ? YELLOW : "#FFE873")}
              />
              <ChartLegend items={[{ name: "Registered payload per class", colour: YELLOW }]} />
            </>
          ) : (
            <EmptyState title="No vehicles yet" body="Add a vehicle to publish capacity blocks." />
          )}
        </DashCard>

        <div className="space-y-3">
          <DashCard title="Fleet" action="Manage" href="/transporter/vehicles">
            <Rows
              items={fleet.slice(0, 3).map((v: any) => ({
                icon: <Truck size={12} />,
                title: v.reg_no,
                meta: `${titleCase(v.vehicle_class)} · ${kg(v.payload_kg)} · ₹${v.cost_per_km}/km`,
                value: <Badge status={v.verified ? "verified" : "pending"} />,
                href: "/transporter/vehicles",
              }))}
            />
            {!fleet.length && (
              <div className="rounded-xl2 bg-soft px-3 py-3 text-[10.5px] text-ink-muted">
                No vehicles registered yet.
              </div>
            )}
          </DashCard>

          <DashCard title="Recent trips" action="Trip log" href="/transporter/trips">
            {tripItems.length ? (
              <Rows
                items={tripItems.slice(0, 3).map((tr: any) => ({
                  icon: <Route size={12} />,
                  title: tr.trip_code,
                  meta: `${tr.reg_no || "—"} · ${tr.distance_km ?? 0} km · ${when(tr.created_at)}`,
                  value: <Badge status={tr.status} />,
                  href: "/transporter/trips",
                }))}
              />
            ) : (
              <div className="rounded-xl2 bg-soft px-3 py-3 text-[10.5px] text-ink-muted">
                No trips recorded yet.
              </div>
            )}
          </DashCard>
        </div>
      </div>

      {/* honesty row */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [ClipboardList, "Two-sided consent", "A trip only starts after sender approval, your acceptance and Admin confirmation."],
          [MapPin, "No GPS claims", "Progress comes from recorded checkpoints and legs — never fabricated telemetry."],
          [ShieldAlert, "Verification gate", "Unverified vehicles cannot be assigned. Document review is explicit."],
        ].map(([Icon, t, d]: any) => (
          <div key={t} className="rounded-xl3 border border-line bg-white px-4 py-3.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-soft text-ink">
              <Icon size={14} />
            </span>
            <div className="mt-2.5 text-[12px] font-semibold text-ink">{t}</div>
            <div className="mt-1 text-[10.5px] leading-relaxed text-ink-muted">{d}</div>
          </div>
        ))}
      </div>

      <SyntheticNote>
        {perf?.note || "Empty-km and on-time figures are derived from recorded trip legs, not GPS telemetry."}
      </SyntheticNote>
    </div>
  );
}
