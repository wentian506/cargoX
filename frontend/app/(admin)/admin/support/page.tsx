"use client";

import { CheckCircle2, LifeBuoy, MessageSquare } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, Modal, SectionHeader, Spinner, Stat, Table, useToast,
} from "@/components/ui";
import { api, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function SupportAdmin() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/support/tickets");
  const [ticket, setTicket] = useState<any>(null);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];

  const resolve = async () => {
    if (!ticket) return;
    setBusy(true);
    try {
      await api.post(`/support/tickets/${ticket.id}/resolve`, { status: "resolved", resolution });
      push("success", "Ticket resolved", "The requester has been notified.");
      setTicket(null); setResolution("");
      reload();
    } catch (e: any) {
      push("error", "Could not resolve", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Stat label="Open tickets" value={items.filter((t: any) => t.status === "open").length}
          tone={items.some((t: any) => t.status === "open") ? "warn" : "default"} icon={<LifeBuoy size={15} />} />
        <Stat label="Resolved" value={items.filter((t: any) => t.status === "resolved").length} tone="good" />
        <Stat label="Total" value={items.length} sub="all support requests" />
      </div>

      <Card pad={false}>
        <div className="px-5 py-4">
          <SectionHeader title="Support queue" subtitle="Sender and transporter tickets requiring coordination" />
        </div>
        {!items.length ? (
          <div className="px-5 pb-5"><EmptyState title="No tickets" body="Support requests appear here."
            icon={<LifeBuoy size={18} />} /></div>
        ) : (
          <Table head={["Subject", "Requester", "Role", "Status", "Raised", "Actions"]}>
            {items.map((t: any) => (
              <tr key={t.id} className="transition-colors hover:bg-soft/60">
                <td className="td">
                  <div className="font-medium text-ink">{t.subject}</div>
                  <div className="max-w-[320px] truncate text-[10.5px] text-ink-muted">{t.body}</div>
                </td>
                <td className="td text-[11.5px]">{t.full_name || t.profile_id}
                  <div className="text-ink-muted">{t.email || ""}</div></td>
                <td className="td"><Badge status={t.role === "transporter" ? "verified" : "pending"}>{t.role}</Badge></td>
                <td className="td"><Badge status={t.status === "resolved" ? "approved" : "pending"}>{t.status}</Badge></td>
                <td className="td text-[10.5px] text-ink-muted">{when(t.created_at)}</td>
                <td className="td">
                  {t.status !== "resolved" && (
                    <button className="btn-emerald btn-sm" onClick={() => { setTicket(t); setResolution(""); }}>
                      <CheckCircle2 size={12} /> Resolve
                    </button>
                  )}
                  {t.resolution && <span className="text-[10.5px] text-emerald-600">{t.resolution}</span>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!ticket} onClose={() => setTicket(null)} title={`Resolve · ${ticket?.subject}`}
        description="Your resolution is sent to the requester."
        footer={<>
          <button className="btn-outline" onClick={() => setTicket(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={resolve}>
            {busy ? <Spinner /> : <MessageSquare size={14} />} Resolve ticket
          </button>
        </>}>
        <div className="mb-3 rounded-xl bg-soft px-3 py-2 text-[12px] text-ink-muted">{ticket?.body}</div>
        <textarea className="input min-h-[90px]" value={resolution} onChange={(e) => setResolution(e.target.value)}
          placeholder="What did you do to resolve it?" />
      </Modal>
    </div>
  );
}
