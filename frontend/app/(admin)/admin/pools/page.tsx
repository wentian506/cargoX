"use client";

import { Check, Combine, Layers, Scissors, Sparkles, X } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, Progress, SectionHeader, Spinner, SyntheticNote, useToast,
} from "@/components/ui";
import { api, kg, titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function PoolsPage() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/admin/pools");
  const [busy, setBusy] = useState<string | null>(null);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const pools = data?.items || [];

  const autoPool = async () => {
    setBusy("auto");
    try {
      const res = await api.post<any>("/admin/pools/auto");
      push(res.count ? "success" : "info", res.count ? `${res.count} pool(s) proposed` : "No new pools", res.message);
      reload();
    } catch (e: any) {
      push("error", "Pooling failed", e?.message);
    } finally {
      setBusy(null);
    }
  };

  const act = async (poolId: string, action: string) => {
    setBusy(poolId);
    try {
      await api.post(`/admin/pools/${poolId}/action`, { action });
      push("success", `Pool ${action}d`);
      reload();
    } catch (e: any) {
      push("error", "Action failed", e?.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label">Consolidation</div>
            <h2 className="mt-0.5 text-[16px] font-semibold text-ink">{pools.length} pool(s)</h2>
            <p className="mt-1 max-w-xl text-[12px] text-ink-muted">
              Auto-pooling groups planning-ready shipments by destination corridor and pickup proximity, then gates
              every group through AgroCompat before it can be approved.
            </p>
          </div>
          <button className="btn-primary" disabled={busy === "auto"} onClick={autoPool}>
            {busy === "auto" ? <Spinner /> : <Sparkles size={14} />} Auto-pool
          </button>
        </div>
      </Card>

      {!pools.length ? (
        <EmptyState title="No pools yet" body="Run auto-pooling after approving shipments for planning."
          icon={<Layers size={18} />} action={<button className="btn-primary btn-sm" onClick={autoPool}>Run auto-pool</button>} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {pools.map((p: any) => {
            const compat = p.compatibility;
            const cap = p.members?.[0]?.quantity_kg ? p.total_kg : 0;
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{p.corridor}</span>
                      <Badge status={p.status === "approved" ? "approved" : p.status === "rejected" ? "rejected" : "pending"}>
                        {p.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-ink-muted">
                      {p.members?.length} consignments · {kg(p.total_kg)} · suggested {titleCase(p.vehicle_class_suggestion)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="label">Compatibility</div>
                    <div className={`text-[13px] font-semibold ${compat?.compatible ? "text-emerald-600" : "text-red-600"}`}>
                      {compat?.compatible ? "compatible" : "blocked"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {(p.members || []).map((m: any) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px]">
                      <span className="font-semibold text-ink">{m.code}</span>
                      <span className="capitalize text-ink-muted">{m.commodity} · {kg(m.quantity_kg)}</span>
                      <span className="text-ink-muted">{m.pickup_village} → {m.destination_name}</span>
                      <Badge status={m.status}>{m.status.replace(/_/g, " ")}</Badge>
                    </div>
                  ))}
                </div>

                {compat?.blockers?.length > 0 && (
                  <div className="mt-2.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700">
                    <div className="font-semibold">Hard incompatibility</div>
                    <ul className="mt-0.5 list-disc pl-4">
                      {compat.blockers.map((b: any, i: number) => (
                        <li key={i}>{b.pair.join(" + ")}: {b.hard.join("; ")}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {compat?.warnings?.length > 0 && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                    <span className="font-semibold">Handling precautions: </span>
                    {compat.warnings.join("; ")}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <span className={`chip ${p.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-line bg-soft text-ink-muted"}`}>
                    <Combine size={11} /> {titleCase(p.status)}
                  </span>
                  {p.status === "proposed" && (
                    <>
                      <button className="btn-emerald btn-sm" disabled={busy === p.id || !compat?.compatible}
                        onClick={() => act(p.id, "approve")}>
                        {busy === p.id ? <Spinner size={12} /> : <Check size={12} />} Approve pool
                      </button>
                      <button className="btn-outline btn-sm" disabled={busy === p.id} onClick={() => act(p.id, "reject")}>
                        <X size={12} /> Break pool
                      </button>
                      <button className="btn-ghost btn-sm" disabled={busy === p.id}
                        onClick={() => act(p.id, "split")} title="Splits require selecting members">
                        <Scissors size={12} /> Split
                      </button>
                    </>
                  )}
                  {p.status === "approved" && (
                    <a href="/admin/allocations" className="btn-primary btn-sm">Compute fair share →</a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-soft/50">
        <SectionHeader title="Compatibility rules in force" eyebrow="AgroCompat" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Hard block", "Ethylene producer + ethylene-sensitive cargo"],
            ["Hard block", "Agro-chemicals with fresh produce"],
            ["Hard block", "Cement dust with high-moisture cargo"],
            ["Hard block", "Incompatible temperature regimes"],
            ["Hard block", "Dry grain with high-moisture cargo"],
            ["Soft warning", "Odour taint, crush/stack mismatch, moisture mismatch"],
          ].map(([k, v], i) => (
            <div key={i} className="rounded-xl border border-line bg-white px-3 py-2">
              <div className={`text-[10px] font-bold uppercase tracking-wider ${k === "Hard block" ? "text-red-600" : "text-amber-700"}`}>{k}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-muted">{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <SyntheticNote>Compatibility rules are broad published-handling priors, not exact biological predictions.</SyntheticNote>
    </div>
  );
}
