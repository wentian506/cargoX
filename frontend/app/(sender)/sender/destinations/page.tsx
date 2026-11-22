"use client";

import { ArrowUpRight, Compass, Info, Trophy } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, Spinner, SyntheticNote, useToast,
} from "@/components/ui";
import { api, inr, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function DestinationAdvisor() {
  const { ready } = useGuard("sender");
  const { push } = useToast();
  const ships = useApi<any>("/shipments?page_size=100");
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (ships.loading && !ships.data) return <Loading rows={3} />;
  if (ships.error) return <ErrorNote message={ships.error} onRetry={ships.reload} />;

  const items = ships.data?.items || [];
  const activeShipment = items.find((s: any) => s.id === selected) || items[0];

  const run = async (id: string) => {
    setBusy(true);
    setSelected(id);
    try {
      const res = await api.post<any>(`/shipments/${id}/destinations/recommend`);
      setResult(res);
    } catch (e: any) {
      push("error", "Could not compute", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader title="Destination advisor"
          subtitle="Compares expected sale value, quality retention, freight share and queue cost for every mandi."
          eyebrow="ValueClock" />
        {!items.length ? (
          <EmptyState title="No shipments to advise on" body="Create a shipment first." icon={<Compass size={18} />} />
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[240px] flex-1">
              <div className="mb-1.5 text-[12px] font-semibold text-ink">Choose a consignment</div>
              <select className="select" value={activeShipment?.id}
                onChange={(e) => { setResult(null); setSelected(e.target.value); }}>
                {items.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.commodity} · {Math.round(s.quantity_kg)} kg · {s.destination_name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-primary" disabled={busy} onClick={() => run(activeShipment.id)}>
              {busy ? <Spinner /> : <Compass size={14} />} Compare destinations
            </button>
          </div>
        )}
      </Card>

      {result && (
        <>
          <Card className="border-emerald-200 bg-emerald-50/40">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald/15 text-emerald-600">
                <Trophy size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink">
                  Recommended: {result.options[0]?.name}
                </div>
                <div className="text-[11.5px] text-ink-muted">
                  Net realisation {inr(result.options[0]?.net_realisation)} · {inr(result.uplift_vs_next)} better than the
                  next option · confidence {Math.round((result.options[0]?.confidence || 0) * 100)}%
                </div>
              </div>
              <Badge status="pending">Requires your approval</Badge>
            </div>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {result.options.map((o: any) => (
              <Card key={o.destination_id} className={o.rank === 1 ? "ring-1 ring-emerald/40" : ""}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="grid h-5 w-5 place-items-center rounded-md bg-ink/10 text-[10px] font-bold text-ink">
                        {o.rank}
                      </span>
                      <span className="text-[13.5px] font-semibold text-ink">{o.name}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-ink-muted">
                      {o.distance_km} km · {o.travel_hours} h travel · queue {o.queue_minutes} min
                    </div>
                  </div>
                  {o.arrival_after_closing && <Badge status="cancelled">after closing</Badge>}
                </div>

                <div className="mt-3 space-y-1.5 text-[12px]">
                  {[
                    ["Price / quintal", inr(o.price_per_quintal)],
                    ["Gross value", inr(o.gross_value)],
                    ["Quality retention", `${(o.retention * 100).toFixed(1)}%`],
                    ["Freight share", `− ${inr(o.freight_share)}`],
                    ["Queue & delay cost", `− ${inr(o.delay_queue_cost)}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-ink-muted">{k}</span>
                      <span className="font-medium text-ink">{v}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
                  <div>
                    <div className="label">Net realisation</div>
                    <div className="text-[18px] font-semibold text-ink">{inr(o.net_realisation)}</div>
                    <div className="text-[10.5px] text-ink-muted">{inr(o.per_quintal_net)} / quintal</div>
                  </div>
                  <span className="text-[10.5px] text-ink-muted">conf. {Math.round(o.confidence * 100)}%</span>
                </div>
              </Card>
            ))}
          </div>

          <Card>
            <div className="flex items-start gap-2.5">
              <Info size={15} className="mt-0.5 shrink-0 text-ink" />
              <div>
                <div className="text-[12.5px] font-semibold text-ink">Assumptions behind this ranking</div>
                <ul className="mt-1.5 space-y-1">
                  {(result.assumptions || []).map((a: string) => (
                    <li key={a} className="flex gap-2 text-[11.5px] leading-snug text-ink-muted">
                      <ArrowUpRight size={11} className="mt-0.5 shrink-0 text-emerald" /> {a}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 rounded-lg bg-soft px-2.5 py-1.5 text-[11px] text-ink-muted">
                  Destination changes are never applied silently — they require your approval and Admin coordination.
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {!result && items.length > 0 && (
        <EmptyState title="Run a comparison" body="Choose a consignment and compare mandi destinations on net realisation."
          icon={<Compass size={18} />} />
      )}

      <SyntheticNote>
        Prices are synthetic market observations with stated confidence. Retention uses a published-handling-style
        lookup curve, not a spoilage model.
      </SyntheticNote>
    </div>
  );
}
