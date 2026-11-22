"use client";

import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";
import { adminNav } from "@/lib/nav";
import { useSession } from "@/lib/session";

const TITLES: Record<string, [string, string]> = {
  "/admin": ["Control tower", "Central coordination of every shipment, vehicle and decision"],
  "/admin/tower": ["Digital twin map", "Villages, hubs, vehicles and active routes"],
  "/admin/trips": ["Trip monitoring", "Live operational state of every trip"],
  "/admin/senders": ["Sender management", "Accounts, volume and account status"],
  "/admin/transporters": ["Transporter management", "Verification, fleet and assignments"],
  "/admin/vehicles": ["Vehicle management", "Document verification gate"],
  "/admin/shipments": ["Shipment management", "Review, approve and coordinate every request"],
  "/admin/pools": ["Shipment pool", "Compatibility-gated consolidation"],
  "/admin/capacity": ["Capacity exchange", "Published blocks, coverage and gaps"],
  "/admin/planning": ["Plan & route", "CVRPTW and two-echelon assembly"],
  "/admin/dispatch": ["DispatchSense", "GO / WAIT / SPLIT / CANCEL with the rupee trade-off"],
  "/admin/allocations": ["ShapleySplit", "Fair freight allocation with participation checks"],
  "/admin/assignments": ["Assignments", "Double consent: sender approval + transporter acceptance"],
  "/admin/deliveries": ["Delivery verification", "POD, external acknowledgement and closure"],
  "/admin/harvestpulse": ["HarvestPulse", "7–21 day harvest-ready demand ribbon"],
  "/admin/readysync": ["ReadySync", "T-60 / T-45 readiness and wave management"],
  "/admin/grantwin": ["GramTwin-2E & hubs", "Hub selection and two-stage relay"],
  "/admin/valueclock": ["ValueClock", "Destination net realisation comparison"],
  "/admin/agrocompat": ["AgroCompat", "Commodity compatibility matrix"],
  "/admin/recovery": ["ShadowFleet-Heal", "Proactive recovery after a disruption"],
  "/admin/backhaul": ["CrossFlow-Backhaul", "Return-load performance"],
  "/admin/monsoonpass": ["MonsoonPass", "Seasonal road access and warnings"],
  "/admin/simulator": ["Policy simulator", "Fixed-seed comparison of four policies"],
  "/admin/analytics": ["Analytics & reports", "Operational, financial and fairness reporting"],
  "/admin/notifications": ["Notifications", "Platform-wide operational feed"],
  "/admin/system": ["System & audit", "Health, roles, feature flags and audit log"],
  "/admin/settings": ["Settings", "Platform configuration and data policy"],
  "/admin/support": ["Support management", "Sender and transporter tickets"],
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const key =
    Object.keys(TITLES)
      .filter((k) => pathname === k || pathname.startsWith(k + "/"))
      .sort((a, b) => b.length - a.length)[0] || "/admin";
  const [title, subtitle] = TITLES[key];

  return (
    <AppShell nav={adminNav} role="admin" title={title} subtitle={subtitle}>
      {children}
      <footer className="mt-8 border-t border-line pt-4 text-[10.5px] text-ink-muted">
        {user?.email} · Administrator · every action is written to the audit log
      </footer>
    </AppShell>
  );
}
