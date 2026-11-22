"use client";

import { CheckCircle2, ClipboardCheck, Info, Truck, XCircle } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, Modal, SectionHeader, Spinner, SyntheticNote, Table, useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function AssignmentsAdmin() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/admin/assignments");
  const [busy, setBusy] = useState<string | null>(null);
  const [cancel, setCancel] = useState<any>(null);
  const [reason, setReason] = useState("");

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];

  const confirm = async (id: string) => {
    setBusy(id);
    try {
      await api.post(`/admin/assignments/${id}/confirm`);
      push("success", "Assignment confirmed", "Shipments moved to confirmed; ReadySync check-ins are now due.");
      reload();
    } catch (e: any) {
      push("error", "Cannot confirm yet", e?.message);
    } finally {
      setBusy(null);
    }
  };

  const cancelAssignment = async () => {
    if (!cancel) return;
    setBusy(cancel.id);
    try {
      const res = await api.post<any>(`/admin/assignments/${cancel.id}/cancel`, { reason, event_type: "cancellation" });
      push("warning", "Assignment cancelled", res.next);
      setCancel(null); setReason("");
      reload();
    } catch (e: any) {
      push("error", "Could not cancel", e?.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card pad={false}>
        <div className="px-5 py-4">
          <SectionHeader title="Assignment register" subtitle="Dispatch requires sender approval AND transporter acceptance" />
        </div>
        {!items.length ? (
          <div className="px-5 pb-5"><EmptyState title="No assignments" body="Create one from the Plan & route screen after computing fair shares."
            icon={<ClipboardCheck size={18} />} /></div>
        ) : (
          <Table head={["Vehicle", "Transporter", "Corridor", "Load", "Revenue", "Sender approvals", "Status", "Actions"]}>
            {items.map((a: any) => (
              <tr key={a.id} className="transition-colors hover:bg-soft/60">
                <td className="td">
                  <div className="font-semibold text-ink">{a.reg_no || "—"}</div>
                  <div className="text-[10.5px] capitalize text-ink-muted">{titleCase(a.vehicle_class)}</div>
                </td>
                <td className="td text-[12px]">{a.transporter_name}</td>
                <td className="td text-[11.5px] capitalize">{a.corridor || "adhoc"}</td>
                <td className="td">{kg(a.total_kg)}</td>
                <td className="td font-semibold">{inr(a.revenue)}</td>
                <td className="td">
                  <span className="chip border-line bg-soft text-ink-muted">
                    {a.sender_approvals}/{a.shipments}
                  </span>
                </td>
                <td className="td">
                  <Badge status={a.status === "confirmed" ? "confirmed" : a.status === "transporter_rejected" ? "rejected" : "pending"}>
                    {titleCase(a.status)}
                  </Badge>
                </td>
                <td className="td">
                  <div className="flex gap-1.5">
                    {a.status !== "confirmed" && a.status !== "cancelled" && (
                      <button className="btn-emerald btn-sm" disabled={busy === a.id} onClick={() => confirm(a.id)}>
                        {busy === a.id ? <Spinner size={12} /> : <CheckCircle2 size={12} />} Confirm
                      </button>
                    )}
                    {a.status !== "cancelled" && (
                      <button className="btn-ghost btn-sm" onClick={() => setCancel(a)}>
                        <XCircle size={12} /> Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["1 · Sender consent", "Every sender in the pool approves their Shapley freight share."],
          ["2 · Transporter consent", "The assigned transporter accepts the route, load and revenue."],
          ["3 · Admin confirmation", "After the readiness check-in, Admin confirms and dispatch begins."],
        ].map(([t, b]) => (
          <Card key={t}>
            <div className="text-[12px] font-semibold text-ink">{t}</div>
            <div className="mt-1 text-[11.5px] leading-snug text-ink-muted">{b}</div>
          </Card>
        ))}
      </div>

      <Card className="bg-soft/50">
        <div className="flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-ink" />
          <p className="text-[11.5px] leading-relaxed text-ink-muted">
            Cancelling an assignment releases the vehicle, returns its capacity block to the exchange and opens a
            disruption record so ShadowFleet-Heal can propose recovery options.
          </p>
        </div>
      </Card>
      <SyntheticNote />

      <Modal open={!!cancel} onClose={() => setCancel(null)} title="Cancel assignment"
        description="The vehicle is released and a disruption record is created."
        footer={<>
          <button className="btn-outline" onClick={() => setCancel(null)}>Keep assignment</button>
          <button className="btn-danger" disabled={!reason.trim() || busy === cancel?.id} onClick={cancelAssignment}>
            {busy === cancel?.id ? <Spinner /> : null} Cancel &amp; open recovery
          </button>
        </>}>
        <textarea className="input min-h-[88px]" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Vehicle reported a breakdown; transporter withdrew" />
      </Modal>
    </div>
  );
}
