"use client";

import { Check, ShieldCheck, Store, Truck } from "lucide-react";

export type Role = "sender" | "transporter" | "admin";

export const ROLES: {
  id: Role;
  label: string;
  blurb: string;
  icon: typeof Truck;
  inviteOnly?: boolean;
}[] = [
  {
    id: "sender",
    label: "Sender",
    blurb: "Farmer, aggregator or trader shipping produce",
    icon: Store,
  },
  {
    id: "transporter",
    label: "Transporter",
    blurb: "Fleet owner or driver offering vehicle capacity",
    icon: Truck,
  },
  {
    id: "admin",
    label: "Admin",
    blurb: "Control tower — invite-only account",
    icon: ShieldCheck,
    inviteOnly: true,
  },
];

export default function RolePicker({
  value,
  onChange,
  compact = false,
}: {
  value: Role | null;
  onChange: (r: Role) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "grid grid-cols-3 gap-2" : "space-y-2"}>
      {ROLES.map((r) => {
        const active = value === r.id;
        const Icon = r.icon;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            aria-pressed={active}
            className={`group relative flex w-full items-center gap-3 rounded-xl2 border px-3.5 text-left transition-all ${
              compact ? "flex-col items-center gap-1.5 py-3 text-center" : "py-3"
            } ${
              active
                ? "border-accent bg-accent text-ink shadow-[0_6px_20px_-8px_rgba(255,214,10,0.9)]"
                : "border-white/15 bg-white/[0.05] text-white/80 hover:border-white/35 hover:bg-white/10"
            }`}
          >
            <span
              className={`grid shrink-0 place-items-center rounded-full ${
                compact ? "h-8 w-8" : "h-9 w-9"
              } ${active ? "bg-ink text-accent" : "bg-white/10 text-white/70"}`}
            >
              <Icon size={compact ? 15 : 16} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold leading-tight">
                {r.label}
                {r.inviteOnly && (
                  <span
                    className={`rounded-pill px-1.5 py-px text-[8.5px] font-medium uppercase tracking-[0.1em] ${
                      active ? "bg-ink/15 text-ink/70" : "bg-white/10 text-white/45"
                    }`}
                  >
                    invite
                  </span>
                )}
              </span>
              {!compact && (
                <span className={`mt-0.5 block text-[10.5px] leading-snug ${active ? "text-ink/60" : "text-white/40"}`}>
                  {r.blurb}
                </span>
              )}
            </span>
            {active && !compact && <Check size={14} className="ml-auto shrink-0 text-ink" />}
          </button>
        );
      })}
    </div>
  );
}
