"use client";

import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";
import { transporterNav } from "@/lib/nav";
import { useSession } from "@/lib/session";

const TITLES: Record<string, [string, string]> = {
  "/transporter": ["Transporter overview", "Fleet, assignments and earnings"],
  "/transporter/vehicles": ["My vehicles", "Registered fleet and verification status"],
  "/transporter/vehicles/add": ["Add vehicle", "Admin verifies documents before assignments unlock"],
  "/transporter/capacity": ["Capacity exchange", "Publish blocks with reserve price and terms"],
  "/transporter/assignments": ["Available assignments", "Only work authorised by Admin for you"],
  "/transporter/trips": ["Trip management", "Execute pickups, transit and delivery"],
  "/transporter/backhaul": ["Return loads", "CrossFlow-Backhaul opportunities"],
  "/transporter/earnings": ["Earnings & reports", "Revenue, trips and vehicle economics"],
  "/transporter/performance": ["Performance", "Utilisation, empty-km and reliability"],
  "/transporter/notifications": ["Notifications", "Assignment and trip updates"],
  "/transporter/settings": ["Profile & verification", "Account, documents and preferences"],
};

export default function TransporterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const key =
    Object.keys(TITLES)
      .filter((k) => pathname === k || pathname.startsWith(k + "/"))
      .sort((a, b) => b.length - a.length)[0] || "/transporter";
  const [title, subtitle] = TITLES[key];

  return (
    <AppShell nav={transporterNav} role="transporter" title={title} subtitle={subtitle}>
      {children}
      <footer className="mt-8 border-t border-line pt-4 text-[10.5px] text-ink-muted">
        Signed in as {user?.email} · Transporter role · only your own vehicles and authorised assignments are visible
      </footer>
    </AppShell>
  );
}
