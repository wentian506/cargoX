"use client";

/* LiveTripPanel — the "where is it right now" card used on tracking screens.
 *
 * Data comes from /api/tracking/trips/{id}: position, bearing, speed, progress,
 * trail and pings. When the position is modelled rather than reported by a
 * device, the card says so — it never pretends to be a GPS fix.
 */
import { Navigation, Radio, RefreshCw, Satellite, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import LiveMap, { type MapEdge, type MapPoint } from "@/components/LiveMap";
import { Badge, Spinner } from "@/components/ui";
import { apiTracking } from "@/lib/api";

export default function LiveTripPanel({
  tripId,
  height = 320,
  refreshMs = 0,
  onPos,
}: {
  tripId: string | null;
  height?: number;
  refreshMs?: number;
  onPos?: (p: any) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    const load = () =>
      apiTracking
        .trip(tripId)
        .then((r) => {
          if (!alive) return;
          setData(r);
          setErr(null);
          onPos?.(r);
        })
        .catch((e) => alive && setErr(e?.message || "Tracking unavailable"))
        .finally(() => alive && setLoading(false));
    setLoading(true);
    load();
    if (!refreshMs) return () => { alive = false; };
    const id = setInterval(load, refreshMs);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, refreshMs, tick]);

  if (!tripId) return null;

  const pos = data?.position;
  const source: string = data?.source || "none";
  const nodes: any[] = data?.nodes || [];
  // a completed trip has nowhere left to move: show its route instead of a "0%" panel
  const finished = ["completed", "delivered", "cancelled"].includes(String(data?.status));
  const trail: [number, number][] = (data?.trail || []).map((t: any) => [t.lat, t.lng] as [number, number]);

  const points: MapPoint[] = [];
  nodes.forEach((n, i) => {
    points.push({
      id: `n-${i}`,
      name: n.name,
      lat: n.lat,
      lng: n.lng,
      kind: i === 0 ? "pickup" : i === nodes.length - 1 ? "mandi" : "hub",
      meta: i === 0 ? "origin" : i === nodes.length - 1 ? "destination" : "waypoint",
    });
  });
  if (pos && !finished) {
    points.push({
      id: "live",
      name: data?.trip_code || "Vehicle",
      lat: pos.lat,
      lng: pos.lng,
      kind: "gps",
      meta: `${Math.round(data?.progress_pct || 0)}% · ${data?.speed_kmh ?? "–"} km/h`,
      heading: data?.bearing,
      live: source === "recorded" || source === "modelled",
      selected: true,
    });
  }
  const edges: MapEdge[] = nodes.slice(0, -1).map((n, i) => ({
    id: `leg-${i}`,
    from: [n.lat, n.lng] as [number, number],
    to: [nodes[i + 1].lat, nodes[i + 1].lng] as [number, number],
    tone: i === 0 ? "first_mile" : "line_haul",
  }));

  return (
    <div className="overflow-hidden rounded-xl2 border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-accent">
            <Satellite size={13} />
          </span>
          <div>
            <div className="text-[12.5px] font-semibold text-ink">
              Live position · {data?.trip_code || tripId}
            </div>
            <div className="text-[10.5px] text-ink-muted">
              {source === "recorded"
                ? "Reported by the transporter device"
                : source === "modelled"
                  ? "Modelled from the trip plan and clock"
                  : "No position to report yet"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {source !== "none" && (
            <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${
              source === "recorded" ? "bg-emerald-50 text-emerald-700" : "bg-accent-100 text-ink"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${source === "recorded" ? "bg-emerald-500" : "bg-ink"} animate-pulse`} />
              {source === "recorded" ? "live feed" : "modelled"}
            </span>
          )}
          {data?.status && <Badge status={data.status} />}
          <button
            onClick={() => setTick((t) => t + 1)}
            className="grid h-7 w-7 place-items-center rounded-lg border border-line text-ink-muted hover:bg-soft hover:text-ink"
            aria-label="Refresh position"
          >
            {loading ? <Spinner /> : <RefreshCw size={12} />}
          </button>
        </div>
      </div>

      <div className="p-2">
        <LiveMap
          height={height}
          points={points}
          edges={edges}
          trail={finished ? [] : trail}
          live={!finished && source === "modelled"}
          liveLabel={source === "recorded" ? "Recorded fix" : "Modelled position"}
          padding={0.22}
          autoFitKey={`${tripId}-${Math.round((data?.progress_pct || 0) / 12)}`}
          footerNote={finished ? "Completed trip — route and checkpoints as recorded." : data?.note}
          notePlacement="below"
        />
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
        {[
          { icon: Navigation, label: "Progress", value: `${Math.round(data?.progress_pct || 0)}%` },
          { icon: Timer, label: "Covered", value: `${data?.progress_km ?? 0} / ${data?.total_km ?? 0} km` },
          { icon: Radio, label: "Speed", value: data?.speed_kmh ? `${Math.round(data.speed_kmh)} km/h` : "—" },
          { icon: Satellite, label: "Heading", value: data?.bearing !== undefined ? `${Math.round(data.bearing)}°` : "—" },
        ].map((k) => (
          <div key={k.label} className="bg-panel px-3 py-2.5">
            <div className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.12em] text-ink-muted">
              <k.icon size={10} /> {k.label}
            </div>
            <div className="mt-0.5 text-[13px] font-semibold text-ink">{k.value}</div>
          </div>
        ))}
      </div>

      {err && <div className="border-t border-line px-4 py-2 text-[11px] text-red-600">{err}</div>}
      {pos && (
        <div className="border-t border-line px-4 py-2 text-[11px] text-ink-muted">
          <b className="text-ink">{pos.name}</b>
          {data?.recorded_at ? ` · updated ${new Date(data.recorded_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </div>
      )}
    </div>
  );
}
