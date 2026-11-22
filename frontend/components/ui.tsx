"use client";

import clsx from "clsx";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Info,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------ card -- */
export function Card({
  children,
  className,
  pad = true,
  as: Tag = "div",
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
  as?: any;
  [k: string]: any;
}) {
  return (
    <Tag className={clsx("card", pad && "card-pad", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionHeader({
  title,
  subtitle,
  right,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="text-[15.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle && <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ink-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/* ----------------------------------------------------------------- delta -- */
export function Delta({
  value,
  label = "from last period",
  tone,
  suffix = "%",
}: {
  value: number;
  label?: string;
  tone?: "up" | "down" | "flat";
  suffix?: string;
}) {
  const dir = tone ?? (value > 0 ? "up" : value < 0 ? "down" : "flat");
  const colour =
    dir === "up" ? "text-emerald-600" : dir === "down" ? "text-red-500" : "text-ink-faint";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Info;
  return (
    <div className="mt-2.5 flex items-center gap-1 text-[11px]">
      <Icon size={12} className={colour} />
      <span className={clsx("font-medium", colour)}>
        {value > 0 ? "+" : ""}
        {value}
        {suffix}
      </span>
      <span className="text-ink-faint">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ stat -- */
export function Stat({
  label,
  value,
  sub,
  icon,
  tone = "default",
  hint,
  delta,
  deltaLabel,
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "forest" | "accent";
  hint?: string;
  delta?: number;
  deltaLabel?: string;
  trend?: "up" | "down" | "flat";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "border-line bg-white text-ink",
    good: "border-emerald-200 bg-white text-emerald-600",
    warn: "border-amber-200 bg-white text-amber-600",
    bad: "border-red-200 bg-white text-red-500",
    forest: "border-line bg-white text-ink",
    accent: "border-accent bg-accent-50 text-ink",
  };
  return (
    <div
      className={clsx(
        "rounded-xl2 border bg-white px-4 py-3.5 transition-shadow hover:shadow-lift",
        tones[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11.5px] font-medium text-ink-muted">{label}</div>
        {icon && (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-ink-faint">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-ink-muted">{sub}</div>}
      {delta !== undefined && <Delta value={delta} label={deltaLabel} tone={trend} />}
      {hint && <div className="mt-2 border-t border-line pt-2 text-[10.5px] text-ink-faint">{hint}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- badge -- */
const BADGE_STYLES: Record<string, string> = {
  // shipment lifecycle
  draft: "border-line bg-soft text-ink-muted",
  pending_admin_review: "border-amber-200 bg-amber-50 text-amber-700",
  planning: "border-indigo-200 bg-indigo-50 text-indigo-700",
  matched: "border-cyan-200 bg-cyan-50 text-cyan-700",
  awaiting_sender_approval: "border-orange-200 bg-orange-50 text-orange-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-600",
  ready_for_pickup: "border-lime-300 bg-accent-50 text-accent-800",
  in_transit: "border-blue-200 bg-blue-50 text-blue-700",
  at_transfer_hub: "border-violet-200 bg-violet-50 text-violet-700",
  out_for_delivery: "border-sky-200 bg-sky-50 text-sky-700",
  delivered: "border-emerald-300 bg-emerald-100 text-emerald-800",
  cancelled: "border-red-200 bg-red-50 text-red-700",
  // generic
  approved: "border-emerald-200 bg-emerald-50 text-emerald-600",
  pending: "border-accent bg-accent-50 text-ink",
  rejected: "border-red-200 bg-red-50 text-red-700",
  verified: "border-emerald-200 bg-emerald-50 text-emerald-600",
  published: "border-emerald-200 bg-emerald-50 text-emerald-600",
  reserved: "border-blue-200 bg-blue-50 text-blue-700",
  withdrawn: "border-line bg-soft text-ink-muted",
  available: "border-emerald-200 bg-emerald-50 text-emerald-600",
  assigned: "border-blue-200 bg-blue-50 text-blue-700",
  suspended: "border-red-200 bg-red-50 text-red-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-600",
  GO: "border-emerald-300 bg-emerald-50 text-emerald-600",
  WAIT: "border-accent bg-accent-50 text-ink",
  SPLIT: "border-indigo-300 bg-indigo-50 text-indigo-700",
  CANCEL: "border-red-300 bg-red-50 text-red-700",
  feasible: "border-emerald-200 bg-emerald-50 text-emerald-600",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  infeasible: "border-red-200 bg-red-50 text-red-700",
  proposed: "border-amber-200 bg-amber-50 text-amber-700",
  transported: "border-blue-200 bg-blue-50 text-blue-700",
  planned: "border-line bg-soft text-ink-muted",
  loading: "border-amber-200 bg-amber-50 text-amber-700",
  at_hub: "border-violet-200 bg-violet-50 text-violet-700",
};

export function Badge({
  children,
  status,
  className,
  dot,
}: {
  children?: React.ReactNode;
  status?: string;
  className?: string;
  dot?: boolean;
}) {
  const key = (status || String(children || "")).toLowerCase().replace(/\s+/g, "_");
  const style = BADGE_STYLES[key] || BADGE_STYLES[status || ""] || "border-line bg-soft text-ink-muted";
  return (
    <span className={clsx("chip", style, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children ?? String(status || "").replace(/_/g, " ")}
    </span>
  );
}

/* ---------------------------------------------------------------- button -- */
export function IconButton({
  children,
  onClick,
  label,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "grid h-8 w-8 place-items-center rounded-full border border-line bg-white text-ink-faint transition-colors hover:border-ink/25 hover:text-ink disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- table -- */
export function Table({
  head,
  children,
  empty,
  dense,
}: {
  head: React.ReactNode[];
  children: React.ReactNode;
  empty?: boolean;
  dense?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={clsx("th", dense && "py-2")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={head.length} className="td py-10 text-center text-ink-muted">
                No records yet.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ empty/skel -- */
export function EmptyState({
  title,
  body,
  icon,
  action,
}: {
  title: string;
  body?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-line bg-soft/60 px-6 py-11 text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-white text-ink-faint shadow-card">
        {icon || <Info size={17} />}
      </div>
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      {body && <div className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-ink-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skel", className)} />;
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card card-pad">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-40" />
          <Skeleton className="mt-2 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl2 border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-semibold">Something went wrong</div>
        <div className="mt-0.5 text-[11.5px] opacity-90">{message}</div>
      </div>
      {onRetry && (
        <button className="btn-outline btn-sm shrink-0" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- modal -- */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div className={clsx("w-full animate-fade-up rounded-t-xl3 bg-surface shadow-lift sm:rounded-xl3", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
            {description && <p className="mt-0.5 text-[11.5px] text-ink-muted">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-faint hover:bg-soft hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- toast -- */
type Toast = { id: number; kind: "success" | "error" | "info" | "warning"; message: string; detail?: string };
type ToastCtx = { push: (kind: Toast["kind"], message: string, detail?: string) => void };
const ToastContext = createContext<ToastCtx>({ push: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], message: string, detail?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message, detail }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);

  const icons = {
    success: <CheckCircle2 size={16} className="text-emerald-600" />,
    error: <XCircle size={16} className="text-red-500" />,
    info: <Info size={16} className="text-ink" />,
    warning: <AlertTriangle size={16} className="text-amber-500" />,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-xl2 border border-line bg-surface p-3.5 shadow-lift"
          >
            <span className="mt-0.5">{icons[t.kind]}</span>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-ink">{t.message}</div>
              {t.detail && <div className="mt-0.5 text-[11.5px] text-ink-muted">{t.detail}</div>}
            </div>
            <button
              className="text-ink-faint hover:text-ink"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ----------------------------------------------------------------- tabs -- */
export function Tabs({
  tabs,
  active,
  onChange,
  size = "md",
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (k: string) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-pill bg-soft p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={clsx(
            "rounded-pill font-medium transition-all",
            size === "sm" ? "px-2.5 py-1 text-[11.5px]" : "px-3 py-1.5 text-[12.5px]",
            active === t.key ? "bg-ink text-white shadow-sm" : "text-ink-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={clsx(
                "ml-1.5 rounded-pill px-1.5 py-0.5 text-[10px]",
                active === t.key ? "bg-white/20 text-white" : "bg-white text-ink-muted",
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- field -- */
export function Field({
  label,
  children,
  hint,
  required,
  error,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
  error?: string;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <div className="mb-1.5 flex items-center gap-1 text-[11.5px] font-medium text-ink">
        {label}
        {required && <span className="text-red-500">*</span>}
      </div>
      {children}
      {hint && !error && <div className="mt-1 text-[10.5px] text-ink-faint">{hint}</div>}
      {error && <div className="mt-1 text-[10.5px] font-medium text-red-600">{error}</div>}
    </label>
  );
}

/* ------------------------------------------------------------- progress -- */
export function Progress({
  value,
  tone = "accent",
  height = "h-2.5",
}: {
  value: number;
  tone?: "accent" | "ink" | "emerald" | "amber" | "red" | "forest";
  height?: string;
}) {
  const colours = {
    accent: "bg-accent",
    ink: "bg-ink",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    forest: "bg-ink",
  } as const;
  return (
    <div className={clsx("w-full overflow-hidden rounded-pill bg-soft", height)}>
      <div
        className={clsx("h-full rounded-pill transition-all duration-500", colours[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ synthetic -- */
export function SyntheticNote({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-line bg-soft/70 px-3 py-2 text-[10.5px] leading-relaxed text-ink-muted">
      <Info size={12} className="mt-0.5 shrink-0 text-ink-faint" />
      <span>{children ?? "Synthetic / model output. Not a field-validated measurement."}</span>
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" />;
}
