"use client";

import { CheckCircle2, Clock, Info, Split, XCircle } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Field, Loading, SectionHeader, Spinner, SyntheticNote, Table, useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function DispatchSense() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const pools = useApi<any>("/admin/pools");
  const history = useApi<any>("/dispatch/history");
  const [poolId, setPoolId] = useState("");
  const [inputs, setInputs] = useState({
    expected_arrival_kg: 1500, urgency: 0.6, hours_to_deadline: 8, ready_ratio: 1.0, capacity_kg: "",
  });
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (pools.loading && !pools.data) return <Loading rows={3} />;
  if (pools.error) return <ErrorNote message={pools.error} onRetry={pools.reload} />;

  const list = (pools.data?.items || []).filter((p: any) => p.status !== "rejected");
  const active = poolId || list[0]?.id;
  const pool = list.find((p: any) => p.id === active);

  const decide = async () => {
    setBusy(true);
    try {
      const res = await api.post<any>("/admin/dispatch/decide", {
        pool_id: active,
        expected_arrival_kg: Number(inputs.expected_arrival_kg),
        urgency: Number(inputs.urgency),
        hours_to_deadline: Number(inputs.hours_to_deadline),
        ready_ratio: Number(inputs.ready_ratio),
        capacity_kg: inputs.capacity_kg ? Number(inputs.capacity_kg) : null,
      });
      setResult(res);
    } catch (e: any) {
      push("error", "Decision failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await api.post(`/admin/dispatch/${result.decision_id}/approve`);
      push("success", `Decision ${result.decision} approved`, "Applied to the pool where applicable.");
      history.reload();
    } catch (e: any) {
      push("error", "Approval failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const tone = result?.decision === "GO" ? "emerald" : result?.decision === "WAIT" ? "amber" :
    result?.decision === "SPLIT" ? "indigo" : "red";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
        <Card>
          <SectionHeader title="Dispatch decision" subtitle="Marginal benefit of waiting vs cost of delay" eyebrow="DispatchSense" />
          <div className="grid gap-3">
            <Field label="Pool">
              <select className="select" value={active} onChange={(e) => { setPoolId(e.target.value); setResult(null); }}>
                {list.length === 0 && <option value="">No pools available</option>}
                {list.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.corridor} · {p.members?.length} loads · {kg(p.total_kg)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expected arrival (kg)" hint="Compatible cargo likely at next checkpoint">
                <input className="input" type="number" value={inputs.expected_arrival_kg}
                  onChange={(e) => setInputs({ ...inputs, expected_arrival_kg: Number(e.target.value) })} />
              </Field>
              <Field label="Hours to deadline">
                <input className="input" type="number" step="0.5" value={inputs.hours_to_deadline}
                  onChange={(e) => setInputs({ ...inputs, hours_to_deadline: Number(e.target.value) })} />
              </Field>
              <Field label="Crop urgency (0–1)">
                <input className="input" type="number" step="0.1" min={0} max={1} value={inputs.urgency}
                  onChange={(e) => setInputs({ ...inputs, urgency: Number(e.target.value) })} />
              </Field>
              <Field label="Ready ratio (0–1)">
                <input className="input" type="number" step="0.05" min={0} max={1} value={inputs.ready_ratio}
                  onChange={(e) => setInputs({ ...inputs, ready_ratio: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Vehicle capacity override (kg)" hint="Leave blank to use committed capacity">
              <input className="input" placeholder="auto" value={inputs.capacity_kg}
                onChange={(e) => setInputs({ ...inputs, capacity_kg: e.target.value })} />
            </Field>
            <button className="btn-primary" disabled={!active || busy} onClick={decide}>
              {busy ? <Spinner /> : <Clock size={14} />} Run decision
            </button>
          </div>
        </Card>

        <div className="space-y-4">
          {!result ? (
            <Card>
              <EmptyState title="No decision yet" body="Run the policy on a pool to see the recommendation and its rupee trade-off."
                icon={<Clock size={18} />} />
            </Card>
          ) : (
            <>
              <Card className={result.decision === "GO" ? "border-emerald-200 bg-emerald-50/40" :
                result.decision === "WAIT" ? "border-amber-200 bg-amber-50/40" : ""}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="label">Recommendation</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded-xl px-3 py-1.5 text-[18px] font-bold ${
                        result.decision === "GO" ? "bg-emerald text-white" :
                        result.decision === "WAIT" ? "bg-amber-500 text-white" :
                        result.decision === "SPLIT" ? "bg-indigo-500 text-white" : "bg-red-500 text-white"}`}>
                        {result.decision}
                      </span>
                      <span className="text-[11.5px] text-ink-muted">next checkpoint {result.next_checkpoint}</span>
                    </div>
                  </div>
                  <button className="btn-primary btn-sm" disabled={busy} onClick={approve}>
                    <CheckCircle2 size={13} /> Approve decision
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["Wait benefit", inr(result.wait_benefit)],
                    ["Delay cost", inr(result.delay_cost)],
                    ["Net gain of waiting", inr(result.net_gain_of_waiting)],
                  ].map(([k, v], i) => (
                    <div key={k} className="rounded-xl bg-white px-3 py-2.5">
                      <div className="label">{k}</div>
                      <div className={`mt-0.5 text-[15px] font-semibold ${i === 2 ? (result.net_gain_of_waiting > 0 ? "text-emerald-600" : "text-red-600") : "text-ink"}`}>
                        {v}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 space-y-1">
                  {result.reasons?.map((r: string, i: number) => (
                    <div key={i} className="flex gap-2 text-[11.5px] leading-snug text-ink-muted">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-muted/60" /> {r}
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[11px]">
                  {[
                    ["Quality cost", inr(result.quality_cost)],
                    ["Vehicle idle", inr(result.idle_cost)],
                    ["Window penalty", inr(result.window_penalty)],
                  ].map(([k, v]) => (
                    <div key={k}><span className="text-ink-muted">{k}</span><div className="font-semibold text-ink">{v}</div></div>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-ink-muted">Policy: {result.policy} · utilisation {Math.round(result.utilisation * 100)}%</div>
              </Card>

              <Card>
                <div className="flex items-start gap-2.5">
                  <Info size={14} className="mt-0.5 shrink-0 text-ink" />
                  <p className="text-[11.5px] leading-relaxed text-ink-muted">
                    This is a transparent threshold policy, not a claim of global optimality. Approving a{" "}
                    <span className="font-semibold text-ink">GO</span> marks the pool dispatched and confirms its
                    shipments; <span className="font-semibold text-ink">WAIT</span> holds it for one checkpoint;{" "}
                    <span className="font-semibold text-ink">SPLIT</span> dispatches the ready share;{" "}
                    <span className="font-semibold text-ink">CANCEL</span> requires re-planning.
                  </p>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      <Card pad={false}>
        <div className="px-5 py-4"><SectionHeader title="Decision history" subtitle="Every recommendation keeps its benefit, cost and reason" /></div>
        <Table head={["When", "Pool", "Decision", "Wait benefit", "Delay cost", "Approved by", "Next checkpoint"]}
          empty={!history.data?.items?.length}>
          {(history.data?.items || []).map((d: any) => (
            <tr key={d.id} className="transition-colors hover:bg-soft/60">
              <td className="td text-[11.5px] text-ink-muted">{when(d.created_at)}</td>
              <td className="td text-[12px] capitalize">{d.corridor || "adhoc"}</td>
              <td className="td"><Badge status={d.decision}>{d.decision}</Badge></td>
              <td className="td">{inr(d.expected_wait_benefit)}</td>
              <td className="td">{inr(d.delay_cost)}</td>
              <td className="td text-[11.5px]">{d.approved_by ? "approved" : <span className="text-amber-700">pending</span>}</td>
              <td className="td text-[11.5px] text-ink-muted">{d.next_checkpoint}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <SyntheticNote>Decision inputs are operational records plus synthetic expected-arrival estimates.</SyntheticNote>
    </div>
  );
}
