"use client";

import { ArrowDownToLine, Boxes, Info, Plus, ShieldAlert } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Field, Loading, Modal, SectionHeader, Spinner, Stat, Table,
  useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function CapacityExchange() {
  const { ready } = useGuard("transporter");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/capacity");
  const vehicles = useApi<any>("/vehicles");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    vehicle_id: "", vehicle_class: "tractor_trolley", payload_kg: 2500, volume_m3: 9,
    corridor: "ludhiana->fatehgarh sahib", days: 3, block_size_kg: 1200,
    min_run_km: 25, reserve_price_per_km: 22, cancellation_terms: "Free withdrawal before T-24h; 8% standby fee thereafter.",
  });

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const available = (vehicles.data?.items || []).filter((v: any) => v.verified);
  const items = data?.items || [];

  const publish = async () => {
    setBusy(true);
    try {
      const now = new Date();
      await api.post("/capacity", {
        vehicle_id: f.vehicle_id,
        vehicle_class: f.vehicle_class,
        payload_kg: Number(f.payload_kg),
        volume_m3: Number(f.volume_m3),
        corridor: f.corridor,
        window_from: now.toISOString(),
        window_to: new Date(now.getTime() + f.days * 86400000).toISOString(),
        block_size_kg: Number(f.block_size_kg),
        min_run_km: Number(f.min_run_km),
        reserve_price_per_km: Number(f.reserve_price_per_km),
        cancellation_terms: f.cancellation_terms,
      });
      push("success", "Capacity published", "Admin can now match pooled demand to this block.");
      setOpen(false);
      reload();
    } catch (e: any) {
      push("error", "Could not publish", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (id: string) => {
    try {
      await api.post(`/capacity/${id}/withdraw`);
      push("success", "Block withdrawn");
      reload();
    } catch (e: any) {
      push("error", "Could not withdraw", e?.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Published blocks" value={data?.summary?.published ?? 0} sub="visible to the planner" icon={<Boxes size={15} />} />
        <Stat label="Committed capacity" value={kg(data?.summary?.committed_kg)} sub="published + reserved" />
        <Stat label="Reserved" value={data?.summary?.reserved ?? 0} sub="locked by an active plan" />
        <Stat label="Withdrawn" value={data?.summary?.withdrawn ?? 0} sub="not available" />
      </div>

      {!available.length && (
        <Card className="border-amber-200 bg-amber-50/50">
          <div className="flex items-center gap-3">
            <ShieldAlert size={16} className="shrink-0 text-amber-700" />
            <div className="text-[12px] text-amber-900">
              You need at least one <strong>verified</strong> vehicle to publish capacity. Add a vehicle and wait for
              Admin verification.
            </div>
          </div>
        </Card>
      )}

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <SectionHeader title="Capacity blocks" subtitle="Options Exchange — publish space, not vague availability" />
          <button className="btn-primary btn-sm" disabled={!available.length} onClick={() => {
            const v = available[0];
            setF({
              ...f, vehicle_id: v.id, vehicle_class: v.vehicle_class, payload_kg: v.payload_kg,
              volume_m3: v.volume_m3, block_size_kg: Math.round(v.payload_kg * 0.6),
              reserve_price_per_km: Math.round(v.cost_per_km),
            });
            setOpen(true);
          }}>
            <Plus size={13} /> Publish capacity
          </button>
        </div>

        {!items.length ? (
          <div className="px-5 pb-5">
            <EmptyState title="No capacity published" body="Publish a block so Admin can match pooled demand to your vehicle."
              icon={<Boxes size={18} />} />
          </div>
        ) : (
          <Table head={["Vehicle", "Class", "Block", "Corridor", "Window", "Reserve", "Cancellation", "Status", ""]}>
            {items.map((b: any) => (
              <tr key={b.id} className="transition-colors hover:bg-soft/60">
                <td className="td font-semibold">{b.reg_no || "—"}</td>
                <td className="td capitalize">{b.vehicle_class?.replace("_", " ")}</td>
                <td className="td">{kg(b.block_size_kg)} <span className="text-[10.5px] text-ink-muted">of {kg(b.payload_kg)}</span></td>
                <td className="td text-[12px] capitalize">{b.corridor}</td>
                <td className="td text-[11px] text-ink-muted">
                  {when(b.window_from)}<br />→ {when(b.window_to)}
                </td>
                <td className="td">₹{b.reserve_price_per_km}/km</td>
                <td className="td max-w-[180px] truncate text-[11px] text-ink-muted" title={b.cancellation_terms}>
                  {b.cancellation_terms}
                </td>
                <td className="td"><Badge status={b.status} /></td>
                <td className="td text-right">
                  {b.status === "published" && (
                    <button className="btn-ghost btn-sm" onClick={() => withdraw(b.id)}>
                      <ArrowDownToLine size={12} /> Withdraw
                    </button>
                  )}
                  {b.status === "reserved" && <span className="text-[10.5px] text-blue-700">in active plan</span>}
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
            <span className="font-semibold text-ink">Options, not bookings.</span> A block is a commitment of space
            with a reserve price and cancellation terms. Option premium, block exercise and standby payouts are a
            fictional-credit simulation in this build — no real money moves without regulated partners.
          </div>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Publish capacity block"
        description="Only verified vehicles can publish." width="max-w-xl"
        footer={<>
          <button className="btn-outline" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={publish}>
            {busy ? <Spinner /> : <Plus size={14} />} Publish block
          </button>
        </>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vehicle" required className="sm:col-span-2">
            <select className="select" value={f.vehicle_id} onChange={(e) => {
              const v = available.find((x: any) => x.id === e.target.value);
              setF({
                ...f, vehicle_id: e.target.value, vehicle_class: v?.vehicle_class || f.vehicle_class,
                payload_kg: v?.payload_kg || f.payload_kg, volume_m3: v?.volume_m3 || f.volume_m3,
                block_size_kg: Math.round((v?.payload_kg || f.payload_kg) * 0.6),
                reserve_price_per_km: Math.round(v?.cost_per_km || f.reserve_price_per_km),
              });
            }}>
              {available.map((v: any) => (
                <option key={v.id} value={v.id}>{v.reg_no} · {titleCase(v.vehicle_class)} · {kg(v.payload_kg)}</option>
              ))}
            </select>
          </Field>
          <Field label="Block size (kg)" required hint="Space you are offering">
            <input className="input" type="number" value={f.block_size_kg}
              onChange={(e) => setF({ ...f, block_size_kg: Number(e.target.value) })} />
          </Field>
          <Field label="Reserve price (₹/km)" required>
            <input className="input" type="number" value={f.reserve_price_per_km}
              onChange={(e) => setF({ ...f, reserve_price_per_km: Number(e.target.value) })} />
          </Field>
          <Field label="Corridor" required className="sm:col-span-2">
            <select className="select" value={f.corridor} onChange={(e) => setF({ ...f, corridor: e.target.value })}>
              {["ludhiana->fatehgarh sahib", "ludhiana->ludhiana", "ludhiana->patiala", "fatehgarh sahib->ludhiana"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Available for (days)">
            <select className="select" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })}>
              {[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d} day(s)</option>)}
            </select>
          </Field>
          <Field label="Minimum run (km)">
            <input className="input" type="number" value={f.min_run_km}
              onChange={(e) => setF({ ...f, min_run_km: Number(e.target.value) })} />
          </Field>
          <Field label="Cancellation terms" className="sm:col-span-2">
            <textarea className="input min-h-[62px]" value={f.cancellation_terms}
              onChange={(e) => setF({ ...f, cancellation_terms: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
