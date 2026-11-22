"use client";

import clsx from "clsx";
import { ArrowRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";

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
  values: number[];
  colour?: string;
  height?: number;
  width?: number;
  fill?: boolean;
}) {
  const v = values.length > 1 ? values : [0, ...(values.length ? values : [0, 0])];
  const max = Math.max(...v);
  const min = Math.min(...v);
  const span = max - min || 1;
  const step = width / (v.length - 1);
  const pts = v.map((val, i) => [i * step, height - 3 - ((val - min) / span) * (height - 6)]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const id = `sp-${colour.replace("#", "")}-${height}`;
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
export type BarSeriesDef = { name: string; colour: string; values: number[] };

export function BarSeries({
  labels,
  series,
  height = 190,
  format = (n: number) => n.toLocaleString("en-IN"),
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
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
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
          {labels.map((l, i) => (
            <div
              key={l + i}
              className="group relative flex h-full flex-1 flex-col items-center justify-end px-[3px]"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {active === i && (
                <div className="pointer-events-none absolute -top-1 z-10 min-w-[104px] -translate-y-full rounded-xl border border-line bg-white px-2.5 py-2 text-left shadow-lift">
                  <div className="text-[9.5px] font-medium text-ink-faint">{l}</div>
                  {series.map((s) => (
                    <div key={s.name} className="mt-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.colour }} />
                      <span className="text-[9.5px] text-ink-muted">{s.name}</span>
                      <span className="ml-auto text-[10px] font-semibold text-ink">
                        {format(s.values[i] || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div
                className={clsx(
                  "flex w-full max-w-[26px] flex-col-reverse gap-[2px] rounded-t-md transition-opacity",
                  shown !== null && shown !== i ? "opacity-45" : "opacity-100",
                )}
                style={{ height: `${Math.max(3, (totals[i] / max) * 100)}%` }}
              >
                {series.map((s) => (
                  <div
                    key={s.name}
                    style={{
                      background: barColour?.(i) ?? s.colour,
                      height: `${totals[i] ? ((s.values[i] || 0) / totals[i]) * 100 : 0}%`,
                    }}
                    className="w-full"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex pl-10">
        {labels.map((l, i) => (
          <div
            key={l + i}
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
  selected: string;
  marked?: string[];
}) {
  const base = new Date(selected + "T00:00:00");
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
                iso(d) === selected
                  ? "bg-accent font-semibold text-ink"
                  : "text-ink-muted hover:bg-soft",
              )}
            >
              {d}
              {marked.includes(iso(d)) && iso(d) !== selected && (
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
  return (
    <ul className="space-y-1">
      {items.map((it, i) => {
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
          <li key={it.title + i}>
            {it.href ? <Link href={it.href}>{body}</Link> : body}
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------------------- gauge --- */
export function Gauge({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value));
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
          strokeDasharray={`${c * pct} ${c}`}
        />
      </svg>
      <div>
        <div className="text-[20px] font-semibold leading-none text-ink">{Math.round(pct * 100)}%</div>
        {label && <div className="mt-1 text-[10px] text-ink-faint">{label}</div>}
      </div>
    </div>
  );
}
