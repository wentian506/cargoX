"use client";

import { Crosshair, Info, Layers, MapPin } from "lucide-react";
import { useState } from "react";
import LiveFleet from "@/components/LiveFleet";
import MapView from "@/components/LiveMap";
import {
  Badge, Card, ErrorNote, Loading, SectionHeader, Tabs, SyntheticNote,
} from "@/components/ui";
import { kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function ControlTower() {
  const { ready } = useGuard("admin");
  const { data, loading, error, reload } = useApi<any>("/admin/tower");
  const [layer, setLayer] = useState("all");
  const [selected, setSelected] = useState<any>(null);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const nodes = [
    ...(data.villages || []).map((v: any) => ({ ...v, kind: "village" })),
    ...(data.hubs || []).map((v: any) => ({ ...v, kind: "hub" })),
    ...(data.mandis || []).map((v: any) => ({ ...v, kind: "mandi" })),
  ];
  const findNode = (id: string) => nodes.find((n: any) => n.id === id);

  const showVillages = layer === "all" || layer === "villages";
  const showHubs = layer === "all" || layer === "hubs";
  const showMandis = layer === "all" || layer === "destinations";
  const showShipments = layer === "all" || layer === "shipments";
  const showRoads = layer === "all" || layer === "roads";

  const points: any[] = [
    ...(showVillages ? (data.villages || []).map((v: any) => ({
      id: v.id, name: v.name, lat: v.lat, lng: v.lng, kind: "village" as const, meta: v.cluster_id,
    })) : []),
    ...(showHubs ? (data.hubs || []).map((h: any) => ({
      id: h.id, name: h.name, lat: h.lat, lng: h.lng, kind: "hub" as const,
      meta: h.safety_verified ? `verified · ${h.operating_window}` : "candidate hub",
    })) : []),
    ...(showMandis ? (data.mandis || []).map((m: any) => ({
      id: m.id, name: m.name, lat: m.lat, lng: m.lng, kind: "mandi" as const, meta: `queue ~${m.queue_minutes} min`,
    })) : []),
    ...(showShipments ? (data.shipments || []).map((s: any) => ({
      id: `shp-${s.id}`, name: `${s.code}`, lat: s.pickup?.lat, lng: s.pickup?.lng, kind: "pickup" as const,
      meta: `${kg(s.quantity_kg)} ${s.commodity} → ${s.destination_name}`,
    })) : []),
    ...(data.disruptions || []).slice(0, 3).map((d: any, i: number) => ({
      id: `dis-${d.id}`, name: "Disruption", lat: 30.80 + i * 0.02, lng: 76.15 + i * 0.02,
      kind: "disruption" as const, meta: d.event_type,
    })),
  ];

  const edges: any[] = [
    ...(showRoads ? (data.road_edges || []).map((e: any) => {
      const a = findNode(e.from_node), b = findNode(e.to_node);
      if (!a || !b) return null;
      return {
        id: e.id, from: [a.lng, a.lat], to: [b.lng, b.lat], flip: true,
        tone: e.monsoon_risk > 0.45 ? "risky" : "road",
      };
    }).filter(Boolean) : []),
    ...(showShipments ? (data.shipments || []).filter((s: any) => s.trip).map((s: any) => ({
      from: [s.pickup.lng, s.pickup.lat], to: [s.destination.lng, s.destination.lat], tone: "line_haul", flip: true,
    })) : []),
  ];

  return (
    <div className="space-y-4">
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <div className="label">Digital twin</div>
            <h2 className="mt-0.5 text-[15px] font-semibold text-ink">
              {points.length} nodes · {edges.length} links · {data.shipments?.length || 0} shipments
            </h2>
          </div>
          <Tabs tabs={[
            { key: "all", label: "All layers" },
            { key: "villages", label: "Villages" },
            { key: "hubs", label: "Hubs" },
            { key: "destinations", label: "Destinations" },
            { key: "shipments", label: "Shipments" },
            { key: "roads", label: "Roads" },
          ]} active={layer} onChange={setLayer} size="sm" />
        </div>
        <div className="px-2 pb-2">
          <MapView height={520} points={points} edges={edges} onSelect={setSelected} padding={0.1} />
        </div>
      </Card>

      <LiveFleet height={330} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <Card>
          <SectionHeader title="Selected node" />
          {selected ? (
            <div className="space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">{selected.name}</span>
                <Badge status="active">{selected.kind}</Badge>
              </div>
              <div className="text-[11.5px] text-ink-muted">{selected.meta}</div>
              <div className="rounded-lg bg-soft px-2.5 py-2 font-mono text-[11px] text-ink-muted">
                {selected.lat?.toFixed(4)}, {selected.lng?.toFixed(4)}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-soft/40 px-4 py-8 text-center text-[12px] text-ink-muted">
              <Crosshair size={18} className="mx-auto mb-2 text-ink-muted/70" />
              Click any node on the map to inspect it.
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader title="Active trips" />
          <div className="space-y-2">
            {(data.trips || []).filter((t: any) => ["in_transit", "loading", "at_hub", "out_for_delivery"].includes(t.status)).slice(0, 5).map((t: any) => (
              <div key={t.id} className="rounded-xl border border-line px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-ink">{t.trip_code}</span>
                  <Badge status={t.status}>{titleCase(t.status)}</Badge>
                </div>
                <div className="text-[10.5px] text-ink-muted">{t.reg_no} · started {when(t.started_at)}</div>
              </div>
            ))}
            {!(data.trips || []).filter((t: any) => ["in_transit", "loading", "at_hub", "out_for_delivery"].includes(t.status)).length && (
              <div className="text-[12px] text-ink-muted">No trips in execution right now.</div>
            )}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Road access warnings" />
          <div className="space-y-2">
            {(data.road_edges || []).filter((e: any) => e.monsoon_risk > 0.45).slice(0, 5).map((e: any) => (
              <div key={e.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-[11.5px] font-semibold text-amber-900">
                  {findNode(e.from_node)?.name} → {findNode(e.to_node)?.name}
                </div>
                <div className="text-[10.5px] text-amber-800">
                  {titleCase(e.surface)} · {e.width_m} m · monsoon risk {Math.round(e.monsoon_risk * 100)}%
                </div>
              </div>
            ))}
            {!(data.road_edges || []).filter((e: any) => e.monsoon_risk > 0.45).length && (
              <div className="text-[12px] text-ink-muted">No high-risk links recorded.</div>
            )}
          </div>
        </Card>
      </div>

      <Card className="bg-soft/50">
        <div className="flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-ink" />
          <div className="text-[11.5px] leading-relaxed text-ink-muted">
            {data.note} The twin is an operational state model — changing events, planning snapshots and policy
            parameters — with a schematic SVG renderer in this build. Leaflet + OpenStreetMap tiles are used in
            production deployment.
          </div>
        </div>
      </Card>
      <SyntheticNote />
    </div>
  );
}
