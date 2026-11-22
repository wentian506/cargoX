"use client";

import { ArrowLeft, Info, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Field, SectionHeader, Spinner, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { VEHICLE_CLASSES } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

import { STATE_NAMES, districtsOf } from "@/lib/geo/india";

export default function AddVehicle() {
  const { ready } = useGuard("transporter");
  const router = useRouter();
  const { push } = useToast();
  const [f, setF] = useState({
    reg_no: "", vehicle_class: "tractor_trolley", payload_kg: 2500, volume_m3: 9,
    body_type: "open", fuel: "diesel", operating_districts: "Patna", operating_state: "Bihar", cost_per_km: 24,
  });
  const [busy, setBusy] = useState(false);
  const districts = districtsOf(f.operating_state);

  if (!ready) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/vehicles", {
        ...f,
        payload_kg: Number(f.payload_kg),
        volume_m3: Number(f.volume_m3),
        cost_per_km: Number(f.cost_per_km),
      });
      push("success", "Vehicle added", "Admin verification is pending before capacity can be published.");
      router.push("/transporter/vehicles");
    } catch (err: any) {
      push("error", "Could not add vehicle", err?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <Link href="/transporter/vehicles" className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted hover:text-ink">
          <ArrowLeft size={13} /> Back to fleet
        </Link>
        <SectionHeader title="Register a vehicle" subtitle="Details feed capacity blocks and routing feasibility" />
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Registration number" required className="sm:col-span-2">
            <input className="input uppercase" value={f.reg_no} placeholder="PB10AB1234"
              onChange={(e) => setF({ ...f, reg_no: e.target.value })} required />
          </Field>

          <Field label="Vehicle type" required>
            <select className="select" value={f.vehicle_class}
              onChange={(e) => {
                const vc = VEHICLE_CLASSES.find((v) => v.key === e.target.value);
                setF({ ...f, vehicle_class: e.target.value, payload_kg: vc?.capacity ?? f.payload_kg });
              }}>
              {VEHICLE_CLASSES.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Body type">
            <select className="select" value={f.body_type} onChange={(e) => setF({ ...f, body_type: e.target.value })}>
              {["open", "covered", "tarpaulin", "reefer", "flatbed"].map((b) => (
                <option key={b} value={b}>{b[0].toUpperCase() + b.slice(1)}</option>
              ))}
            </select>
          </Field>

          <Field label="Payload capacity (kg)" required hint="Maximum legal load">
            <input className="input" type="number" min={100} step={100} value={f.payload_kg}
              onChange={(e) => setF({ ...f, payload_kg: Number(e.target.value) })} required />
          </Field>
          <Field label="Volume (m³)" required>
            <input className="input" type="number" min={1} step={0.5} value={f.volume_m3}
              onChange={(e) => setF({ ...f, volume_m3: Number(e.target.value) })} required />
          </Field>

          <Field label="Fuel">
            <select className="select" value={f.fuel} onChange={(e) => setF({ ...f, fuel: e.target.value })}>
              {["diesel", "cng", "electric"].map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}
            </select>
          </Field>
          <Field label="Cost per km (₹)" required hint="Used for indicative freight">
            <input className="input" type="number" min={5} step={0.5} value={f.cost_per_km}
              onChange={(e) => setF({ ...f, cost_per_km: Number(e.target.value) })} required />
          </Field>

          <Field label="Operating state / UT">
            <select className="select" value={f.operating_state}
              onChange={(e) => setF({ ...f, operating_state: e.target.value, operating_districts: districtsOf(e.target.value)[0] || "" })}>
              {STATE_NAMES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </Field>
          <Field label="Operating district" hint={`${districts.length} districts in ${f.operating_state}`}>
            <select className="select" value={f.operating_districts}
              onChange={(e) => setF({ ...f, operating_districts: e.target.value })}>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>

          <div className="sm:col-span-2">
            <div className="rounded-xl border border-dashed border-line bg-soft/40 px-4 py-5 text-center">
              <Truck size={18} className="mx-auto mb-1.5 text-ink-muted" />
              <div className="text-[12px] font-semibold text-ink">Documents (RC, insurance, permit, fitness)</div>
              <div className="mt-0.5 text-[11px] text-ink-muted">
                A document reference is created automatically. File upload is wired to Supabase Storage in deployment.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <button className="btn-primary" disabled={busy}>{busy ? <Spinner /> : null} Register vehicle</button>
            <span className="text-[11px] text-ink-muted">Admin verification follows immediately.</span>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        <Card>
          <SectionHeader title="Verification gate" eyebrow="Why it matters" />
          <ul className="space-y-2 text-[12px] leading-relaxed text-ink-muted">
            <li>• Capacity cannot be published for an unverified vehicle.</li>
            <li>• Admin assigns only verified vehicles to pooled demand.</li>
            <li>• Document references are stored against the vehicle record.</li>
            <li>• A rejected verification notifies you with the reason.</li>
          </ul>
        </Card>
        <Card className="bg-soft/60">
          <div className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0 text-ink" />
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              Road access matters: a vehicle wider than the village link cannot be assigned to that pickup. The
              planner uses your class, payload and the recorded road surface and width.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
