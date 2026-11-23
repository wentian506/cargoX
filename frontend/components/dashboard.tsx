"use client";

import clsx from "clsx";
import { ArrowRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";

function toFiniteNumber(val: unknown, fallback = 0): number {
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : fallback;
  }
  if (typeof val === "string" && val.trim() !== "") {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function safeFixed(val: unknown, digits = 1, fallback = 0): string {
  return toFiniteNumber(val, fallback).toFixed(digits);
}

/* --------------------------------------------------------------- card ---- */
export function DashCard({
  title,
  subtitle,
  right,
  children,
  className,
  action,
  href,
  pad = true,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: string;
  href?: string;
  pad?: boolean;
}) {
  return (
    <section className={clsx("rounded-xl3 border border-line bg-white", className)}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            )}
            {subtitle && <p className="mt-0.5 text-[10.5px] text-ink-faint">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {right}
            {action && href && (
              <Link
                href={href}
                className="inline-flex items-center gap-1 text-[10.5px] font-medium text-ink-muted hover:text-ink"
              >
                {action} <ArrowRight size={11} />
              </Link>
            )}
            {!action && !right && <MoreHorizontal size={15} className="text-ink-faint" />}
          </div>
        </header>
      )}
      <div className={clsx(pad && "px-5 pb-5")}>{children}</div>
    </section>
  );
}

/* ----------------------------------------------------------- sparkline --- */
export function Sparkline({
  values,
  colour = "#FFD60A",
  height = 34,
  width = 96,
  fill = true,
}: {
  values?: number[] | null;
  colour?: string;
  height?: number;
  width?: number;
  fill?: boolean;
}) {
  const safeValues = Array.isArray(values) ? values.map((v) => toFiniteNumber(v, 0)) : [];
  const v = safeValues.length > 1 ? safeValues : [0, ...(safeValues.length ? safeValues : [0, 0])];
  const max = Math.max(...v);
  const min = Math.min(...v);
  const span = max - min || 1;
  const denom = Math.max(1, v.length - 1);
  const step = width / denom;
  const pts = v.map((val, i) => [
    i * step,
    height - 3 - ((val - min) / span) * Math.max(1, height - 6),
  ]);
  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${safeFixed(p[0], 1)},${safeFixed(p[1], 1)}`)
    .join(" ");
  const id = `sp-${(colour || "FFD60A").replace("#", "")}-${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.45" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && (
        <path
          d={`${d} L${width},${height} L0,${height} Z`}
          fill={`url(#${id})`}
        />
      )}
      <path d={d} fill="none" stroke={colour} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------- bar chart -- */
export type BarSeriesDef = { name: string; colour: string; values?: number[] | null };

export function BarSeries({
  labels = [],
  series = [],
  height = 190,
  format = (n: number) => toFiniteNumber(n, 0).toLocaleString("en-IN"),
  highlight,
  unit,
  barColour,
}: {
  labels: string[];
  series: BarSeriesDef[];
  height?: number;
  format?: (n: number) => string;
  highlight?: number;
  unit?: string;
  /** optional per-bar tint (overrides the series colour) — used to single out one bar */
  barColour?: (i: number) => string | undefined;
}) {
  const [active, setActive] = useState<number | null>(null);
  const safeLabels = Array.isArray(labels) ? labels : [];
  const safeSeries = Array.isArray(series) ? series : [];
  const totals = safeLabels.map((_, i) =>
    safeSeries.reduce((a, s) => a + toFiniteNumber(s?.values?.[i], 0), 0),
  );
  const max = Math.max(1, ...totals);
  /* `highlight` emphasises a bar; the tooltip only appears on hover */
  const shown = active ?? highlight ?? null;

  return (
    <div className="relative">
      {/* y grid */}
      <div className="relative" style={{ height }}>
        <div className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-right text-[9px] text-ink-faint">
                {format(Math.round((max * (3 - i)) / 3))}
              </span>
              <span className="h-px flex-1 bg-line/70" />
            </div>
          ))}
        </div>

        <div className="absolute inset-0 flex items-end pl-10">
          {safeLabels.map((l, i) => {
            const barVal = toFiniteNumber(totals[i], 0);
            return (
              <div
                key={`${String(l)}-${i}`}
                className="group relative flex h-full flex-1 flex-col items-center justify-end px-[3px]"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                {active === i && (
                  <div className="pointer-events-none absolute -top-1 z-10 min-w-[104px] -translate-y-full rounded-xl border border-line bg-white px-2.5 py-2 text-left shadow-lift">
                    <div className="text-[9.5px] font-medium text-ink-faint">{l}</div>
                    {safeSeries.map((s) => {
                      const itemVal = toFiniteNumber(s?.values?.[i], 0);
                      return (
                        <div key={s.name} className="mt-1 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.colour }} />
                          <span className="text-[9.5px] text-ink-muted">{s.name}</span>
                          <span className="ml-auto text-[10px] font-semibold text-ink">
                            {format(itemVal)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div
                  className={clsx(
                    "flex w-full max-w-[26px] flex-col-reverse gap-[2px] rounded-t-md transition-opacity",
                    shown !== null && shown !== i ? "opacity-45" : "opacity-100",
                  )}
                  style={{ height: `${Math.max(3, (barVal / max) * 100)}%` }}
                >
                  {safeSeries.map((s) => {
                    const segVal = toFiniteNumber(s?.values?.[i], 0);
                    return (
                      <div
                        key={s.name}
                        style={{
                          background: barColour?.(i) ?? s.colour,
                          height: `${barVal ? (segVal / barVal) * 100 : 0}%`,
                        }}
                        className="w-full"
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex pl-10">
        {safeLabels.map((l, i) => (
          <div
            key={`${String(l)}-${i}`}
            className={clsx(
              "flex-1 text-center text-[9.5px]",
              shown === i ? "font-semibold text-ink" : "text-ink-faint",
            )}
          >
            {l}
          </div>
        ))}
      </div>
      {unit && <div className="mt-1 pl-10 text-[9px] text-ink-faint">{unit}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ segmented -- */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-pill border border-line bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={clsx(
            "rounded-pill px-2.5 py-1 text-[10.5px] font-medium transition-colors",
            value === o.key ? "bg-ink text-white" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- legend -- */
export function ChartLegend({ items }: { items: { name: string; colour: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5 text-[10px] text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: i.colour }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- calendar -- */
export function MonthStrip({
  selected,
  marked = [],
}: {
  /** ISO date string for the highlighted day */
  selected?: string | null;
  marked?: string[] | null;
}) {
  const fallbackIso = new Date().toISOString().slice(0, 10);
  const candidate = typeof selected === "string" && selected.trim() ? selected.trim() : fallbackIso;
  const parsed = new Date(`${candidate}T00:00:00`);
  const base = Number.isNaN(parsed.getTime()) ? new Date(`${fallbackIso}T00:00:00`) : parsed;
  const activeIso = Number.isNaN(parsed.getTime()) ? fallbackIso : candidate;
  const safeMarked = Array.isArray(marked) ? marked : [];

  const year = base.getFullYear();
  const month = base.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7; // monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthName = first.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const iso = (d: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11.5px] font-semibold text-ink">{monthName}</span>
        <div className="flex items-center gap-1 text-ink-faint">
          <span className="grid h-5 w-5 place-items-center rounded-full border border-line">‹</span>
          <span className="grid h-5 w-5 place-items-center rounded-full border border-line">›</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} className="pb-1 text-[9px] font-medium uppercase text-ink-faint">
            {d.slice(0, 3)}
          </span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={`p${i}`} />
          ) : (
            <span
              key={d}
              className={clsx(
                "relative mx-auto grid h-7 w-7 place-items-center rounded-full text-[10.5px]",
                iso(d) === activeIso
                  ? "bg-accent font-semibold text-ink"
                  : "text-ink-muted hover:bg-soft",
              )}
            >
              {d}
              {safeMarked.includes(iso(d)) && iso(d) !== activeIso && (
                <span className="absolute bottom-1 h-0.5 w-0.5 rounded-full bg-ink-faint" />
              )}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- rows --- */
export function Rows({
  items,
}: {
  items: {
    icon?: React.ReactNode;
    title: string;
    meta?: string;
    value?: React.ReactNode;
    tone?: "default" | "warn" | "good";
    href?: string;
  }[];
}) {
  const tones = {
    default: "bg-soft text-ink",
    warn: "bg-accent-100 text-ink",
    good: "bg-emerald-50 text-emerald-600",
  } as const;
  const safeItems = Array.isArray(items) ? items : [];
  return (
    <ul className="space-y-1">
      {safeItems.map((it, i) => {
        const body = (
          <div className="flex items-center gap-3 rounded-xl px-1.5 py-2 transition-colors hover:bg-soft/70">
            <span
              className={clsx(
                "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-semibold",
                tones[it.tone || "default"],
              )}
            >
              {it.icon ?? String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-medium text-ink">{it.title}</div>
              {it.meta && <div className="truncate text-[9.5px] text-ink-faint">{it.meta}</div>}
            </div>
            {it.value && <div className="shrink-0 text-[10.5px] font-medium text-ink-muted">{it.value}</div>}
          </div>
        );
        return (
          <li key={`${it.title}-${i}`}>
            {it.href ? <Link href={it.href}>{body}</Link> : body}
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------------------- gauge --- */
export function Gauge({ value, label }: { value?: number | null; label?: string }) {
  const numeric = toFiniteNumber(value, 0);
  const pct = Math.max(0, Math.min(1, numeric));
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg width="68" height="68" viewBox="0 0 68 68" className="-rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#F1F1F1" strokeWidth="7" />
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke="#FFD60A"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${safeFixed(c * pct, 2)} ${safeFixed(c, 2)}`}
        />
      </svg>
      <div>
        <div className="text-[20px] font-semibold leading-none text-ink">{Math.round(pct * 100)}%</div>
        {label && <div className="mt-1 text-[10px] text-ink-faint">{label}</div>}
      </div>
    </div>
  );
}