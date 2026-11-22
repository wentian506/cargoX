"use client";

import {
  Check, ClipboardCheck, Info, MessageSquareWarning, Search, X,
} from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Field, Loading, Modal, SectionHeader, Spinner, Table, Tabs,
  useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase, when } from "@/lib/api";
import { useApi, useDebounced } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

const FILTERS = [
  { key: "pending_admin_review", label: "Needs review" },
  { key: "planning", label: "Planning" },
  { key: "matched", label: "Matched" },
  { key: "awaiting_sender_approval", label: "Awaiting sender" },
  { key: "confirmed", label: "Confirmed" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
  { key: "all", label: "All" },
];

export default function AdminShipments() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const [tab, setTab] = useState("pending_admin_review");
  const [q, setQ] = useState("");
  const search = useDebounced(q, 280);
  const { data, loading, error, reload } = useApi<any>(
    `/admin/shipments?status=${tab}&page_size=100${search ? `&q=${encodeURIComponent(search)}` : ""}`,
    [tab, search]);
  const all = useApi<any>("/admin/shipments?status=all&page_size=200");
  const [review, setReview] = useState<{ s: any; action: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];
  const counts = (all.data?.items || []).reduce((acc: Record<string, number>, s: any) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  const submit = async () => {
    if (!review) return;
    setBusy(true);
    try {
      const res = await api.post<any>(`/admin/shipments/${review.s.id}/review`, {
        action: review.action, note,
      });
      push("success", res.message);
      setReview(null); setNote("");
      reload(); all.reload();
    } catch (e: any) {
      push("error", "Action failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Tabs tabs={FILTERS.map((f) => ({
            key: f.key, label: f.label,
            count: f.key === "all" ? all.data?.total ?? 0 : counts[f.key] ?? 0,
          }))} active={tab} onChange={setTab} size="sm" />
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input className="input py-2 pl-8 text-[12.5px]" placeholder="Search code, sender, village"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {!items.length ? (
          <div className="px-5 pb-5">
            <EmptyState title="Nothing in this queue" body="Switch tabs to see other shipment states." icon={<ClipboardCheck size={18} />} />
          </div>
        ) : (
          <Table head={["Shipment", "Sender", "Cargo", "Route", "Ready", "Freight", "Status", "Decision"]}>
            {items.map((s: any) => (
              <tr key={s.id} className="transition-colors hover:bg-soft/60">
                <td className="td">
                  <div className="font-semibold text-ink">{s.code}</div>
                  <div className="text-[10.5px] text-ink-muted">{when(s.created_at)}</div>
                </td>
                <td className="td text-[12px]">{s.sender_name}</td>
                <td className="td">
                  <div className="capitalize">{s.commodity}</div>
                  <div className="text-[10.5px] text-ink-muted">{kg(s.quantity_kg)}</div>
                </td>
                <td className="td text-[11.5px]">
                  {s.pickup_village}
                  <div className="text-ink-muted">→ {s.destination_name}</div>
                </td>
                <td className="td text-[11px] text-ink-muted">{when(s.ready_from)}</td>
                <td className="td">{inr(s.freight_estimate)}</td>
                <td className="td"><Badge status={s.status} dot /></td>
                <td className="td">
                  {s.status === "pending_admin_review" ? (
                    <div className="flex gap-1.5">
                      <button className="btn-emerald btn-sm" onClick={() => { setReview({ s, action: "approve" }); setNote(""); }}>
                        <Check size={12} /> Approve
                      </button>
                      <button className="btn-outline btn-sm" onClick={() => { setReview({ s, action: "reject" }); setNote(""); }}>
                        <X size={12} /> Reject
                      </button>
                      <button className="btn-ghost btn-sm" onClick={() => { setReview({ s, action: "request_info" }); setNote(""); }}>
                        <MessageSquareWarning size={12} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-ink-muted">{titleCase(s.status)}</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card className="bg-soft/50">
        <div className="flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-ink" />
          <div className="text-[11.5px] leading-relaxed text-ink-muted">
            Approving moves a shipment into <strong>planning</strong>, where pooling, compatibility and capacity
            matching run. Approve only after verifying quantity, pickup and destination — every action is written to
            the audit log.
          </div>
        </div>
      </Card>

      <Modal open={!!review} onClose={() => setReview(null)}
        title={review?.action === "approve" ? `Approve ${review?.s.code}` :
          review?.action === "reject" ? `Reject ${review?.s.code}` : `Request information for ${review?.s.code}`}
        description={review?.action === "approve"
          ? "Shipment moves to planning and becomes poolable."
          : review?.action === "reject"
            ? "The sender is notified and the request is cancelled."
            : "The sender is notified with your questions."}
        footer={<>
          <button className="btn-outline" onClick={() => setReview(null)}>Cancel</button>
          <button className={review?.action === "reject" ? "btn-danger" : "btn-primary"} disabled={busy} onClick={submit}>
            {busy ? <Spinner /> : null} Confirm
          </button>
        </>}>
        {review && (
          <div className="space-y-3">
            <div className="rounded-xl bg-soft px-3 py-2.5 text-[12px]">
              <div className="flex justify-between"><span className="text-ink-muted">Sender</span><span className="font-medium">{review.s.sender_name}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Cargo</span><span className="font-medium capitalize">{review.s.commodity} · {kg(review.s.quantity_kg)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Route</span><span className="font-medium">{review.s.pickup_village} → {review.s.destination_name}</span></div>
            </div>
            <Field label="Note (sent to the sender)">
              <textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Verified quantity by phone; pickup gate is the north entrance" />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
