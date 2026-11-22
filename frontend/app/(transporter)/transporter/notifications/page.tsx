"use client";

import { NotificationsPanel } from "@/components/NotificationsPanel";
import { useGuard } from "@/lib/session";

export default function TransporterNotifications() {
  const { ready } = useGuard("transporter");
  if (!ready) return null;
  return <NotificationsPanel />;
}
