"use client";

import { NotificationsPanel } from "@/components/NotificationsPanel";
import { useGuard } from "@/lib/session";

export default function SenderNotifications() {
  const { ready } = useGuard("sender");
  if (!ready) return null;
  return <NotificationsPanel />;
}
