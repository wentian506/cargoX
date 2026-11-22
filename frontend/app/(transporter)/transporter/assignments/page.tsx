"use client";

import { Check, ClipboardList, Info, MapPin, Truck, X } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, Modal, SectionHeader, Spinner, Tabs, useToast,
} from "@/components/ui";
import ArrivalClock from "@/components/ArrivalClock";
import { api, inr, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function AssignmentsPage() {
  const { ready } = useGuard("transporter");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/assignments/available");
  const [tab, setTab] = useState("open");
  const [reject, setReject] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const open = data?.open || [];
  const active = data?.active || [];
  const all = data?.items || [];
  const list = tab === "open" ? open : tab === "active" ? active : all;

  const respond = async (id: string, action: "accept" | "reject", why?: string) => {
    setBusy(id);
    try {
      const res = await api.post<any>(`/assignments/${id}/respond`, { action, reason: why });
      if (action === "accept" && res.arrival?.arrive_at) {
        const at = new Date(res.arrival.arrive_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        push("success", "Assignment accepted — arrival clock started",
          `Reach ${res.arrival.pickup?.label || "the pickup point"} by ${at} (${res.arrival.eta_minutes} min, ${res.arrival.drive_km} km).`);
      } else {
        push("success", action === "accept" ? "Assignment accepted" : "Assignment rejected", res.message);
      }
      setReject(null);
      setReason("");
      reload();
    } catch (e: any) {
      push("error", "Could not respond", e?.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Tabs tabs={[
            { key: "open", label: "Offers", count: open.length },
            { key: "active", label: "Accepted", count: active.length },
            { key: "all", label: "All", count: all.length },
          ]} active={tab} onChange={setTab} />
          <span className="hidden text-[11px] text-ink-muted sm:block">Only Admin-authorised work appears here</span>
        </div>
      </Card>

      {!list.length ? (
        <EmptyState title="Nothing here" body={tab === "open"
          ? "When Admin matches pooled demand to your capacity, the offer appears here."
          : "Accept an offer to move it into accepted work."} icon={<ClipboardList size={18} />} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {list.map((a: any) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">{a.reg_no || "Vehicle"}</span>
                    <Badge status={a.status === "proposed" ? "pending" : a.status === "transporter_rejected" ? "rejected" : "confirmed"}>
                      {titleCase(a.status)}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-[11.5px] capitalize text-ink-muted">
                    {titleCase(a.vehicle_class)} · {a.corridor || "pool"} · created {when(a.created_at)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="label">Revenue</div>
                  <div className="text-[17px] font-semibold text-ink">{inr(a.revenue)}</div>
                </div>
              </div>

              <ArrivalClock data={a.arrival} className="mt-3" compact />

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ["Load", kg(a.total_kg)],
                  ["Consignments", `${a.shipments?.length || 0}`],
                  ["Distance", `${Math.round(a.distance_km || 0)} km`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-soft px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-ink-muted">{k}</div>
                    <div className="text-[12.5px] font-semibold text-ink">{v}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-1.5">
                {(a.shipments || []).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-line px-2.5 py-1.5 text-[11.5px]">
                    <span className="font-medium text-ink">{s.code}</span>
                    <span className="text-ink-muted capitalize">{s.commodity} · {Math.round(s.quantity_kg)} kg</span>
                    <span className="inline-flex items-center gap-1 text-ink-muted">
                      <MapPin size={10} /> {s.pickup_village} → {s.destination_name}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <span className={`chip ${a.sender_approved ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                  {a.sender_approved ? "senders approved" : "sender approval pending"}
                </span>
                {a.status === "proposed" && (
                  <>
                    <button className="btn-emerald btn-sm" disabled={busy === a.id || !a.sender_approved}
                      onClick={() => respond(a.id, "accept")}>
                      {busy === a.id ? <Spinner size={12} /> : <Check size={13} />} Accept
                    </button>
                    <button className="btn-outline btn-sm" disabled={busy === a.id} onClick={() => setReject(a)}>
                      <X size={13} /> Reject
                    </button>
                    {!a.sender_approved && (
                      <span className="text-[10.5px] text-amber-700">
                        You can accept once all senders approve their fair share.
                      </span>
                    )}
                  </>
                )}
                {a.status === "transporter_accepted" && (
                  <span className="text-[11px] text-ink-muted">Accepted — waiting for Admin dispatch confirmation.</span>
                )}
                {a.status === "confirmed" && (
                  <a href="/transporter/trips" className="btn-primary btn-sm"><Truck size={13} /> Go to trip</a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="bg-soft/50">
        <div className="flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-ink" />
          <div className="text-[11.5px] leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">Double consent.</span> An assignment exists only after Admin
            pools demand and proposes a vehicle. You accept or reject; the sender approves their freight share; Admin
            confirms dispatch after the readiness check-in.
          </div>
        </div>
      </Card>

      <Modal open={!!reject} onClose={() => setReject(null)} title="Reject this assignment"
        description="Admin is notified and can run ShadowFleet-Heal to find a standby vehicle."
        footer={<>
          <button className="btn-outline" onClick={() => setReject(null)}>Cancel</button>
          <button className="btn-danger" disabled={!reason.trim() || busy === reject?.id}
            onClick={() => respond(reject.id, "reject", reason)}>
            {busy === reject?.id ? <Spinner /> : <X size={14} />} Reject assignment
          </button>
        </>}>
        <textarea className="input min-h-[92px]" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Vehicle under repair until tomorrow evening" />
      </Modal>
    </div>
  );
}
