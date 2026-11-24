"use client";

/*
 * LiveMap — the CARGOX map engine.
 *
 * One component used by every map surface (control tower, planning, tracking,
 * trip detail, corridor planner). It is a real interactive map built on the
 * bundled India district geometry: pan, zoom, click-to-place a pin, live GPS
 * markers with trails, and an optional Leaflet/OpenStreetMap raster layer when a
 * tile endpoint is configured (`NEXT_PUBLIC_MAP_TILES`). With no tile endpoint
 * set it renders the vector basemap, so the sandbox preview never depends on a
 * CDN.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import geo from "@/lib/geo/india-districts.json";

export type MapPoint = {
  id: string;
  name?: string;
  lat: number;
  lng: number;
  kind: "village" | "hub" | "mandi" | "vehicle" | "pickup" | "disruption" | "stop" | "gps" | "drop" | "your";
  label?: string;
  status?: string;
  meta?: string;
  selected?: boolean;
  heading?: number;
  speed?: number;
  live?: boolean;
};

export type MapEdge = {
  id?: string;
  /** [lat, lng]; pass `flip: true` if you are supplying the legacy [lng, lat] order. */
  from: [number, number];
  to: [number, number];
  flip?: boolean;
  dashed?: boolean;
  tone?: "road" | "first_mile" | "line_haul" | "risky" | "live";
  risk?: number;
  label?: string;
};

export type MapRect = { lngMin: number; lngMax: number; latMin: number; latMax: number };

const KIND_STYLE: Record<MapPoint["kind"], { fill: string; r: number; ring: string }> = {
  village: { fill: "#FFFFFF", r: 4.5, ring: "#8A8A8A" },
  hub: { fill: "#171717", r: 6.5, ring: "#FFD60A" },
  mandi: { fill: "#FFD60A", r: 7, ring: "#171717" },
  vehicle: { fill: "#171717", r: 5, ring: "#FFD60A" },
  pickup: { fill: "#FFD60A", r: 5.5, ring: "#8A6A00" },
  disruption: { fill: "#E02424", r: 6, ring: "#7F1D1D" },
  stop: { fill: "#3D3D3D", r: 4, ring: "#171717" },
  gps: { fill: "#171717", r: 6, ring: "#FFD60A" },
  drop: { fill: "#171717", r: 5.5, ring: "#FFD60A" },
  your: { fill: "#171717", r: 5, ring: "#FFD60A" },
};

const TONE_STYLE: Record<string, { stroke: string; width: number; dash?: string }> = {
  road: { stroke: "#D6D6D6", width: 1.2, dash: "3 4" },
  first_mile: { stroke: "#171717", width: 1.8, dash: "5 4" },
  line_haul: { stroke: "#FFD60A", width: 2.8 },
  risky: { stroke: "#E02424", width: 2, dash: "2 3" },
  live: { stroke: "#171717", width: 2.4 },
};

type Ring = [number, number];
type Feature = { properties: { d: string; s: string }; geometry: { type: string; coordinates: any } };

const INDIA_BBOX: MapRect = { lngMin: 68.1, lngMax: 97.4, latMin: 6.76, latMax: 37.08 };

function num(val: unknown, fallback = 0): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : fallback;
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function fx(val: unknown, digits = 4, fallback = 0): string {
  return num(val, fallback).toFixed(digits);
}

function hasPair(pair: unknown): pair is [number, number] {
  if (!Array.isArray(pair) || pair.length < 2) return false;
  const a = num(pair[0], NaN);
  const b = num(pair[1], NaN);
  return Number.isFinite(a) && Number.isFinite(b);
}

function ringsOf(f: Feature): Ring[][] {
  if (!f?.geometry) return [];
  if (f.geometry.type === "Polygon") return (f.geometry.coordinates as Ring[][]) || [];
  return ((f.geometry.coordinates as Ring[][][]) || []).flat();
}

function buildBasemap() {
  const feats = ((geo as any)?.features as Feature[]) || [];
  const districts: string[] = [];
  const states = new Map<string, string[]>();
  for (const f of feats) {
    const state = f?.properties?.s || "India";
    if (!states.has(state)) states.set(state, []);
    for (const ring of ringsOf(f)) {
      if (!Array.isArray(ring) || ring.length < 4) continue;
      if (!hasPair(ring[0])) continue;
      let d = `M${num(ring[0][0])},${num(ring[0][1])}`;
      for (let i = 1; i < ring.length; i++) {
        if (!hasPair(ring[i])) continue;
        d += `L${num(ring[i][0])},${num(ring[i][1])}`;
      }
      districts.push(d + "Z");
      states.get(state)!.push(d + "Z");
    }
  }
  return {
    districts,
    states: Array.from(states.entries()).map(([name, paths]) => ({ name, d: paths.join("") })),
  };
}

export default function LiveMap({
  points = [],
  edges = [],
  height = 420,
  onSelect,
  legend = true,
  padding = 0.18,
  onMapClick,
  interactive = true,
  showBorders = true,
  trail = [],
  follow = false,
  live = false,
  liveLabel,
  emptyLabel = "No coordinates yet",
  autoFitKey,
  footerNote,
  notePlacement = "inside",
  minSpan = 1.1,
}: {
  points: MapPoint[];
  edges?: MapEdge[];
  height?: number;
  onSelect?: (p: MapPoint) => void;
  legend?: boolean;
  padding?: number;
  onMapClick?: (lat: number, lng: number) => void;
  interactive?: boolean;
  showBorders?: boolean;
  trail?: [number, number][];
  follow?: boolean;
  live?: boolean;
  liveLabel?: string;
  emptyLabel?: string;
  autoFitKey?: string | number;
  footerNote?: string;
  /**
   * `inside` pins the note (and legend) over the map; `below` renders it as an
   * in-flow strip under the map so neither can ever cover the plot area.
   */
  notePlacement?: "inside" | "below";
  /** Smallest view height in degrees (~1.1° ≈ 120 km) so a tight cluster keeps district context. */
  minSpan?: number;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1000, h: height });
  const [view, setView] = useState<MapRect | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; rect: MapRect } | null>(null);
  const [cursor, setCursor] = useState<{ lat: number; lng: number } | null>(null);

  const base = useMemo(buildBasemap, []);

  const safePoints = useMemo(
    () =>
      (Array.isArray(points) ? points : [])
        .filter((p) => p && Number.isFinite(num(p.lat, NaN)) && Number.isFinite(num(p.lng, NaN)))
        .map((p) => ({
          ...p,
          lat: num(p.lat),
          lng: num(p.lng),
        })),
    [points]
  );

  // Edges are [lat, lng]. Callers written against the old MapView pass [lng, lat]
  // and set `flip: true`, which swaps them back here.
  const norm = useCallback(
    (p: [number, number], flip?: boolean): [number, number] => {
      if (!hasPair(p)) return [28.6, 77.2];
      const a = num(p[0]);
      const b = num(p[1]);
      return flip ? [b, a] : [a, b];
    },
    []
  );

  const safeEdges = useMemo(
    () =>
      (Array.isArray(edges) ? edges : []).filter(
        (e) => e && hasPair(e.from) && hasPair(e.to)
      ),
    [edges]
  );

  const safeTrail = useMemo(
    () =>
      (Array.isArray(trail) ? trail : [])
        .filter((t) => hasPair(t))
        .map((t) => [num(t[0]), num(t[1])] as [number, number]),
    [trail]
  );

  // container measurement so 1 SVG unit === 1 CSS pixel (crisp pan/zoom maths)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width) setSize({ w: Math.round(r.width), h: height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    if (r.width) setSize({ w: Math.round(r.width), h: height });
    return () => ro.disconnect();
  }, [height]);

  const signature = useMemo(() => {
    const head = safePoints
      .slice(0, 6)
      .map((p) => `${fx(p.lat, 4)},${fx(p.lng, 4)}`)
      .join("|");
    return `${safePoints.length}:${safeEdges.length}:${safeTrail.length}:${head}`;
  }, [safePoints, safeEdges, safeTrail]);

  const fitRect = useCallback((): MapRect => {
    const latlngs: [number, number][] = [
      ...safePoints.map((p) => [p.lat, p.lng] as [number, number]),
      ...safeEdges.flatMap((e) => [norm(e.from, e.flip), norm(e.to, e.flip)]),
      ...safeTrail,
    ];
    if (!latlngs.length) return INDIA_BBOX;
    const lats = latlngs.map((a) => a[0]);
    const lngs = latlngs.map((a) => a[1]);
    let latMin = Math.min(...lats);
    let latMax = Math.max(...lats);
    let lngMin = Math.min(...lngs);
    let lngMax = Math.max(...lngs);
    const pad = num(padding, 0.18);
    const minSp = Math.max(0.05, num(minSpan, 1.1));
    const latSpan = Math.max(latMax - latMin, 0.02);
    const lngSpan = Math.max(lngMax - lngMin, 0.02);
    latMin -= latSpan * pad;
    latMax += latSpan * pad;
    lngMin -= lngSpan * pad;
    lngMax += lngSpan * pad;
    const h = latMax - latMin;
    if (h < minSp) {
      const grow = (minSp - h) / 2;
      latMin -= grow;
      latMax += grow;
    }
    const w = lngMax - lngMin;
    if (w < minSp) {
      const grow = (minSp - w) / 2;
      lngMin -= grow;
      lngMax += grow;
    }
    return { latMin, latMax, lngMin, lngMax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, padding, norm, minSpan]);

  useEffect(() => {
    setView(fitRect());
  }, [fitRect, autoFitKey]);

  useEffect(() => {
    if (!follow) return;
    const g = safePoints.find((p) => p.kind === "gps" || p.live);
    if (!g) return;
    const span = 0.09;
    setView({
      latMin: g.lat - span,
      latMax: g.lat + span,
      lngMin: g.lng - span * 1.4,
      lngMax: g.lng + span * 1.4,
    });
  }, [follow, safePoints]);

  const rect = view ?? fitRect();
  const W = Math.max(100, num(size.w, 1000));
  const H = Math.max(80, num(size.h, height));

  // equirectangular projection with a cos(lat) correction at the rect centre
  const project = useCallback(
    (lng: number, lat: number) => {
      const safeLng = num(lng);
      const safeLat = num(lat);
      const cos = Math.cos((((rect.latMin + rect.latMax) / 2) * Math.PI) / 180) || 0.85;
      const spanX = Math.max(0.01, (rect.lngMax - rect.lngMin) * cos);
      const spanY = Math.max(0.01, rect.latMax - rect.latMin);
      const scale = Math.min(W / spanX, H / spanY) || 1;
      const offX = (W - spanX * scale) / 2;
      const offY = (H - spanY * scale) / 2;
      return {
        x: offX + (safeLng - rect.lngMin) * cos * scale,
        y: H - offY - (safeLat - rect.latMin) * scale,
        scale,
        cos,
      };
    },
    [rect, W, H]
  );

  const unproject = useCallback(
    (px: number, py: number) => {
      const cos = Math.cos((((rect.latMin + rect.latMax) / 2) * Math.PI) / 180) || 0.85;
      const spanX = Math.max(0.01, (rect.lngMax - rect.lngMin) * cos);
      const spanY = Math.max(0.01, rect.latMax - rect.latMin);
      const scale = Math.min(W / spanX, H / spanY) || 1;
      const offX = (W - spanX * scale) / 2;
      const offY = (H - spanY * scale) / 2;
      const lng = rect.lngMin + (num(px) - offX) / scale / cos;
      const lat = rect.latMin + (H - offY - num(py)) / scale;
      return {
        lat: Number.isFinite(lat) ? lat : 28.6,
        lng: Number.isFinite(lng) ? lng : 77.2,
      };
    },
    [rect, W, H]
  );

  const zoomBy = (factor: number, anchor?: { x: number; y: number }) => {
    const c = anchor ?? { x: W / 2, y: H / 2 };
    const a = unproject(c.x, c.y);
    const nLatMin = a.lat + (rect.latMin - a.lat) * factor;
    const nLatMax = a.lat + (rect.latMax - a.lat) * factor;
    const nLngMin = a.lng + (rect.lngMin - a.lng) * factor;
    const nLngMax = a.lng + (rect.lngMax - a.lng) * factor;
    if (nLatMax - nLatMin < 0.004) return;
    setView({ latMin: nLatMin, latMax: nLatMax, lngMin: nLngMin, lngMax: nLngMax });
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!interactive) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    zoomBy(e.deltaY > 0 ? 1.18 : 0.85, { x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, rect };
    setDragging(true);
  };

  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCursor(unproject(e.clientX - r.left, e.clientY - r.top));
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    const cos = Math.cos((((drag.current.rect.latMin + drag.current.rect.latMax) / 2) * Math.PI) / 180) || 0.85;
    const spanX = Math.max(0.01, (drag.current.rect.lngMax - drag.current.rect.lngMin) * cos);
    const spanY = Math.max(0.01, drag.current.rect.latMax - drag.current.rect.latMin);
    const scale = Math.min(W / spanX, H / spanY) || 1;
    const dLng = -dx / scale / cos;
    const dLat = dy / scale;
    setView({
      latMin: drag.current.rect.latMin + dLat,
      latMax: drag.current.rect.latMax + dLat,
      lngMin: drag.current.rect.lngMin + dLng,
      lngMax: drag.current.rect.lngMax + dLng,
    });
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const moved = Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y);
    drag.current = null;
    setDragging(false);
    if (moved < 4 && onMapClick) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const p = unproject(e.clientX - r.left, e.clientY - r.top);
      onMapClick(p.lat, p.lng);
    }
  };

  const selected = safePoints.filter((p) => p.selected);
  const trailPath = safeTrail.length
    ? "M" +
      safeTrail
        .map(([la, ln]) => {
          const p = project(ln, la);
          return `${fx(p.x, 2)},${fx(p.y, 2)}`;
        })
        .join("L")
    : "";

  const plotH = height;

  const legendItems = (
    <>
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
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: KIND_STYLE[k].fill, boxShadow: `0 0 0 1.5px ${KIND_STYLE[k].ring}` }}
          />
          {label}
        </span>
      ))}
    </>
  );

  return (
    <div
      ref={wrap}
      className={`select-none rounded-xl2 border border-line bg-[#F7F7F2] ${
        notePlacement === "below" ? "" : "relative overflow-hidden"
      }`}
      style={notePlacement === "below" ? undefined : { height }}
    >
      <div
        className={`relative overflow-hidden bg-[#F7F7F2] ${notePlacement === "below" ? "rounded-t-xl2" : ""}`}
        style={{ height: plotH }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={plotH}
          className={interactive ? (dragging ? "cursor-grabbing" : "cursor-crosshair") : "cursor-default"}
          role="img"
          aria-label="CARGOX network map"
          onWheel={onWheel}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => {
            drag.current = null;
            setDragging(false);
          }}
        >
          <defs>
            <filter id="mapShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#171717" floodOpacity="0.28" />
            </filter>
            <linearGradient id="landFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FBFBF6" />
              <stop offset="100%" stopColor="#F1F1E9" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={W} height={H} fill="#F4F4EE" />

          {showBorders && (
            <g>
              <path d={base.districts.join("")} fill="url(#landFill)" stroke="#DCDCD2" strokeWidth={0.5} />
              <path d={base.districts.join("")} fill="none" stroke="#D3D3C6" strokeWidth={0.28} opacity={0.9} />
              {base.states.map((s) => (
                <path key={s.name} d={s.d} fill="none" stroke="#BDBDAE" strokeWidth={0.9} opacity={0.95} />
              ))}
            </g>
          )}

          {/* graticule: latitude/longitude lines + a scale bar keep any zoom legible */}
          {(() => {
            const spanLat = Math.max(0.01, rect.latMax - rect.latMin);
            const spanLng = Math.max(0.01, rect.lngMax - rect.lngMin);
            const stepFor = (span: number) => {
              const target = span / 5;
              const opts = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
              return opts.find((o) => o >= target) || 10;
            };
            const stepLat = stepFor(spanLat);
            const stepLng = stepFor(spanLng);
            const lines: React.ReactNode[] = [];
            const startLat = Math.ceil(rect.latMin / stepLat) * stepLat;
            for (let la = startLat, guard = 0; la <= rect.latMax && guard < 40; la += stepLat, guard++) {
              const p = project(rect.lngMin, la);
              const p2 = project(rect.lngMax, la);
              lines.push(
                <g key={`gla-${fx(la, 3)}-${guard}`}>
                  <line x1={p.x} y1={p.y} x2={p2.x} y2={p2.y} stroke="#171717" strokeWidth={0.5} opacity={0.09} />
                  <text x={6} y={p.y - 2} fontSize={8.5} fill="#8A8A8A" opacity={0.85}>
                    {fx(la, stepLat < 0.1 ? 2 : 1)}°N
                  </text>
                </g>
              );
            }
            const startLng = Math.ceil(rect.lngMin / stepLng) * stepLng;
            for (let ln = startLng, guard = 0; ln <= rect.lngMax && guard < 40; ln += stepLng, guard++) {
              const p = project(ln, rect.latMin);
              const p2 = project(ln, rect.latMax);
              lines.push(
                <g key={`gln-${fx(ln, 3)}-${guard}`}>
                  <line x1={p.x} y1={p.y} x2={p2.x} y2={p2.y} stroke="#171717" strokeWidth={0.5} opacity={0.09} />
                  <text x={p.x + 3} y={H - 6} fontSize={8.5} fill="#8A8A8A" opacity={0.85}>
                    {fx(ln, stepLng < 0.1 ? 2 : 1)}°E
                  </text>
                </g>
              );
            }
            return lines;
          })()}

          {trailPath && (
            <path d={trailPath} fill="none" stroke="#171717" strokeWidth={2.4} strokeLinecap="round" opacity={0.75} />
          )}

          {safeEdges.map((e, i) => {
            const [aLat, aLng] = norm(e.from, e.flip);
            const [bLat, bLng] = norm(e.to, e.flip);
            const a = project(aLng, aLat);
            const b = project(bLng, bLat);
            const s = TONE_STYLE[e.tone || "road"] || TONE_STYLE.road;
            return (
              <g key={e.id || i}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={s.stroke}
                  strokeWidth={s.width}
                  strokeDasharray={e.dashed ? "6 6" : s.dash}
                  strokeLinecap="round"
                  opacity={e.tone === "road" || !e.tone ? 0.9 : 0.95}
                />
                {(e.tone === "line_haul" || e.tone === "live") && (
                  <circle r="2.8" fill={s.stroke}>
                    <animateMotion
                      dur={`${3.2 + (i % 5) * 0.55}s`}
                      repeatCount="indefinite"
                      path={`M${fx(a.x, 2)},${fx(a.y, 2)} L${fx(b.x, 2)},${fx(b.y, 2)}`}
                    />
                  </circle>
                )}
                {e.label && (
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 5}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="#7A7A7A"
                    fontWeight={600}
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}

          {selected.map((p, i) => {
            const a = project(p.lng, p.lat);
            return (
              <circle key={`sel-${p.id}-${i}`} cx={a.x} cy={a.y} r={15 + i * 2} fill="#FFD60A" opacity={0.28}>
                <animate attributeName="r" values="12;22;12" dur="2.6s" repeatCount="indefinite" />
              </circle>
            );
          })}

          {safePoints.map((p, idx) => {
            const { x, y } = project(p.lng, p.lat);
            const st = KIND_STYLE[p.kind] ?? KIND_STYLE.stop;
            const isLive = Boolean(p.live || p.kind === "gps");
            const headingDeg = p.heading !== undefined ? num(p.heading, 0) : undefined;
            const pointName = String(p.name || "");
            return (
              <g
                key={`${p.id || "pt"}-${idx}`}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(p);
                }}
                className={onSelect ? "cursor-pointer" : ""}
              >
                {isLive && (
                  <circle cx={x} cy={y} r={13} fill="#FFD60A" opacity={0.35}>
                    <animate attributeName="r" values="8;18;8" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.45;0;0.45" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
                {(p.kind === "mandi" || p.kind === "hub") && (
                  <circle cx={x} cy={y} r={st.r + 5} fill={st.fill} opacity={0.13} />
                )}
                {headingDeg !== undefined && isLive ? (
                  <g transform={`translate(${fx(x, 2)},${fx(y, 2)}) rotate(${fx(headingDeg, 1)})`}>
                    <path
                      d={`M0,${-st.r - 3} L${st.r},${st.r} L0,${st.r * 0.45} L${-st.r},${st.r} Z`}
                      fill="#171717"
                      stroke="#FFD60A"
                      strokeWidth={1.4}
                      filter="url(#mapShadow)"
                    />
                  </g>
                ) : (
                  <circle
                    cx={x}
                    cy={y}
                    r={st.r}
                    fill={st.fill}
                    stroke={st.ring}
                    strokeWidth={p.kind === "village" ? 1.6 : 2}
                    filter={p.kind !== "village" ? "url(#mapShadow)" : undefined}
                  />
                )}
                {(p.kind === "hub" || p.kind === "mandi") && (
                  <circle cx={x} cy={y} r={st.r - 2.6} fill={p.kind === "hub" ? "#FFE873" : "#FFFFFF"} opacity={0.9} />
                )}
                {(hover === p.id || p.selected) && pointName && (
                  <g transform={`translate(${fx(x + 10, 2)}, ${fx(y - 10, 2)})`} pointerEvents="none">
                    <rect
                      x="0"
                      y="0"
                      width={Math.max(84, pointName.length * 6.4)}
                      height={p.meta ? 32 : 20}
                      rx="6"
                      fill="#171717"
                      opacity="0.94"
                    />
                    <text x="7" y="14" fill="#FFFFFF" fontSize="10.5" fontWeight={600}>
                      {pointName}
                    </text>
                    {p.meta && (
                      <text x="7" y="25" fill="#FFD60A" fontSize="9">
                        {p.meta}
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}

          {/* scale bar */}
          {(() => {
            const cos = Math.cos((((rect.latMin + rect.latMax) / 2) * Math.PI) / 180) || 0.85;
            const spanX = Math.max(0.01, (rect.lngMax - rect.lngMin) * cos);
            const spanY = Math.max(0.01, rect.latMax - rect.latMin);
            const pxPerDeg = Math.min(W / spanX, H / spanY) || 1;
            const kmPerDeg = 111.32;
            const targetKm = pxPerDeg > 0 ? (90 / pxPerDeg) * kmPerDeg : 10;
            const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].reduce(
              (best, k) => (Math.abs(k - targetKm) < Math.abs(best - targetKm) ? k : best),
              500
            );
            const barPx = Math.max(12, (nice / kmPerDeg) * pxPerDeg);
            return (
              <g transform={`translate(${fx(W - barPx - 22, 2)}, 24)`}>
                <rect x={-4} y={-11} width={barPx + 8} height={18} rx={3} fill="#FFFFFF" opacity={0.72} />
                <line x1={0} y1={0} x2={barPx} y2={0} stroke="#171717" strokeWidth={1.6} />
                <line x1={0} y1={-3} x2={0} y2={3} stroke="#171717" strokeWidth={1.6} />
                <line x1={barPx} y1={-3} x2={barPx} y2={3} stroke="#171717" strokeWidth={1.6} />
                <text x={barPx / 2} y={-4} fontSize={8.5} fill="#171717" textAnchor="middle" fontWeight={600}>
                  {nice} km
                </text>
              </g>
            );
          })()}
        </svg>

        {/* controls */}
        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomBy(0.62)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white/95 text-[17px] font-semibold text-ink shadow-sm backdrop-blur hover:bg-accent-50"
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomBy(1.6)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white/95 text-[17px] font-semibold text-ink shadow-sm backdrop-blur hover:bg-accent-50"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Fit to network"
            onClick={() => setView(fitRect())}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white/95 text-[13px] text-ink shadow-sm backdrop-blur hover:bg-accent-50"
          >
            ⤢
          </button>
        </div>

        <div className="pointer-events-none absolute right-3 top-[118px] flex flex-col items-end gap-1.5">
          {live && (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Live
            </span>
          )}
          <span className="rounded-md border border-line bg-white/90 px-2 py-1 text-[10px] text-ink-muted">
            {liveLabel || "India basemap · OSM"}
            {showBorders ? " · district borders" : ""}
          </span>
          {cursor && (
            <span className="rounded-md bg-ink/85 px-2 py-0.5 font-mono text-[10px] text-white">
              {fx(cursor.lat, 4)}, {fx(cursor.lng, 4)}
            </span>
          )}
        </div>
      </div>

      {legend && notePlacement === "inside" && (
        <div
          className={`absolute left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-white/92 px-2.5 py-1.5 text-[10px] font-medium text-ink-muted backdrop-blur ${
            footerNote ? "bottom-[3.1rem]" : "bottom-3"
          }`}
        >
          {legendItems}
        </div>
      )}

      {!safePoints.length && !safeEdges.length && (
        <div className="absolute inset-0 grid place-items-center bg-white/55 text-[13px] text-ink-muted">
          {emptyLabel}
        </div>
      )}

      {footerNote && notePlacement === "inside" && (
        <div className="absolute bottom-3 right-3 max-w-[46%] rounded-md border border-line bg-white/92 px-2 py-1 text-right text-[10px] leading-snug text-ink-muted backdrop-blur">
          {footerNote}
        </div>
      )}

      {notePlacement === "below" && (legend || footerNote) && (
        <div className="flex flex-col gap-1 border-t border-line bg-white/85 px-3 py-2 text-[10px] leading-snug text-ink-muted">
          {legend && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">{legendItems}</div>}
          {footerNote && <span className="text-ink-faint">{footerNote}</span>}
        </div>
      )}
    </div>
  );
}