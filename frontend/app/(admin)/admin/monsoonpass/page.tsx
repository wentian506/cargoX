"use client";

import { AlertTriangle, Info, Waves } from "lucide-react";
import { useState } from "react";
import MapView from "@/components/LiveMap";
import {
  Badge, Card, ErrorNote, Loading, SectionHeader, SyntheticNote, Table, Tabs,
} from "@/components/ui";
import { titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function MonsoonPass() {
  const { ready } = useGuard("admin");
  const [cls, setCls] = useState("truck");
  const status = useApi<any>("/monsoonpass/status");
  const corridor = useApi<any>("/corridor");

  if (!ready) return null;
  if (status.loading && !status.data) return <Loading rows={3} />;
  if (status.error) return <ErrorNote message={status.error} onRetry={status.reload} />;

  const byClass = status.data?.by_vehicle_class?.[cls];
  const warnings = status.data?.active_warnings || [];
  const nodes = [
    ...(corridor.data?.villages || []).map((v: any) => ({ ...v, kind: "village" })),
    ...(corridor.data?.hubs || []).map((h: any) => ({ ...h, kind: "hub" })),
    ...(corridor.data?.mandis || []).map((m: any) => ({ ...m, kind: "mandi" })),
  ];
  const find = (id: string) => nodes.find((n: any) => n.id === id);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label">MonsoonPass</div>
            <h2 className="mt-0.5 text-[16px] font-semibold text-ink">Seasonal road access by vehicle class</h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-ink-muted">
              Surface, width and stored seasonal risk determine which vehicle classes may use each link. Where risk is
              high, the planner applies conservative defaults and requires physical verification before dispatch.
            </p>
          </div>
          <Tabs tabs={["pickup", "tractor_trolley", "tempo", "lcv", "truck"].map((c) => ({ key: c, label: titleCase(c) }))}
            active={cls} onChange={setCls} size="sm" />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card pad={false}>
          <div className="px-5 py-4"><SectionHeader title="High-risk links" subtitle="Monsoon mode active" /></div>
          <div className="px-2 pb-2">
            <MapView
              height={330}
              padding={0.15}
              points={nodes.map((n: any) => ({
                id: n.id, name: n.name, lat: n.lat, lng: n.lng,
                kind: n.kind as any,
                meta: n.safety_verified ? "verified" : undefined,
              }))}
              edges={warnings.map((w: any) => {
                const a = find(w.from), b = find(w.to);
                if (!a || !b) return null;
                return { id: w.edge, from: [a.lng, a.lat] as [number, number], to: [b.lng, b.lat] as [number, number], tone: "risky" as const, flip: true };
              }).filter(Boolean)}
            />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader title={`Road access · ${titleCase(cls)}`} />
            <div className="mb-3 flex gap-2">
              <Badge status={byClass?.passable ? "verified" : "rejected"}>
                {byClass?.passable ? "all links passable" : `${byClass?.blocked?.length || 0} blocked`}
              </Badge>
              <Badge status="pending">{byClass?.warnings?.length || 0} warnings</Badge>
            </div>
            <div className="space-y-1.5">
              {(byClass?.blocked || []).slice(0, 6).map((b: any, i: number) => (
                <div key={i} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
                  <div className="font-semibold">{find(b.from)?.name || b.from} → {find(b.to)?.name || b.to}</div>
                  <div>{b.reason}</div>
                </div>
              ))}
              {!(byClass?.blocked || []).length && (
                <div className="text-[12px] text-ink-muted">No blocked links for this vehicle class.</div>
              )}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Weather source" />
            <div className="flex items-start gap-2">
              <Info size={13} className="mt-0.5 shrink-0 text-ink" />
              <p className="text-[11.5px] leading-relaxed text-ink-muted">{status.data?.weather_source}</p>
            </div>
          </Card>
        </div>
      </div>

      <Card pad={false}>
        <div className="px-5 py-4">
          <SectionHeader title="Active warnings" subtitle="Verify physically before dispatch" />
        </div>
        <Table head={["Edge", "From", "To", "Surface", "Width", "Risk", "Action"]} empty={!warnings.length}>
          {warnings.map((w: any) => (
            <tr key={w.edge}>
              <td className="td font-mono text-[11px]">{w.edge}</td>
              <td className="td">{find(w.from)?.name || w.from}</td>
              <td className="td">{find(w.to)?.name || w.to}</td>
              <td className="td capitalize">{w.surface}</td>
              <td className="td">{w.width_m} m</td>
              <td className="td">
                <Badge status={w.risk > 0.6 ? "rejected" : "pending"}>{Math.round(w.risk * 100)}%</Badge>
              </td>
              <td className="td text-[11px] text-ink-muted">{w.action}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <SyntheticNote>No live IMD feed is connected in this deployment — risk is a stored road attribute.</SyntheticNote>
    </div>
  );
}
