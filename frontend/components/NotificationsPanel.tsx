"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorNote, Loading, Tabs, useToast } from "@/components/ui";
import { api, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";

export function NotificationsPanel() {
  const { push } = useToast();
  const [tab, setTab] = useState("all");
  const { data, loading, error, reload } = useApi<any>(`/notifications${tab === "unread" ? "?unread_only=true" : ""}`, [tab]);

  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Tabs tabs={[{ key: "all", label: "All", count: data?.items?.length ?? 0 },
          { key: "unread", label: "Unread", count: data?.unread ?? 0 }]} active={tab} onChange={setTab} />
        <button className="btn-outline btn-sm" onClick={async () => {
          await api.post("/notifications/read-all"); reload(); push("success", "All marked read");
        }}>
          <CheckCheck size={13} /> Mark all read
        </button>
      </div>
      {!items.length ? (
        <div className="p-5"><EmptyState title="No notifications" body="Operational updates appear here." icon={<Bell size={18} />} /></div>
      ) : (
        <div>
          {items.map((n: any) => (
            <div key={n.id} className={`flex items-start gap-3 border-t border-line px-5 py-3.5 ${!n.read_at ? "bg-emerald/[0.03]" : ""}`}>
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                n.kind === "warning" ? "bg-amber-500" : n.kind === "success" ? "bg-emerald" : n.kind === "action" ? "bg-blue-500" : "bg-ink-muted/40"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">{n.title}</span>
                  <Badge status={n.kind === "warning" ? "pending" : n.kind} >{n.kind}</Badge>
                </div>
                {n.body && <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{n.body}</p>}
                <div className="mt-1 flex items-center gap-3 text-[10.5px] text-ink-muted/80">
                  <span>{when(n.created_at)}</span>
                  {n.link && <Link href={n.link} className="font-semibold text-emerald-600 hover:underline">Open record →</Link>}
                </div>
              </div>
              {!n.read_at && (
                <button className="shrink-0 text-[10.5px] font-semibold text-ink-muted hover:text-ink"
                  onClick={async () => { await api.post(`/notifications/${n.id}/read`); reload(); }}>
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
