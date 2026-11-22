"use client";

import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";
import { senderNav } from "@/lib/nav";
import { useSession } from "@/lib/session";

const TITLES: Record<string, [string, string]> = {
  "/sender": ["Sender overview", "Your consignments, freight and fair share"],
  "/sender/create": ["Create shipment", "Describe the load — Admin reviews and coordinates the rest"],
  "/sender/shipments": ["My shipments", "Every consignment in one register"],
  "/sender/capacity": ["Find transportation", "Capacity published by verified transporters"],
  "/sender/tracking": ["Shipment tracking", "Operational checkpoints, never fabricated GPS"],
  "/sender/costs": ["Freight & fair share", "Solo cost vs pooled cost, explained"],
  "/sender/destinations": ["Destination advisor", "Compare net realisation before you commit"],
  "/sender/analytics": ["Analytics", "Your freight, savings and delivery history"],
  "/sender/voice": ["VoiceBoli", "Speak a shipment in Punjabi, Hindi or English"],
  "/sender/notifications": ["Notifications", "All operational updates"],
  "/sender/settings": ["Profile & settings", "Account details and preferences"],
  "/sender/help": ["Help centre", "How CARGOX coordination works"],
};

export default function SenderLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const key =
    Object.keys(TITLES)
      .filter((k) => pathname === k || pathname.startsWith(k + "/"))
      .sort((a, b) => b.length - a.length)[0] || "/sender";
  const [title, subtitle] = TITLES[key];

  return (
    <AppShell nav={senderNav} role="sender" title={title} subtitle={subtitle}>
      {children}
      <footer className="mt-8 border-t border-line pt-4 text-[10.5px] text-ink-muted">
        Signed in as {user?.email} · Sender role · data isolation enforced server-side
      </footer>
    </AppShell>
  );
}
