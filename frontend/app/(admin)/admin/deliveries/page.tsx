"use client";

import { CheckCircle2, FileCheck2, Info, PackageCheck, Upload } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Field, Loading, Modal, SectionHeader, Spinner, SyntheticNote, Table,
  useToast,
} from "@/components/ui";
import { api, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function DeliveriesPage() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/admin/deliveries");
  const [target, setTarget] = useState<any>(null);
  const [f, setF] = useState({
    delivered_qty_kg: 0, pod_ref: "", external_ack_ref: "", shortage_note: "", damage_note: "", verify: true,
  });
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const awaiting = data?.awaiting_confirmation || [];
  const records = data?.items || [];

  const open = (s: any) => {
    setTarget(s);
    setF({
      delivered_qty_kg: s.quantity_kg, pod_ref: `storage://pod/${s.code}.jpg`,
      external_ack_ref: "", shortage_note: "", damage_note: "", verify: true,
    });
  };

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const res = await api.post<any>("/admin/deliveries", { shipment_id: target.id, ...f });
      push("success", res.status === "admin_verified" ? "Delivery verified & shipment closed" : "Delivery recorded");
      setTarget(null);
      reload();
    } catch (e: any) {
      push("error", "Could not record", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader title="Awaiting verification"
          subtitle="The transporter records physical delivery and POD; Admin reconciles the external destination acknowledgement and closes the record." />
        {!awaiting.length ? (
          <EmptyState title="Nothing to verify" body="Deliveries reported by transporters appear here." icon={<PackageCheck size={18} />} />
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {awaiting.map((s: any) => (
              <div key={s.id} className="rounded-xl border border-line px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-ink">{s.code}</span>
                  <Badge status={s.status}>{s.status.replace(/_/g, " ")}</Badge>
                </div>
                <div className="mt-0.5 text-[11px] capitalize text-ink-muted">
                  {s.commodity} · {kg(s.quantity_kg)} → {s.destination_name}
                </div>
                <button className="btn-primary btn-sm mt-2.5 w-full" onClick={() => open(s)}>
                  <FileCheck2 size={12} /> Verify &amp; close
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card pad={false}>
        <div className="px-5 py-4"><SectionHeader title="Delivery records" subtitle="POD references and external acknowledgements" /></div>
        {!records.length ? (
          <div className="px-5 pb-5"><EmptyState title="No records" body="Verified deliveries appear here." icon={<FileCheck2 size={18} />} /></div>
        ) : (
          <Table head={["Shipment", "Commodity", "Delivered", "POD", "External ack", "Shortage / damage", "Status", "Recorded"]}>
            {records.map((r: any) => (
              <tr key={r.id} className="transition-colors hover:bg-soft/60">
                <td className="td font-semibold text-ink">{r.code}</td>
                <td className="td capitalize">{r.commodity}</td>
                <td className="td">{kg(r.delivered_qty_kg)}</td>
                <td className="td text-[10.5px] text-ink-muted">{r.pod_ref ? "attached" : "—"}</td>
                <td className="td text-[10.5px] text-ink-muted">{r.external_ack_ref || "—"}</td>
                <td className="td text-[10.5px] text-ink-muted">
                  {[r.shortage_note, r.damage_note].filter(Boolean).join(" / ") || "none"}
                </td>
                <td className="td"><Badge status={r.status === "admin_verified" ? "verified" : "pending"}>{r.status.replace(/_/g, " ")}</Badge></td>
                <td className="td text-[10.5px] text-ink-muted">{when(r.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card className="bg-soft/50">
        <div className="flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-ink" />
          <p className="text-[11.5px] leading-relaxed text-ink-muted">
            CARGOX has no Receiver account. External buyers, mandis and warehouses are shipment destinations — their
            acknowledgement is captured by Admin as a reference on the delivery record.
          </p>
        </div>
      </Card>
      <SyntheticNote />

      <Modal open={!!target} onClose={() => setTarget(null)} title={`Verify delivery · ${target?.code}`}
        description="Records the POD, external acknowledgement and final quantity." width="max-w-xl"
        footer={<>
          <button className="btn-outline" onClick={() => setTarget(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={submit}>
            {busy ? <Spinner /> : <CheckCircle2 size={14} />} {f.verify ? "Verify & close" : "Save record"}
          </button>
        </>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Delivered quantity (kg)" hint={`Booked: ${kg(target?.quantity_kg)}`}>
            <input className="input" type="number" value={f.delivered_qty_kg}
              onChange={(e) => setF({ ...f, delivered_qty_kg: Number(e.target.value) })} />
          </Field>
          <Field label="POD reference">
            <input className="input" value={f.pod_ref} onChange={(e) => setF({ ...f, pod_ref: e.target.value })} />
          </Field>
          <Field label="External acknowledgement" hint="Mandi / buyer acknowledgement number" className="sm:col-span-2">
            <input className="input" value={f.external_ack_ref}
              onChange={(e) => setF({ ...f, external_ack_ref: e.target.value })} placeholder="e.g. MANDI-ACK-9911" />
          </Field>
          <Field label="Shortage note">
            <input className="input" value={f.shortage_note}
              onChange={(e) => setF({ ...f, shortage_note: e.target.value })} placeholder="e.g. 40 kg short" />
          </Field>
          <Field label="Damage note">
            <input className="input" value={f.damage_note}
              onChange={(e) => setF({ ...f, damage_note: e.target.value })} placeholder="e.g. 2 bags torn" />
          </Field>
          <label className="flex items-center gap-2 text-[12px] sm:col-span-2">
            <input type="checkbox" checked={f.verify} onChange={(e) => setF({ ...f, verify: e.target.checked })}
              className="h-4 w-4 rounded border-line text-emerald focus:ring-emerald/30" />
            Verify and close the shipment now
          </label>
        </div>
      </Modal>
    </div>
  );
}
