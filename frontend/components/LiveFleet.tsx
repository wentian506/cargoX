"use client";

/* LiveFleet — every moving vehicle in the viewer's scope on one real map.
 * Auto-refreshes; states the position source on the header so a modelled
 * position is never mistaken for a device fix. */
import { Radio, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import LiveMap, { type MapPoint } from "@/components/LiveMap";
import { apiTracking } from "@/lib/api";

export default function LiveFleet({
  height = 320,
  refreshMs = 30000,
  title = "Live fleet",
}: {
  height?: number;
  refreshMs?: number;
  title?: string;
}) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      apiTracking
        .live()
        .then((r) => alive && setData(r))
        .catch(() => null)
        .finally(() => alive && setBusy(false));
    setBusy(true);
    load();
    const id = refreshMs ? setInterval(load, refreshMs) : null;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [refreshMs, tick]);

  const trips: any[] = data?.trips || [];
  const trails = data?.trails || {};

  const points: MapPoint[] = [];
  trips.forEach((t) => {
    const trail: any[] = trails[t.trip_id] || [];
    trail.slice(-1).forEach(() => null);
    (trail.length ? trail : [{ lat: t.lat, lng: t.lng }]).forEach((p: any, i: number) => {
      points.push({
        id: `${t.trip_id}-${i}`,
        name: i === (trail.length || 1) - 1 ? t.trip_code : undefined,
        lat: p.lat,
        lng: p.lng,
        kind: i === (trail.length || 1) - 1 ? "gps" : "stop",
        live: i === (trail.length || 1) - 1,
        selected: sel === t.trip_id && i === (trail.length || 1) - 1,
        heading: t.heading,
        meta: `${Math.round(t.progress_pct || 0)}% · ${t.place || ""}`,
      });
    });
  });

  const single = trips.find((t) => t.trip_id === sel) || (trips.length === 1 ? trips[0] : null);

  return (
    <div className="rounded-xl2 border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <div className="text-[12.5px] font-semibold text-ink">{title}</div>
          <div className="text-[10.5px] text-ink-muted">
            {trips.length === 0
              ? "No trip in transit in your scope right now"
              : `${trips.length} vehicle${trips.length === 1 ? "" : "s"} moving · ${
                  trips.every((t) => t.source === "recorded")
                    ? "device-reported"
                    : "modelled where no device reports"
                }`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Live
          </span>
          <button
            onClick={() => setTick((t) => t + 1)}
            className="grid h-7 w-7 place-items-center rounded-lg border border-line text-ink-muted hover:bg-soft hover:text-ink"
            aria-label="Refresh fleet"
          >
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="text-[12.5px] font-medium text-ink">Nothing on the road at this moment</div>
          <div className="mt-1 text-[11px] text-ink-muted">
            The map fills in as soon as a trip moves to <b className="text-ink">in transit</b>. Positions come from
            the transporter device where one reports, otherwise from the planned legs — always labelled.
          </div>
        </div>
      ) : (
      <div className="p-2">
        <LiveMap
          height={height}
          points={points}
          onSelect={(p) => setSel(p.id.split("-").slice(0, 3).join("-"))}
          live
          padding={0.25}
          liveLabel="Fleet positions"
          emptyLabel="No vehicle is in transit right now"
          autoFitKey={trips.length}
        />
      </div>
      )}

      {trips.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          {trips.slice(0, 4).map((t) => (
            <button
              key={t.trip_id}
              onClick={() => setSel(t.trip_id)}
              className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[11.5px] hover:bg-soft ${
                sel === t.trip_id ? "bg-accent-50" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Radio size={11} className="shrink-0 text-ink-muted" />
                <b className="truncate text-ink">{t.trip_code}</b>
                <span className="truncate text-ink-muted">{t.place}</span>
              </span>
              <span className="shrink-0 font-mono text-[10.5px] text-ink-muted">
                {Math.round(t.progress_pct || 0)}%
              </span>
            </button>
          ))}
        </div>
      )}
      {single && (
        <div className="border-t border-line px-4 py-2 text-[11px] text-ink-muted">
          Selected <b className="text-ink">{single.trip_code}</b> · source:{" "}
          <b className="text-ink">{single.source}</b> · {single.total_km} km route
        </div>
      )}
    </div>
  );
}
