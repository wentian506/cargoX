"use client";

import {
  ArrowLeft, CheckCircle2, Clock, Coins, FileText, MapPin, Package, Scale, ShieldCheck, Truck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Badge, Card, ErrorNote, Loading, Modal, Progress, SectionHeader, Spinner, SyntheticNote, useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function ShipmentDetail() {
  const { ready } = useGuard("sender");
  const params = useParams<{ id: string }>();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>(`/shipments/${params.id}`);
  const tracking = useApi<any>(`/shipments/${params.id}/tracking`);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={4} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const s = data;
  const alloc = s.allocation;
  const needsApproval = s.status === "awaiting_sender_approval" && alloc?.approval === "pending";

  const respond = async (accept: boolean) => {
    setBusy(accept ? "approve" : "reject");
    try {
      await api.post(`/shipments/${s.id}/approve-allocation`, { accept, reason: accept ? undefined : reason });
      push("success", accept ? "Allocation approved" : "Allocation rejected", accept
        ? "Admin can now confirm the assignment."
        : "Admin will re-plan this load.");
      setRejectOpen(false);
      reload();
      tracking.reload();
    } catch (e: any) {
      push("error", "Could not submit", e?.message);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      await api.post(`/shipments/${s.id}/cancel`, { reason: "Cancelled by sender" });
      push("success", "Shipment cancelled");
      setCancelOpen(false);
      reload();
    } catch (e: any) {
      push("error", "Could not cancel", e?.message);
    } finally {
      setBusy(null);
    }
  };

  const checkin = async (state: "ready" | "delayed") => {
    setBusy(state);
    try {
      await api.post(`/shipments/${s.id}/readiness`, { state, note: "Sender check-in" });
      push("success", `Readiness recorded: ${state}`);
      reload();
      tracking.reload();
    } catch (e: any) {
      push("error", "Could not record", e?.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/sender/shipments" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft size={13} /> All shipments
      </Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{s.code}</h2>
              <Badge status={s.status} dot />
            </div>
            <p className="mt-1 text-[12.5px] text-ink-muted">
              {titleCase(s.commodity)} · {kg(s.quantity_kg)} · {s.quantity_quintal} quintals · created {when(s.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.trip && (
              <Link href="/sender/tracking" className="btn-outline btn-sm"><MapPin size={13} /> Track</Link>
            )}
            {["draft", "pending_admin_review", "planning"].includes(s.status) && (
              <button className="btn-danger btn-sm" onClick={() => setCancelOpen(true)}>Cancel request</button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Pickup", s.pickup_village, s.pickup_district],
            ["Destination", s.destination_name || "—", `queue ~${45} min`],
            ["Ready window", when(s.ready_from), `deadline ${when(s.deadline)}`],
            ["Freight", inr(s.freight_estimate), s.freight_approved ? "approved" : "not approved"],
          ].map(([k, v, sub]) => (
            <div key={k} className="rounded-xl border border-line bg-soft/40 px-3.5 py-3">
              <div className="label">{k}</div>
              <div className="mt-1 text-[13.5px] font-semibold text-ink">{v}</div>
              {sub && <div className="text-[10.5px] text-ink-muted">{sub}</div>}
            </div>
          ))}
        </div>
      </Card>

      {needsApproval && (
        <Card className="border-amber-200 bg-amber-50/40">
          <SectionHeader title="Your fair-share allocation needs approval"
            subtitle="Nothing is dispatched until you decide. Rejecting sends it back to Admin for re-planning." />
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Solo cost", inr(alloc.standalone_cost), "if you travelled alone"],
              ["Coalition cost", inr(alloc.allocated_share), "your Shapley share"],
              ["Your saving", inr(alloc.saving), `${Math.round((alloc.saving / alloc.standalone_cost) * 100)}% lower`],
            ].map(([k, v, sub]) => (
              <div key={k} className="rounded-xl border border-line bg-white px-4 py-3">
                <div className="label">{k}</div>
                <div className="mt-1 text-[19px] font-semibold text-ink">{v}</div>
                <div className="text-[10.5px] text-ink-muted">{sub}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn-emerald" disabled={!!busy} onClick={() => respond(true)}>
              {busy === "approve" ? <Spinner /> : <CheckCircle2 size={14} />} Approve {inr(alloc.allocated_share)}
            </button>
            <button className="btn-outline" disabled={!!busy} onClick={() => setRejectOpen(true)}>
              <XCircle size={14} /> Reject
            </button>
            <span className="text-[11px] text-ink-muted">
              Participation check: {alloc.participation_ok ? "passed — your share never exceeds solo cost" : "failed"}
            </span>
          </div>
        </Card>
      )}

      {alloc && !needsApproval && (
        <Card>
          <SectionHeader title="Freight & fair share"
            right={<Link href="/sender/costs" className="btn-outline btn-sm"><Scale size={13} /> Full breakdown</Link>} />
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Method", alloc.method === "shapley_exact" ? "Shapley (exact)" : "Shapley (sampled)"],
              ["Solo cost", inr(alloc.standalone_cost)],
              ["Your share", inr(alloc.allocated_share)],
              ["Status", alloc.approval],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line px-3.5 py-3">
                <div className="label">{k}</div>
                <div className="mt-1 text-[13.5px] font-semibold capitalize text-ink">{v}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <SectionHeader title="Progress" subtitle="Operational checkpoints, not live GPS" />
          <div className="space-y-0">
            {(tracking.data?.steps || []).map((st: any, i: number, arr: any[]) => (
              <div key={st.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`grid h-6 w-6 place-items-center rounded-full border-2 ${
                    st.done ? "border-emerald bg-emerald text-white" : "border-line bg-white text-ink-muted"}`}>
                    {st.done ? <CheckCircle2 size={12} /> : <Clock size={11} />}
                  </span>
                  {i < arr.length - 1 && (
                    <span className={`my-1 w-0.5 flex-1 rounded ${st.done ? "bg-emerald/40" : "bg-line"}`} style={{ minHeight: 16 }} />
                  )}
                </div>
                <div className="pb-3">
                  <div className={`text-[12.5px] font-semibold ${st.current ? "text-ink" : st.done ? "text-ink" : "text-ink-muted"}`}>
                    {st.label}
                  </div>
                  {st.current && <div className="text-[10.5px] text-emerald-600">current stage</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader title="Assignment" />
            {s.transporter ? (
              <div className="space-y-2.5">
                {[
                  ["Transporter", s.transporter.name],
                  ["Vehicle", s.transporter.vehicle],
                  ["Class", titleCase(s.transporter.vehicle_class)],
                  ["Status", titleCase(s.transporter.assignment_status)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[12.5px]">
                    <span className="text-ink-muted">{k}</span>
                    <span className="font-medium text-ink">{v}</span>
                  </div>
                ))}
                {s.trip && (
                  <div className="mt-2 rounded-lg bg-soft px-3 py-2 text-[11.5px] text-ink-muted">
                    Trip {s.trip.code} · {titleCase(s.trip.status)}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line bg-soft/40 px-4 py-6 text-center text-[12px] text-ink-muted">
                <Truck size={18} className="mx-auto mb-2 text-ink-muted/70" />
                No vehicle assigned yet — Admin coordinates assignment after pooling and fair-share approval.
              </div>
            )}
          </Card>

          {s.status === "confirmed" && (
            <Card>
              <SectionHeader title="ReadySync check-in" subtitle="Confirm readiness so your wave is not delayed" />
              <div className="flex gap-2">
                <button className="btn-emerald btn-sm flex-1" disabled={!!busy} onClick={() => checkin("ready")}>
                  {busy === "ready" ? <Spinner /> : <CheckCircle2 size={13} />} Packed &amp; ready
                </button>
                <button className="btn-outline btn-sm flex-1" disabled={!!busy} onClick={() => checkin("delayed")}>
                  {busy === "delayed" ? <Spinner /> : <Clock size={13} />} Delayed
                </button>
              </div>
            </Card>
          )}

          <Card>
            <SectionHeader title="Timeline" />
            <div className="space-y-2.5">
              {(s.timeline || []).slice(0, 8).map((e: any) => (
                <div key={e.id} className="flex gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" />
                  <div>
                    <div className="text-[12px] font-medium text-ink">{titleCase(e.event_type)}</div>
                    <div className="text-[10.5px] text-ink-muted">{when(e.created_at)}</div>
                  </div>
                </div>
              ))}
              {!(s.timeline || []).length && <div className="text-[12px] text-ink-muted">No events yet.</div>}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="flex items-start gap-2.5">
            <Package size={15} className="mt-0.5 shrink-0 text-ink" />
            <div>
              <div className="text-[12.5px] font-semibold text-ink">Packaging & handling</div>
              <div className="mt-1 text-[11.5px] text-ink-muted">
                {titleCase(s.packaging)} · {titleCase(s.handling)} · {titleCase(s.temperature)}
              </div>
              {s.special_instructions && (
                <div className="mt-1.5 rounded-lg bg-soft px-2.5 py-1.5 text-[11px] italic text-ink-muted">
                  “{s.special_instructions}”
                </div>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-ink" />
            <div>
              <div className="text-[12.5px] font-semibold text-ink">Data & consent</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                Your contact details are never included in aggregate forecasts. Destination changes require your
                explicit approval and Admin coordination.
              </div>
            </div>
          </div>
        </Card>
      </div>

      <SyntheticNote />

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject this allocation"
        description="Admin will re-plan the load. Give a reason so it can be routed correctly."
        footer={<>
          <button className="btn-outline" onClick={() => setRejectOpen(false)}>Cancel</button>
          <button className="btn-danger" disabled={!reason.trim() || !!busy} onClick={() => respond(false)}>
            {busy === "reject" ? <Spinner /> : <XCircle size={14} />} Submit rejection
          </button>
        </>}>
        <textarea className="input min-h-[90px]" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. The share is higher than the quote I received, or the pickup timing does not work" />
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this shipment?"
        description="This is only possible before execution starts."
        footer={<>
          <button className="btn-outline" onClick={() => setCancelOpen(false)}>Keep it</button>
          <button className="btn-danger" disabled={busy === "cancel"} onClick={cancel}>
            {busy === "cancel" ? <Spinner /> : null} Cancel shipment
          </button>
        </>}>
        <p className="text-[13px] text-ink-muted">
          Admin and any assigned transporter will be notified. A cancelled request stays in your history as a
          cancelled record.
        </p>
      </Modal>
    </div>
  );
}
