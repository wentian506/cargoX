"use client";

import { Compass, Info, LineChart as LineIcon } from "lucide-react";
import { useState } from "react";
import { LineTrend } from "@/components/charts";
import {
  Badge, Card, ErrorNote, Field, Loading, SectionHeader, Spinner, SyntheticNote, Table, useToast,
} from "@/components/ui";
import { api, inr, kg } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function ValueClock() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const corridor = useApi<any>("/corridor");
  const [f, setF] = useState({ commodity: "potato", quantity_kg: 3100, origin_lat: 30.729, origin_lng: 76.062, freight_share: 2400, vehicle_class: "lcv" });
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [curveCommodity, setCurveCommodity] = useState("potato");
  const curve = useApi<any>(`/valueclock/retention?commodity=${curveCommodity}`, [curveCommodity]);

  if (!ready) return null;

  const compare = async () => {
    setBusy(true);
    try {
      const res = await api.post<any>("/valueclock/compare", {
        commodity: f.commodity, quantity_kg: Number(f.quantity_kg),
        origin_lat: Number(f.origin_lat), origin_lng: Number(f.origin_lng),
        freight_share: Number(f.freight_share), vehicle_class: f.vehicle_class,
      });
      setResult(res);
    } catch (e: any) {
      push("error", "Comparison failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
        <Card>
          <SectionHeader title="ValueClock" subtitle="Net realisation per destination" eyebrow="Destination economics" />
          <div className="grid gap-3">
            <Field label="Commodity">
              <select className="select" value={f.commodity} onChange={(e) => setF({ ...f, commodity: e.target.value })}>
                {["wheat", "paddy", "potato", "onion", "mustard", "maize", "tomato"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity (kg)">
                <input className="input" type="number" value={f.quantity_kg}
                  onChange={(e) => setF({ ...f, quantity_kg: Number(e.target.value) })} />
              </Field>
              <Field label="Freight share (₹)">
                <input className="input" type="number" value={f.freight_share}
                  onChange={(e) => setF({ ...f, freight_share: Number(e.target.value) })} />
              </Field>
              <Field label="Origin lat">
                <input className="input" type="number" step="0.0001" value={f.origin_lat}
                  onChange={(e) => setF({ ...f, origin_lat: Number(e.target.value) })} />
              </Field>
              <Field label="Origin lng">
                <input className="input" type="number" step="0.0001" value={f.origin_lng}
                  onChange={(e) => setF({ ...f, origin_lng: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Vehicle class">
              <select className="select" value={f.vehicle_class} onChange={(e) => setF({ ...f, vehicle_class: e.target.value })}>
                {["pickup", "tractor_trolley", "tempo", "lcv", "truck"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <button className="btn-primary" disabled={busy} onClick={compare}>
              {busy ? <Spinner /> : <Compass size={14} />} Compare destinations
            </button>
          </div>
        </Card>

        <Card>
          <SectionHeader title="Quality retention curve" subtitle="ThermoDecay lookup — a proxy for urgency, not a spoilage model" />
          <div className="mb-3 flex gap-1.5">
            {["potato", "onion", "tomato", "wheat"].map((c) => (
              <button key={c} onClick={() => setCurveCommodity(c)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
                  curveCommodity === c ? "bg-ink text-white" : "bg-soft text-ink-muted hover:text-ink"}`}>
                {c}
              </button>
            ))}
          </div>
          {curve.data?.curve ? (
            <LineTrend
              data={curve.data.curve.map((p: any) => ({ hours: `${p.hours}h`, retention: Math.round(p.retention * 1000) / 10 }))}
              xKey="hours"
              series={[{ key: "retention", label: "Retention (%)", colour: "#16A36A" }]}
              height={200}
            />
          ) : <div className="h-[200px] animate-pulse rounded-lg bg-soft" />}
          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">{curve.data?.note}</p>
        </Card>
      </div>

      {result && (
        <>
          <Card className="border-emerald-200 bg-emerald-50/40">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald/15 text-emerald-600"><Compass size={17} /></span>
              <div className="flex-1">
                <div className="text-[13.5px] font-semibold text-ink">Recommended: {result.options[0]?.name}</div>
                <div className="text-[11.5px] text-ink-muted">
                  {inr(result.options[0]?.net_realisation)} net · {inr(result.uplift_vs_next)} better than next option
                </div>
              </div>
              <Badge status="pending">sender approval required</Badge>
            </div>
          </Card>

          <Card pad={false}>
            <div className="px-5 py-4"><SectionHeader title="Destination comparison" /></div>
            <Table head={["#", "Destination", "Distance", "Travel", "Queue", "Price/q", "Retention", "Gross", "Freight", "Delay cost", "Net", "/q"]}>
              {result.options.map((o: any) => (
                <tr key={o.destination_id} className={o.rank === 1 ? "bg-emerald-50/40" : ""}>
                  <td className="td">{o.rank}</td>
                  <td className="td font-semibold text-ink">{o.name}</td>
                  <td className="td">{o.distance_km} km</td>
                  <td className="td">{o.travel_hours} h</td>
                  <td className="td">{o.queue_minutes} min</td>
                  <td className="td">{inr(o.price_per_quintal)}</td>
                  <td className="td">{(o.retention * 100).toFixed(1)}%</td>
                  <td className="td">{inr(o.gross_value)}</td>
                  <td className="td text-red-600">−{inr(o.freight_share)}</td>
                  <td className="td text-red-600">−{inr(o.delay_queue_cost)}</td>
                  <td className="td font-semibold text-ink">{inr(o.net_realisation)}</td>
                  <td className="td">{inr(o.per_quintal_net)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}

      {result && (
        <Card className="bg-soft/50">
          <div className="flex items-start gap-2.5">
            <Info size={14} className="mt-0.5 shrink-0 text-ink" />
            <div>
              <div className="text-[12px] font-semibold text-ink">Assumptions</div>
              <ul className="mt-1 space-y-0.5">
                {result.assumptions?.map((a: string) => (
                  <li key={a} className="text-[11.5px] leading-snug text-ink-muted">• {a}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <SyntheticNote>
        Prices are synthetic mandi observations. The quality curve is a published-handling-style lookup; temperature
        only adjusts urgency.
      </SyntheticNote>
    </div>
  );
}
