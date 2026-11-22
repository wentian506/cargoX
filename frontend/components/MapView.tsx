"use client";

/* Dependency-free SVG map.
 *
 * Leaflet + OpenStreetMap is the production renderer (see docs/deployment.md).
 * This SVG twin keeps the control tower fully usable in an offline/preview
 * sandbox where remote tiles and CDN assets cannot load.
 */
import React, { useMemo, useState } from "react";

export type MapPoint = {
  id: string;
  name?: string;
  lat: number;
  lng: number;
  kind: "village" | "hub" | "mandi" | "vehicle" | "pickup" | "disruption" | "stop";
  label?: string;
  status?: string;
  meta?: string;
  selected?: boolean;
};

export type MapEdge = {
  id?: string;
  from: [number, number];
  to: [number, number];
  dashed?: boolean;
  tone?: "road" | "first_mile" | "line_haul" | "risky";
  risk?: number;
};

const KIND_STYLE: Record<MapPoint["kind"], { fill: string; r: number; ring: string }> = {
  village: { fill: "#ffffff", r: 4.5, ring: "#8A8A8A" },
  hub: { fill: "#171717", r: 6.5, ring: "#FFD60A" },
  mandi: { fill: "#FFD60A", r: 7, ring: "#171717" },
  vehicle: { fill: "#171717", r: 5, ring: "#FFD60A" },
  pickup: { fill: "#FFD60A", r: 5.5, ring: "#8A6A00" },
  disruption: { fill: "#dc2626", r: 6, ring: "#7f1d1d" },
  stop: { fill: "#3D3D3D", r: 4, ring: "#171717" },
};

const TONE_STYLE: Record<string, { stroke: string; width: number; dash?: string }> = {
  road: { stroke: "#D6D6D6", width: 1.2, dash: "3 4" },
  first_mile: { stroke: "#171717", width: 1.8, dash: "5 4" },
  line_haul: { stroke: "#FFD60A", width: 2.6 },
  risky: { stroke: "#E02424", width: 2, dash: "2 3" },
};

export default function MapView({
  points,
  edges = [],
  height = 420,
  onSelect,
  legend = true,
  padding = 0.18,
}: {
  points: MapPoint[];
  edges?: MapEdge[];
  height?: number;
  onSelect?: (p: MapPoint) => void;
  legend?: boolean;
  padding?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 1000;
  const H = 620;

  const project = useMemo(() => {
    const all = [
      ...points.map((p) => [p.lng, p.lat] as [number, number]),
      ...edges.flatMap((e) => [e.from, e.to]),
    ];
    if (!all.length) return (_lng: number, _lat: number) => ({ x: W / 2, y: H / 2 });
    const lngs = all.map((a) => a[0]);
    const lats = all.map((a) => a[1]);
    let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    let minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const padLng = (maxLng - minLng || 0.02) * padding;
    const padLat = (maxLat - minLat || 0.02) * padding;
    minLng -= padLng; maxLng += padLng; minLat -= padLat; maxLat += padLat;
    // keep aspect ratio roughly correct for a north-Indian latitude (~30.8°)
    const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanX = (maxLng - minLng) * cos || 0.01;
    const spanY = maxLat - minLat || 0.01;
    const scale = Math.min(W / spanX, H / spanY);
    const offX = (W - spanX * scale) / 2;
    const offY = (H - spanY * scale) / 2;
    return (lng: number, lat: number) => ({
      x: offX + (lng - minLng) * cos * scale,
      y: H - offY - (lat - minLat) * scale,
    });
  }, [points, edges, padding]);

  const active = points.filter((p) => p.selected);

  return (
    <div className="relative overflow-hidden rounded-xl2 border border-line bg-[#EDF3EC]">
      <div className="absolute inset-0 grid-paper opacity-70" />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height }} className="relative w-full" role="img"
        aria-label="CARGOX logistic network map">
        <defs>
          <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#171717" floodOpacity="0.25" />
          </filter>
          <pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#dc2626" strokeWidth="1" opacity="0.35" />
          </pattern>
        </defs>

        {edges.map((e, i) => {
          const a = project(e.from[0], e.from[1]);
          const b = project(e.to[0], e.to[1]);
          const tone = e.tone || "road";
          const s = TONE_STYLE[tone];
          return (
            <g key={e.id || i}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={s.stroke}
                strokeWidth={s.width}
                strokeDasharray={e.dashed ? "6 6" : s.dash}
                strokeLinecap="round"
                opacity={tone === "road" ? 0.85 : 0.95}
              />
              {tone !== "road" && (
                <circle r="2.6" fill={s.stroke}>
                  <animateMotion
                    dur={`${3.2 + (i % 5) * 0.55}s`}
                    repeatCount="indefinite"
                    path={`M${a.x},${a.y} L${b.x},${b.y}`}
                  />
                </circle>
              )}
            </g>
          );
        })}

        {active.map((p, i) => {
          const a = project(p.lng, p.lat);
          return (
            <g key={`sel-${p.id}`}>
              <circle cx={a.x} cy={a.y} r={15 + i * 2} fill="#16A36A" opacity="0.12">
                <animate attributeName="r" values="12;20;12" dur="3s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}

        {points.map((p) => {
          const { x, y } = project(p.lng, p.lat);
          const st = KIND_STYLE[p.kind];
          return (
            <g
              key={p.id}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(p)}
              className={onSelect ? "cursor-pointer" : ""}
            >
              {(p.kind === "mandi" || p.kind === "hub") && (
                <circle cx={x} cy={y} r={st.r + 5} fill={st.fill} opacity="0.12" />
              )}
              <circle
                cx={x} cy={y} r={st.r}
                fill={st.fill} stroke={st.ring} strokeWidth={p.kind === "village" ? 1.6 : 2}
                filter={p.kind !== "village" ? "url(#softShadow)" : undefined}
              />
              {(p.kind === "hub" || p.kind === "mandi") && (
                <circle cx={x} cy={y} r={st.r - 2.6} fill={p.kind === "hub" ? "#B8E986" : "#ffffff"} opacity="0.9" />
              )}
              {(hover === p.id || p.selected) && p.name && (
                <g transform={`translate(${x + 10}, ${y - 8})`}>
                  <rect x="0" y="0" width={Math.max(72, p.name.length * 6.2)} height={p.meta ? 30 : 19}
                    rx="5" fill="#123D32" opacity="0.94" />
                  <text x="6" y="13" fill="#fff" fontSize="10.5" fontWeight="600">{p.name}</text>
                  {p.meta && <text x="6" y="24" fill="#B8E986" fontSize="9">{p.meta}</text>}
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {legend && (
        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-white/92 px-2.5 py-1.5 text-[10px] font-medium text-ink-muted backdrop-blur">
          {(
            [
              ["village", "Village cluster"],
              ["hub", "Transfer hub"],
              ["mandi", "Mandi / destination"],
              ["pickup", "Pickup"],
              ["vehicle", "Assigned vehicle"],
            ] as [MapPoint["kind"], string][]
          ).map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full"
                style={{ background: KIND_STYLE[k].fill, boxShadow: `0 0 0 1.5px ${KIND_STYLE[k].ring}` }} />
              {label}
            </span>
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-line bg-white/90 px-2 py-1 text-[10px] text-ink-muted">
        Schematic road network · not live GPS
      </div>
    </div>
  );
}
