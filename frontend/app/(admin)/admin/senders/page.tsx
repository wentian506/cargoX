"use client";

import { Search, ShieldCheck, UserX, Users } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, Modal, SectionHeader, Spinner, Stat, Table, useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase, when } from "@/lib/api";
import { useApi, useDebounced } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function SendersAdmin() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const [q, setQ] = useState("");
  const search = useDebounced(q, 280);
  const { data, loading, error, reload } = useApi<any>(`/admin/senders${search ? `?q=${encodeURIComponent(search)}` : ""}`, [search]);
  const [target, setTarget] = useState<{ user: any; action: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];
  const totalVolume = items.reduce((a: number, s: any) => a + (s.volume_kg || 0), 0);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.post(`/admin/users/${target.user.id}/status`, { action: target.action, reason });
      push("success", `Account ${target.action}d`);
      setTarget(null); setReason("");
      reload();
    } catch (e: any) {
      push("error", "Action failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Stat label="Registered senders" value={items.length} sub="all accounts" icon={<Users size={15} />} />
        <Stat label="Total volume" value={kg(totalVolume)} sub="across all consignments" />
        <Stat label="Active accounts" value={items.filter((s: any) => s.status === "active").length}
          sub={`${items.filter((s: any) => s.status === "suspended").length} suspended`} tone="good" />
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <SectionHeader title="Sender accounts" subtitle="Volume, spend and account status" />
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input className="input py-2 pl-8 text-[12.5px]" placeholder="Search name or email"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {!items.length ? (
          <div className="px-5 pb-5"><EmptyState title="No senders" body="No accounts match this search." icon={<Users size={18} />} /></div>
        ) : (
          <Table head={["Sender", "Contact", "Location", "Kind", "Shipments", "Volume", "Delivered spend", "Status", "Actions"]}>
            {items.map((s: any) => (
              <tr key={s.id} className="transition-colors hover:bg-soft/60">
                <td className="td">
                  <div className="font-semibold text-ink">{s.full_name}</div>
                  <div className="text-[10.5px] text-ink-muted">joined {when(s.created_at)}</div>
                </td>
                <td className="td text-[11.5px]">
                  {s.email}
                  <div className="text-ink-muted">{s.mobile}</div>
                </td>
                <td className="td text-[11.5px]">{s.district}, {s.state}
                  <div className="text-ink-muted">{s.village || "—"}</div></td>
                <td className="td text-[11.5px] capitalize">{titleCase(s.account_kind)}</td>
                <td className="td">{s.shipments}</td>
                <td className="td">{kg(s.volume_kg)}</td>
                <td className="td">{inr(s.spend)}</td>
                <td className="td"><Badge status={s.status} /></td>
                <td className="td">
                  <div className="flex gap-1.5">
                    {s.status === "active" ? (
                      <button className="btn-ghost btn-sm" onClick={() => setTarget({ user: s, action: "suspend" })}>
                        <UserX size={12} /> Suspend
                      </button>
                    ) : (
                      <button className="btn-emerald btn-sm" onClick={() => setTarget({ user: s, action: "reactivate" })}>
                        <ShieldCheck size={12} /> Reactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!target} onClose={() => setTarget(null)}
        title={`${target?.action === "suspend" ? "Suspend" : "Reactivate"} ${target?.user?.full_name}`}
        description="The account owner is notified. Suspended accounts cannot sign in."
        footer={<>
          <button className="btn-outline" onClick={() => setTarget(null)}>Cancel</button>
          <button className={target?.action === "suspend" ? "btn-danger" : "btn-primary"} disabled={busy} onClick={submit}>
            {busy ? <Spinner /> : null} Confirm
          </button>
        </>}>
        <textarea className="input min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (recorded in the audit log)" />
      </Modal>
    </div>
  );
}
