"use client";

import { Calculator, CheckCircle2, Info, Scale, XCircle } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, Spinner, SyntheticNote, Table, useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function AllocationsPage() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const pools = useApi<any>("/admin/pools");
  const allocs = useApi<any>("/admin/allocations");
  const [poolId, setPoolId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (!ready) return null;
  if (pools.loading && !pools.data) return <Loading rows={3} />;
  if (pools.error) return <ErrorNote message={pools.error} onRetry={pools.reload} />;

  const list = (pools.data?.items || []).filter((p: any) => (p.members?.length || 0) >= 2);
  const active = poolId || list[0]?.id;

  const compute = async () => {
    setBusy(true);
    try {
      const res = await api.post<any>("/admin/allocations/compute", { pool_id: active });
      setResult(res);
      allocs.reload();
      push("success", "Fair share computed", `${res.method} · saving ${inr(res.total_saving)}`);
    } catch (e: any) {
      push("error", "Computation failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const summary = allocs.data?.summary || {};

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Allocated freight", inr(summary.total_allocated, true), "across all coalitions"],
          ["Total saving", inr(summary.total_saving, true), "vs solo travel"],
          ["Awaiting sender", summary.pending ?? 0, "approval required"],
          ["Approved", summary.approved ?? 0, "ready for dispatch"],
        ].map(([k, v, s]) => (
          <Card key={k as string}>
            <div className="label">{k}</div>
            <div className="mt-1.5 text-[21px] font-semibold text-ink">{v}</div>
            <div className="text-[11px] text-ink-muted">{s}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[280px] flex-1">
            <div className="label">Compute allocation for pool</div>
            <select className="select mt-1" value={active} onChange={(e) => { setPoolId(e.target.value); setResult(null); }}>
              {list.length === 0 && <option value="">No pools with 2+ members</option>}
              {list.map((p: any) => (
                <option key={p.id} value={p.id}>{p.corridor} · {p.members.length} shipments · {kg(p.total_kg)}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" disabled={!active || busy} onClick={compute}>
            {busy ? <Spinner /> : <Calculator size={14} />} Compute Shapley shares
          </button>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-muted">
          Exact subset enumeration for ≤ 8 members, Monte Carlo permutation sampling above that with a reported
          standard error. Allocation is capped at each sender&apos;s standalone cost so the participation check always
          holds; freed surplus is redistributed proportionally.
        </p>
      </Card>

      {result && (
        <Card className={result.all_allocations_acceptable ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/30"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Coalition result</div>
              <div className="mt-1 text-[16px] font-semibold text-ink">
                {inr(result.coalition_cost)} pooled vs {inr(result.solo_total)} solo
                <span className="ml-2 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  −{inr(result.total_saving)}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-ink-muted">
                {result.method} · {result.samples} sample(s) · stderr {result.stderr} · ₹{result.cost_per_km}/km · fixed {inr(result.fixed_cost)}
              </div>
            </div>
            <div className="flex gap-2">
              <Badge status={result.all_allocations_acceptable ? "approved" : "rejected"}>
                {result.all_allocations_acceptable ? "participation check passed" : "check failed"}
              </Badge>
              <Badge status={result.allocation_sum_matches_route_cost ? "verified" : "rejected"}>
                {result.allocation_sum_matches_route_cost ? "sums match" : "sum mismatch"}
              </Badge>
            </div>
          </div>

          <div className="mt-4">
            <Table head={["Shipment", "Solo cost", "Raw Shapley", "Allocated", "Saving", "Detour", "Check"]}>
              {result.rows?.map((r: any) => (
                <tr key={r.shipment_id}>
                  <td className="td font-semibold text-ink">{r.shipment_id}</td>
                  <td className="td">{inr(r.standalone_cost)}</td>
                  <td className="td text-ink-muted">{inr(r.raw_shapley)}</td>
                  <td className="td font-semibold">{inr(r.allocated_share)}</td>
                  <td className="td text-emerald-600">−{inr(r.saving)}</td>
                  <td className="td text-[12px]">{Math.round(r.detour_contribution_km)} km</td>
                  <td className="td">
                    {r.participation_ok
                      ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><CheckCircle2 size={12} /> pass</span>
                      : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600"><XCircle size={12} /> fail</span>}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
          <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
            {result.note} Senders have been notified and must approve before the assignment is confirmed.
          </div>
        </Card>
      )}

      <Card pad={false}>
        <div className="px-5 py-4"><SectionHeader title="Allocation register" subtitle="Every proposal with its sender decision" /></div>
        {!allocs.data?.items?.length ? (
          <div className="px-5 pb-5"><EmptyState title="No allocations yet" body="Compute a Shapley allocation for an approved pool."
            icon={<Scale size={18} />} /></div>
        ) : (
          <Table head={["Shipment", "Pool cost", "Pool saving", "Solo cost", "Allocated", "Sender saving", "Check", "Decision"]}>
            {allocs.data.items.map((a: any) => (
              <tr key={a.id} className="transition-colors hover:bg-soft/60">
                <td className="td font-semibold text-ink">{a.code}</td>
                <td className="td text-ink-muted">{inr(a.coalition_cost)}
                  <div className="text-[10px]">whole pool</div></td>
                <td className="td">{inr(a.solo_cost_total - a.coalition_cost)}
                  <div className="text-[10px] text-ink-muted">pool vs solo</div></td>
                <td className="td text-ink-muted">{inr(a.standalone_cost)}
                  <div className="text-[10px]">this shipment alone</div></td>
                <td className="td font-semibold">{inr(a.allocated_share)}</td>
                <td className="td text-emerald-600">−{inr(a.saving)}</td>
                <td className="td">{a.participation_check ? "pass" : "fail"}</td>
                <td className="td"><Badge status={a.approval} /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card className="bg-soft/50">
        <div className="flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-ink" />
          <div className="text-[11.5px] leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">Mathematical caution.</span> Shapley values are fair by
            construction but are not guaranteed to lie in the core. CARGOX therefore enforces the explicit
            no-worse-than-solo rule and never forms a coalition that fails it.
          </div>
        </div>
      </Card>
      <SyntheticNote />
    </div>
  );
}
