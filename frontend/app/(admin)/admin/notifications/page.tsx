"use client";

import { NotificationsPanel } from "@/components/NotificationsPanel";
import { useGuard } from "@/lib/session";

export default function AdminNotifications() {
  const { ready } = useGuard("admin");
  if (!ready) return null;
  return <NotificationsPanel />;
}
