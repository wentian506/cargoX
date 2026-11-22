"use client";

/* ArrivalClock — the one timer in CARGOX.
 *
 * It starts the moment a transporter accepts an assignment and counts down to
 * the exact pickup point the sender named. Three honest states:
 *
 *   idle      → no acceptance yet, so there is no clock to run
 *   counting  → mm:ss remaining, ETA clock time, distance and speed shown
 *   overdue   → counts up in red, says how late the vehicle is
 *
 * The numbers come from /api/assignments/{id}/arrival (or the `arrival` object
 * embedded in an assignment / shipment payload) — never invented in the UI.
 */
import { AlertTriangle, CheckCircle2, Clock, MapPin, Navigation, Timer, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

export type ArrivalClockData = {
  assignment_id: string;
  trip_id?: string | null;
  trip_code?: string | null;
  status?: string;
  phase: "not_started" | "accepted" | "en_route" | "arrived" | "overdue" | "completed" | "cancelled";
  accepted_at: string | null;
  accepted_source?: string | null;
  arrive_at: string | null;
  eta_minutes: number;
  remaining_minutes: number | null;
  remaining_seconds: number | null;
  overdue_minutes: number | null;
  late: boolean;
  drive_km: number;
  speed_kmh: number;
  vehicle?: { reg_no?: string | null; class?: string | null };
  pickup: { label?: string; lat?: number | null; lng?: number | null; source?: string; shipment?: string } | null;
  shipments?: { code?: string; pickup_village?: string; destination?: string; deadline?: string }[];
  note?: string;
};

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const clockTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export default function ArrivalClock({
  data,
  className,
  compact = false,
}: {
  data?: ArrivalClockData | null;
  className?: string;
  compact?: boolean;
}) {
  const [remaining, setRemaining] = useState<number | null>(data?.remaining_seconds ?? null);

  // re-sync whenever the server sends a fresh value
  useEffect(() => {
    setRemaining(data?.remaining_seconds ?? null);
  }, [data?.remaining_seconds, data?.assignment_id]);

  // tick locally between refetches so the clock feels live
  useEffect(() => {
    if (remaining === null) return;
    const id = setInterval(() => setRemaining((r) => (r === null ? null : Math.max(0, r - 1))), 1000);
    return () => clearInterval(id);
  }, [remaining === null]);

  const overdueSeconds = useMemo(() => {
    if (!data?.late || !data.arrive_at) return 0;
    return Math.max(0, (Date.now() - new Date(data.arrive_at).getTime()) / 1000);
  }, [data?.late, data?.arrive_at]);

  if (!data) {
    return (
      <div className={clsx("rounded-xl2 border border-dashed border-line bg-soft/40 px-3.5 py-3", className)}>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          <Clock size={12} /> Pickup arrival clock
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          Starts the moment a transporter accepts this job, then counts down to the pickup point named in the details.
        </p>
      </div>
    );
  }

  const phase = data.phase;
  const counting = phase === "accepted" || phase === "en_route";
  const idle = phase === "not_started" || phase === "cancelled";
  const done = phase === "completed";
  const arrived = phase === "arrived" || done;
  const overdue = phase === "overdue" || (data.late && phase !== "completed" && phase !== "cancelled");

  const tone = overdue
    ? "border-red-200 bg-red-50/70"
    : arrived
    ? "border-emerald-200 bg-emerald-50/60"
    : counting
    ? "border-ink bg-ink text-white"
    : "border-line bg-soft/50";

  const sub = overdue ? "text-red-600/75" : arrived ? "text-emerald-600" : counting ? "text-white/60" : "text-ink-muted";
  const strong = overdue ? "text-red-700" : arrived ? "text-emerald-700" : counting ? "text-white" : "text-ink";

  return (
    <div className={clsx("overflow-hidden rounded-xl2 border", tone, className)}>
      <div className={clsx("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", compact ? "px-3 py-2.5" : "px-4 py-3")}>
        <div className="min-w-0">
          <div className={clsx("flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]", sub)}>
            <Timer size={11} /> Pickup arrival clock
          </div>
          <div className={clsx("mt-1 flex items-center gap-1.5 text-[13px] font-semibold", strong)}>
            <MapPin size={13} className="shrink-0 opacity-70" />
            <span className="truncate">{data.pickup?.label || "pickup point"}</span>
          </div>
          <div className={clsx("mt-0.5 truncate text-[10.5px] leading-relaxed", sub)}>
            {data.pickup?.source}
            {data.pickup?.lat != null && data.pickup?.lng != null
              ? ` · ${Number(data.pickup.lat).toFixed(4)}, ${Number(data.pickup.lng).toFixed(4)}`
              : ""}
          </div>
        </div>

        <div className="text-right">
          {idle ? (
            <>
              <div className={clsx("font-mono text-[19px] font-semibold leading-none", strong)}>— : —</div>
              <div className={clsx("mt-1 text-[9.5px] uppercase tracking-[0.12em]", sub)}>not started</div>
            </>
          ) : done ? (
            <>
              <div className={clsx("inline-flex items-center gap-1.5 text-[15px] font-semibold leading-none", strong)}>
                <CheckCircle2 size={15} /> Reached pickup
              </div>
              <div className={clsx("mt-1 text-[9.5px] uppercase tracking-[0.12em]", sub)}>
                {data.vehicle?.reg_no ? "trip completed" : "completed"}
              </div>
            </>
          ) : arrived ? (
            <>
              <div className={clsx("inline-flex items-center gap-1.5 text-[15px] font-semibold leading-none", strong)}>
                <CheckCircle2 size={15} /> Arrived
              </div>
              <div className={clsx("mt-1 text-[9.5px] uppercase tracking-[0.12em]", sub)}>
                ETA was {clockTime(data.arrive_at)}
              </div>
            </>
          ) : (
            <>
              <div
                className={clsx("font-mono text-[24px] font-semibold leading-none tabular-nums sm:text-[28px]", strong)}
                aria-live="polite"
                aria-label={overdue ? "Overdue time" : "Time remaining to pickup"}
              >
                {overdue ? `+${mmss(overdueSeconds)}` : counting && remaining !== null ? mmss(remaining) : `${data.eta_minutes}m`}
              </div>
              <div className={clsx("mt-1 text-[9.5px] uppercase tracking-[0.12em]", sub)}>
                {overdue ? "overdue" : counting ? "to pickup" : "estimated drive"}
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className={clsx(
          "grid grid-cols-2 gap-px border-t text-[11px] sm:grid-cols-4",
          overdue ? "border-red-200 bg-red-200/60" : arrived ? "border-emerald-200 bg-emerald-200/60" : counting ? "border-white/15 bg-white/15" : "border-line bg-line"
        )}
      >
        {[
          { icon: <Navigation size={11} />, label: "Arrive by", value: clockTime(data.arrive_at) },
          { icon: <Truck size={11} />, label: "Distance", value: `${data.drive_km} km` },
          { icon: <Timer size={11} />, label: "Drive plan", value: `${data.eta_minutes} min` },
          { icon: <Clock size={11} />, label: "Accepted", value: clockTime(data.accepted_at) },
        ].map((cell) => (
          <div
            key={cell.label}
            className={clsx(
              "px-3 py-2",
              overdue ? "bg-red-50/80" : arrived ? "bg-emerald-50/70" : counting ? "bg-ink" : "bg-panel"
            )}
          >
            <div className={clsx("flex items-center gap-1 text-[9.5px] uppercase tracking-[0.1em]", sub)}>
              {cell.icon} {cell.label}
            </div>
            <div className={clsx("mt-0.5 font-semibold tabular-nums", strong, counting && !overdue ? "text-white" : "")}>
              {cell.value}
            </div>
          </div>
        ))}
      </div>

      {!compact && (
        <p
          className={clsx(
            "px-4 py-2 text-[10px] leading-relaxed",
            overdue ? "bg-red-50/60 text-red-700/80" : arrived ? "bg-emerald-50/50 text-emerald-800/80" : counting ? "bg-ink text-white/55" : "bg-soft/40 text-ink-faint"
          )}
        >
          {data.note}
        </p>
      )}

      {overdue && (
        <div className="flex items-center gap-1.5 border-t border-red-200 bg-red-100/60 px-4 py-1.5 text-[10.5px] font-medium text-red-700">
          <AlertTriangle size={11} /> Vehicle is {Math.round(data.overdue_minutes || 0)} min past the promised pickup time.
        </div>
      )}
    </div>
  );
}
