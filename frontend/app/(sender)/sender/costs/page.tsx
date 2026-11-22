"use client";

import { CheckCircle2, Info, Scale, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, Modal, Progress, SectionHeader, Spinner, SyntheticNote,
  Table, useToast,
} from "@/components/ui";
import { api, inr } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function CostsPage() {
  const { ready } = useGuard("sender");
  const { push } = useToast();
  const ships = useApi<any>("/shipments?page_size=100");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detail = useApi<any>(open ? `/shipments/${open}/cost` : null, [open]);

  if (!ready) return null;
  if (ships.loading && !ships.data) return <Loading rows={3} />;
  if (ships.error) return <ErrorNote message={ships.error} onRetry={ships.reload} />;

  const withAlloc = (ships.data?.items || []).filter((s: any) => s.allocation);
  const totalSaving = withAlloc.reduce((a: number, s: any) => a + (s.allocation.saving || 0), 0);
  const pending = withAlloc.filter((s: any) => s.allocation.approval === "pending");

  const respond = async (shipmentId: string, accept: boolean) => {
    setBusy(true);
    try {
      await api.post(`/shipments/${shipmentId}/approve-allocation`, { accept, reason: accept ? undefined : "Not acceptable" });
      push("success", accept ? "Allocation approved" : "Allocation rejected");
      ships.reload();
    } catch (e: any) {
      push("error", "Could not submit", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Consignments with allocation", withAlloc.length, `${pending.length} awaiting your decision`],
          ["Total estimated saving", inr(totalSaving, true), "vs travelling alone"],
          ["Method", "Shapley", "exact ≤ 8 members"],
        ].map(([k, v, s]) => (
          <Card key={k as string}>
            <div className="label">{k}</div>
            <div className="mt-1.5 text-[22px] font-semibold text-ink">{v}</div>
            <div className="text-[11px] text-ink-muted">{s}</div>
          </Card>
        ))}
      </div>

      <Card pad={false}>
        <div className="px-5 py-4">
          <SectionHeader title="Freight & fair share" subtitle="Every allocation is traceable to a coalition cost" />
        </div>
        {!withAlloc.length ? (
          <div className="px-5 pb-5">
            <EmptyState
              title="No allocation yet"
              body="Allocations appear after Admin pools compatible consignments and computes fair shares."
              icon={<Scale size={18} />}
              action={<Link href="/sender/shipments" className="btn-outline btn-sm">View shipments</Link>}
            />
          </div>
        ) : (
          <Table head={["Shipment", "Solo cost", "Your share", "Saving", "Detour", "Check", "Status", ""]}>
            {withAlloc.map((s: any) => (
              <tr key={s.id} className="transition-colors hover:bg-soft/60">
                <td className="td">
                  <Link href={`/sender/shipments/${s.id}`} className="font-semibold text-ink hover:underline">
                    {s.code}
                  </Link>
                  <div className="text-[10.5px] capitalize text-ink-muted">{s.commodity} · {Math.round(s.quantity_kg)} kg</div>
                </td>
                <td className="td text-ink-muted line-through">{inr(s.allocation.standalone_cost)}</td>
                <td className="td font-semibold">{inr(s.allocation.allocated_share)}</td>
                <td className="td text-emerald-600">− {inr(s.allocation.saving)}</td>
                <td className="td text-[12px]">{Math.round(s.allocation.detour_contribution_km ?? 0)} km</td>
                <td className="td">
                  {s.allocation.participation_ok
                    ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><CheckCircle2 size={12} /> pass</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600"><XCircle size={12} /> fail</span>}
                </td>
                <td className="td"><Badge status={s.allocation.approval} /></td>
                <td className="td text-right">
                  <div className="flex justify-end gap-1.5">
                    <button className="btn-ghost btn-sm" onClick={() => setOpen(s.id)}>Details</button>
                    {s.allocation.approval === "pending" && (
                      <>
                        <button className="btn-emerald btn-sm" disabled={busy} onClick={() => respond(s.id, true)}>Approve</button>
                        <button className="btn-outline btn-sm" disabled={busy} onClick={() => respond(s.id, false)}>Reject</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card>
        <SectionHeader title="How ShapleySplit works" eyebrow="Method" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["1 · Standalone", "What you would pay alone — one vehicle, one route, no sharing."],
            ["2 · Coalition", "The pooled trip cost when all compatible consignments share the vehicle."],
            ["3 · Marginal", "Your share is your average marginal contribution across every coalition ordering."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-xl border border-line bg-soft/40 px-4 py-3">
              <div className="text-[12px] font-semibold text-ink">{t}</div>
              <div className="mt-1 text-[11.5px] leading-snug text-ink-muted">{b}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <Info size={13} className="mt-0.5 shrink-0 text-emerald-600" />
          <div className="text-[11.5px] leading-relaxed text-emerald-800">
            <span className="font-semibold">Mathematical caution.</span> Shapley values have useful fairness properties,
            but they are not guaranteed to sit inside the cooperative game&apos;s core. CARGOX enforces the
            no-worse-than-solo participation check explicitly and never forces a coalition if an acceptable
            allocation does not exist.
          </div>
        </div>
      </Card>

      <SyntheticNote />

      <Modal open={!!open} onClose={() => setOpen(null)} title="Allocation detail"
        description="Coalition cost, your share and the peers in your group." width="max-w-xl">
        {detail.loading ? <Spinner /> : detail.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Solo", inr(detail.data.allocation?.standalone_cost)],
                ["Coalition total", inr(detail.data.coalition?.coalition_cost)],
                ["Your share", inr(detail.data.allocation?.allocated_share)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-line px-3 py-2.5">
                  <div className="label">{k}</div>
                  <div className="mt-0.5 text-[14px] font-semibold text-ink">{v}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Coalition members</div>
              {detail.data.coalition_members?.length ? (
                <div className="space-y-1.5">
                  {detail.data.coalition_members.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg bg-soft px-3 py-2 text-[12px]">
                      <span className="font-medium text-ink">{m.code}</span>
                      <span className="text-ink-muted capitalize">{m.commodity} · {Math.round(m.quantity_kg)} kg</span>
                      <span className="font-semibold">{inr(m.allocated_share)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-ink-muted">No other members in this coalition.</div>
              )}
            </div>

            <div className="rounded-xl bg-soft px-3 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Explanation</div>
              <ul className="mt-1.5 space-y-1">
                {detail.data.explanation?.map((e: string) => (
                  <li key={e} className="flex gap-2 text-[11.5px] leading-snug text-ink-muted">
                    <Sparkles size={11} className="mt-0.5 shrink-0 text-emerald" /> {e}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
