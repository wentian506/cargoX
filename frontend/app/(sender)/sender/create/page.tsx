"use client";

import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Compass, MapPin, Mic, Package, Save, Send,
  Sparkles, Truck, Wheat,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Card, Field, Modal, SectionHeader, Spinner, SyntheticNote, useToast } from "@/components/ui";
import CargoLines, { type CargoLine, lineKg } from "@/components/CargoItems";
import PlacePicker, { type PlaceValue } from "@/components/PlacePicker";
import { api, inr, kg, titleCase } from "@/lib/api";
import { COMMODITIES } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

type Draft = {
  commodity: string;
  quantity: number;
  unit: string;
  pickup_village: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_id: string;
  destination_name: string;
  dest_lat: number | null;
  dest_lng: number | null;
  ready_offset_days: number;
  ready_hour: number;
  deadline_hours: number;
  packaging: string;
  handling: string;
  temperature: string;
  special_instructions: string;
  requirements: string;
  destination_options: any[];
  items: CargoLine[];
  pickup_state: string | null;
  pickup_district_geo: string | null;
  dest_state: string | null;
  dest_district: string | null;
};

const EMPTY: Draft = {
  commodity: "wheat", quantity: 40, unit: "quintal", pickup_village: "", pickup_lat: null, pickup_lng: null,
  destination_id: "", destination_name: "", dest_lat: null, dest_lng: null,
  ready_offset_days: 1, ready_hour: 7, deadline_hours: 14,
  packaging: "jute_bags", handling: "dry_cover", temperature: "ambient",
  special_instructions: "", destination_options: [],
  requirements: "", items: [], pickup_state: "Bihar", pickup_district_geo: "Patna",
  dest_state: null, dest_district: null,
};

const PACKAGING = ["jute_bags", "plastic_crates", "mesh_bags", "bales", "loose_bulk"];
const HANDLING = ["dry_cover", "ventilated", "no_stack", "fragile", "temperature_controlled"];

export default function CreateShipment() {
  const { ready } = useGuard("sender");
  const router = useRouter();
  const { push } = useToast();
  const [step, setStep] = useState(1);
  const [d, setD] = useState<Draft>(EMPTY);
  const [villages, setVillages] = useState<any[]>([]);
  const [mandis, setMandis] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceResult, setVoiceResult] = useState<any>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

  useEffect(() => {
    api.get<any>("/corridor").then((r) => {
      setVillages(r.villages || []);
      setMandis(r.mandis || []);
    }).catch(() => null);
  }, []);

  const qtyKg = d.unit === "quintal" ? d.quantity * 100 : d.unit === "tonne" ? d.quantity * 1000 : d.quantity;

  const submit = async (asDraft = false) => {
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      const readyFrom = new Date(now.getTime() + d.ready_offset_days * 86400000);
      readyFrom.setHours(d.ready_hour, 0, 0, 0);
      const deadline = new Date(readyFrom.getTime() + d.deadline_hours * 3600000);
      const totalKg = lineKg(d.items);
      const res = await api.post<any>("/shipments", {
        commodity: d.commodity,
        quantity_kg: d.quantity,
        unit: d.unit,
        pickup_village: d.pickup_village,
        pickup_state: d.pickup_state,
        pickup_district: d.pickup_district_geo || villages.find((v) => v.name === d.pickup_village)?.district || null,
        pickup_lat: d.pickup_lat,
        pickup_lng: d.pickup_lng,
        drop_state: d.dest_state,
        drop_district: d.dest_district,
        items: d.items
          .filter((l) => l.commodity.trim() && l.quantity > 0)
          .map((l) => ({ commodity: l.commodity.trim(), quantity_kg: l.quantity, unit: l.unit,
                         packaging: l.packaging, handling: l.handling, note: l.note || null })),
        requirements: d.requirements || null,
        destination_id: d.destination_id || null,
        destination_name: d.destination_name || null,
        dest_lat: d.dest_lat,
        dest_lng: d.dest_lng,
        ready_from: readyFrom.toISOString(),
        ready_to: new Date(readyFrom.getTime() + 4 * 3600000).toISOString(),
        deadline: deadline.toISOString(),
        packaging: d.packaging,
        handling: d.handling,
        temperature: d.temperature,
        special_instructions: d.special_instructions,
        as_draft: asDraft,
      });
      push("success", asDraft ? "Draft saved" : `Shipment ${res.shipment.code} submitted`,
        asDraft ? "Submit it when ready." : "Admin review is the next step.");
      router.push(`/sender/shipments/${res.shipment.id}`);
    } catch (e: any) {
      setError(e?.message || "Could not create shipment");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const parseVoice = async () => {
    setVoiceBusy(true);
    try {
      const res = await api.post<any>("/voice/parse", { transcript, language: "pa" });
      setVoiceResult(res);
      const dr = res.draft || {};
      setD((prev) => ({
        ...prev,
        commodity: dr.commodity || prev.commodity,
        quantity: dr.quantity ?? prev.quantity,
        unit: dr.unit || prev.unit,
        pickup_village: dr.pickup_village || prev.pickup_village,
        pickup_lat: dr.pickup_lat ?? prev.pickup_lat,
        pickup_lng: dr.pickup_lng ?? prev.pickup_lng,
        destination_id: dr.destination_id || prev.destination_id,
        destination_name: dr.destination_name || prev.destination_name,
        dest_lat: dr.dest_lat ?? prev.dest_lat,
        dest_lng: dr.dest_lng ?? prev.dest_lng,
        ready_offset_days: dr.ready_offset_days ?? prev.ready_offset_days,
      }));
    } catch (e: any) {
      setVoiceResult({ error: e?.message });
    } finally {
      setVoiceBusy(false);
    }
  };

  if (!ready) return null;

  const canNext1 = d.commodity && d.quantity > 0;
  const canNext2 = d.pickup_village && d.destination_name;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
      <div className="space-y-4">
        <Card>
          <div className="mb-5 flex items-center gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-1 items-center gap-2">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  step >= i ? "bg-ink text-accent" : "bg-line text-ink-muted"}`}>
                  {step > i ? <Check size={12} /> : i}
                </span>
                <span className={`hidden text-[11px] font-semibold sm:block ${step >= i ? "text-ink" : "text-ink-muted"}`}>
                  {["Cargo", "Route & timing", "Handling"][i - 1]}
                </span>
                {i < 3 && <span className={`h-0.5 flex-1 rounded ${step > i ? "bg-ink" : "bg-line"}`} />}
              </div>
            ))}
            <button className="btn-ghost btn-sm" onClick={() => setVoiceOpen(true)}>
              <Mic size={13} /> VoiceBoli
            </button>
          </div>

          {step === 1 && (
            <div className="animate-fade-up space-y-5">
              <SectionHeader title="What are you sending?" subtitle="Crop, quantity and packaging" />
              <div>
                <div className="mb-2 text-[12px] font-semibold text-ink">Commodity *</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[...COMMODITIES, { key: "__other", label: "Something else", emoji: "" }].map((c) => (
                    <button key={c.key} onClick={() => setD({ ...d, commodity: c.key === "__other" ? "other" : c.key })}
                      className={`rounded-xl border px-2 py-2.5 text-center transition-all ${
                        d.commodity === c.key ? "border-ink bg-ink/[0.04] shadow-sm" : "border-line hover:border-ink/25"
                      }`}>
                      <div className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-accent-50 text-ink">
                        <Wheat size={14} />
                      </div>
                      <div className="mt-1 text-[11.5px] font-semibold text-ink">{c.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Quantity" required hint={`= ${kg(qtyKg)}`}>
                  <input className="input" type="number" min={1} step="0.5" value={d.quantity}
                    onChange={(e) => setD({ ...d, quantity: Number(e.target.value) })} />
                </Field>
                <Field label="Unit" required>
                  <select className="select" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })}>
                    <option value="quintal">Quintal (100 kg)</option>
                    <option value="tonne">Tonne (1,000 kg)</option>
                    <option value="kg">Kilogram</option>
                  </select>
                </Field>
                <Field label="Packaging">
                  <select className="select" value={d.packaging} onChange={(e) => setD({ ...d, packaging: e.target.value })}>
                    {PACKAGING.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
                  </select>
                </Field>
                <Field label="Handling requirement">
                  <select className="select" value={d.handling} onChange={(e) => setD({ ...d, handling: e.target.value })}>
                    {HANDLING.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
                  </select>
                </Field>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[12px] font-semibold text-ink">Other items in this load</div>
                  <span className="text-[10.5px] text-ink-muted">any item name, not just the list above</span>
                </div>
                <CargoLines
                  lines={d.items}
                  onChange={(items) => setD({ ...d, items })}
                  primary={{ commodity: d.commodity, quantity: d.quantity, unit: d.unit as any, packaging: d.packaging, handling: d.handling }}
                  onPrimary={(l) => setD({ ...d, items: [...d.items, l] })}
                />
              </div>

              <Field label="Your requirement in your own words" hint="Optional — what matters to you beyond the fields above">
                <textarea
                  className="input min-h-[70px]"
                  placeholder="e.g. Covered vehicle needed, village road is narrow after the bridge, driver should call 30 minutes before arrival, no stacking above 2 layers."
                  value={d.requirements}
                  onChange={(e) => setD({ ...d, requirements: e.target.value })}
                />
              </Field>

              <div className="flex justify-end">
                <button className="btn-primary" disabled={!canNext1} onClick={() => setStep(2)}>
                  Continue <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-up space-y-5">
              <SectionHeader title="Where and when?" subtitle="Pickup village, destination and timing" />

              <div className="grid gap-3 sm:grid-cols-2">
                <PlacePicker
                  label="Pickup village / town"
                  required
                  icon={<MapPin size={12} />}
                  value={{
                    name: d.pickup_village, state: d.pickup_state, district: d.pickup_district_geo,
                    lat: d.pickup_lat, lng: d.pickup_lng,
                  }}
                  onChange={(v: PlaceValue) => setD({
                    ...d, pickup_village: v.name, pickup_state: v.state,
                    pickup_district_geo: v.district, pickup_lat: v.lat, pickup_lng: v.lng,
                  })}
                  hint="Any state, district, town or village in India"
                />

                <PlacePicker
                  label="Destination — mandi, warehouse or buyer"
                  required
                  icon={<Compass size={12} />}
                  value={{
                    name: d.destination_name, state: d.dest_state, district: d.dest_district,
                    lat: d.dest_lat, lng: d.dest_lng,
                  }}
                  onChange={(v: PlaceValue) => setD({
                    ...d, destination_id: "", destination_name: v.name,
                    dest_state: v.state, dest_district: v.district, dest_lat: v.lat, dest_lng: v.lng,
                  })}
                  hint="Search any destination in India, or pin it on the map"
                />

                <Field label="Ready to load" required>
                  <div className="flex gap-2">
                    <select className="select flex-1" value={d.ready_offset_days}
                      onChange={(e) => setD({ ...d, ready_offset_days: Number(e.target.value) })}>
                      <option value={0}>Today</option>
                      <option value={1}>Tomorrow</option>
                      <option value={2}>In 2 days</option>
                      <option value={3}>In 3 days</option>
                    </select>
                    <select className="select w-28" value={d.ready_hour}
                      onChange={(e) => setD({ ...d, ready_hour: Number(e.target.value) })}>
                      {[5, 6, 7, 8, 9, 10, 12, 14, 16].map((h) => (
                        <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                      ))}
                    </select>
                  </div>
                </Field>

                <Field label="Delivery deadline" hint="Hard cutoff used by DispatchSense">
                  <select className="select" value={d.deadline_hours}
                    onChange={(e) => setD({ ...d, deadline_hours: Number(e.target.value) })}>
                    {[8, 12, 14, 18, 24, 36].map((h) => (
                      <option key={h} value={h}>{h} hours after ready time</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Special instructions">
                <textarea className="input min-h-[74px]" value={d.special_instructions}
                  placeholder="e.g. load before 9am, tarpaulin needed, weighbridge slip required"
                  onChange={(e) => setD({ ...d, special_instructions: e.target.value })} />
              </Field>

              <div className="flex justify-between">
                <button className="btn-outline" onClick={() => setStep(1)}><ArrowLeft size={14} /> Back</button>
                <button className="btn-primary" disabled={!canNext2} onClick={() => setStep(3)}>
                  Review <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-up space-y-5">
              <SectionHeader title="Review & submit" subtitle="Admin verifies before anything is planned" />
              <div className="rounded-xl2 border border-line bg-soft/50 p-4">
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {[
                    ["Commodity", titleCase(d.commodity)],
                    ["Quantity", `${d.quantity} ${d.unit} (${kg(qtyKg)})`],
                    ["Pickup", [d.pickup_village, d.pickup_district_geo, d.pickup_state].filter(Boolean).join(", ") || "—"],
                    ["Destination", [d.destination_name, d.dest_district, d.dest_state].filter(Boolean).join(", ") || "—"],
                    ["Ready", `${d.ready_offset_days === 0 ? "Today" : d.ready_offset_days === 1 ? "Tomorrow" : `In ${d.ready_offset_days} days`} at ${String(d.ready_hour).padStart(2, "0")}:00`],
                    ["Deadline", `${d.deadline_hours} h after ready`],
                    ["Packaging", titleCase(d.packaging)],
                    ["Handling", titleCase(d.handling)],
                    ["Other items", d.items.filter((l) => l.commodity.trim()).map((l) => `${l.commodity} (${l.quantity} ${l.unit})`).join(" · ") || "—"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted">{k}</dt>
                      <dd className="mt-0.5 text-[13px] font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                {d.requirements.trim() && (
                  <div className="mt-3 rounded-lg border border-line bg-white px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Your requirement</div>
                    <div className="mt-0.5 text-[12px] leading-snug text-ink">{d.requirements}</div>
                  </div>
                )}
              </div>
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
              <div className="flex flex-wrap justify-between gap-2">
                <button className="btn-outline" onClick={() => setStep(2)}><ArrowLeft size={14} /> Back</button>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={busy} onClick={() => submit(true)}>
                    <Save size={14} /> Save as draft
                  </button>
                  <button className="btn-primary" disabled={busy} onClick={() => setConfirm(true)}>
                    {busy ? <Spinner /> : <Send size={14} />} Submit request
                  </button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* side rail */}
      <div className="space-y-4">
        <Card>
          <SectionHeader title="What happens next" eyebrow="Workflow" />
          <ol className="space-y-3">
            {[
              ["Admin review", "Details are verified and the request moves to planning."],
              ["Pooling", "AgroCompat checks whether your consignment can share a vehicle."],
              ["Fair share", "ShapleySplit computes your share — you approve it before dispatch."],
              ["Transport", "A verified transporter accepts and executes the trip."],
              ["Delivery", "POD is recorded and Admin reconciles the destination acknowledgement."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink/10 text-[10px] font-bold text-ink">
                  {i + 1}
                </span>
                <div>
                  <div className="text-[12.5px] font-semibold text-ink">{t}</div>
                  <div className="text-[11.5px] leading-snug text-ink-muted">{b}</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <div className="flex items-start gap-2">
            <Sparkles size={15} className="mt-0.5 shrink-0 text-emerald" />
            <div>
              <div className="text-[12.5px] font-semibold text-ink">VoiceBoli intake</div>
              <p className="mt-1 text-[11.5px] leading-snug text-ink-muted">
                Speak naturally — for example “Bhari ton 40 quintal gehun gobindgarh kal”. The transcript is
                converted into a draft you confirm.
              </p>
              <button className="btn-outline btn-sm mt-2" onClick={() => setVoiceOpen(true)}>
                <Mic size={12} /> Open VoiceBoli
              </button>
            </div>
          </div>
        </Card>

        <SyntheticNote>
          Freight estimates shown after submission are model outputs. Final freight requires your approval.
        </SyntheticNote>
      </div>

      {/* confirm modal */}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Submit this shipment?"
        description="It will enter the Admin review queue."
        footer={<>
          <button className="btn-outline" onClick={() => setConfirm(false)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={() => submit(false)}>
            {busy ? <Spinner /> : <CheckCircle2 size={14} />} Confirm &amp; submit
          </button>
        </>}>
        <div className="space-y-2 text-[13px]">
          <div className="flex justify-between"><span className="text-ink-muted">Commodity</span><span className="font-medium capitalize">{d.commodity}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Quantity</span><span className="font-medium">{kg(qtyKg)}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Pickup</span><span className="font-medium">{d.pickup_village}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Destination</span><span className="font-medium">{d.destination_name}</span></div>
          <div className="mt-3 rounded-lg bg-soft px-3 py-2 text-[11.5px] text-ink-muted">
            A unique shipment ID is generated on submission. You can edit or cancel while it is still in review.
          </div>
        </div>
      </Modal>

      {/* voicebolli modal */}
      <Modal open={voiceOpen} onClose={() => setVoiceOpen(false)} title="VoiceBoli"
        description="Transcript → fields → your confirmation. Nothing is saved automatically."
        width="max-w-xl"
        footer={<>
          <button className="btn-outline" onClick={() => setVoiceOpen(false)}>Close</button>
          <button className="btn-primary" disabled={voiceBusy || transcript.length < 4} onClick={parseVoice}>
            {voiceBusy ? <Spinner /> : <Sparkles size={14} />} Extract fields
          </button>
        </>}>
        <div className="space-y-3">
          <Field label="Transcript" hint="Punjabi, Hindi or English. Example: Bhari ton 40 quintal gehun gobindgarh kal">
            <textarea className="input min-h-[86px]" value={transcript} onChange={(e) => setTranscript(e.target.value)}
              placeholder="Type or paste what the sender said…" />
          </Field>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-soft/60 px-3 py-2 text-[11px] text-ink-muted">
            <Mic size={12} /> Live microphone capture is enabled in deployments with an ASR provider (Bhushini / Whisper).
            This build accepts the transcript so the extraction is fully testable.
          </div>
          {voiceResult && (
            <div className="rounded-xl border border-line p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Extracted draft</div>
              <pre className="max-h-40 overflow-auto rounded-lg bg-ink px-3 py-2 text-[11px] text-accent">
{JSON.stringify(voiceResult.draft, null, 2)}
              </pre>
              {voiceResult.clarification_questions?.length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] font-semibold text-ink">Needs clarification</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11.5px] text-ink-muted">
                    {voiceResult.clarification_questions.map((q: string) => <li key={q}>{q}</li>)}
                  </ul>
                </div>
              )}
              <button className="btn-emerald btn-sm mt-3" onClick={() => { setVoiceOpen(false); setStep(3); }}>
                Apply to form <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
