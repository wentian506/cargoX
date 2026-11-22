"use client";

import { FlaskConical, Play, RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";
import { PolicyCompare, RadarScore } from "@/components/charts";
import {
  Badge, Card, ErrorNote, Field, Loading, SectionHeader, Spinner, SyntheticNote, Table, useToast,
} from "@/components/ui";
import { api, inr, kg, titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function Simulator() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const scenarios = useApi<any>("/simulations/scenarios");
  const runs = useApi<any>("/simulations/runs");
  const [scenario, setScenario] = useState("khanna_wheat_wave");
  const [seed, setSeed] = useState(20260101);
  const [params, setParams] = useState({ pool_threshold_kg: 1200, max_wait_min: 45, detour_limit_km: 12, standby: 1 });
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (scenarios.loading && !scenarios.data) return <Loading rows={3} />;
  if (scenarios.error) return <ErrorNote message={scenarios.error} onRetry={scenarios.reload} />;

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.post<any>("/simulations/run", { scenario, seed, params });
      setResult(res);
      runs.reload();
      push("success", "Simulation complete", `seed ${res.seed} · cost −${res.headline.cost_reduction_pct}%`);
    } catch (e: any) {
      push("error", "Simulation failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const cargox = result?.results?.find((r: any) => r.policy === "cargox_integrated");
  const individual = result?.results?.find((r: any) => r.policy === "individual_booking");

  const chartData = (result?.results || []).map((r: any) => ({
    label: r.label.replace(" vehicle", "").replace("Individual booking", "Individual").replace("Greedy matching", "Greedy")
      .replace("Standard consolidation", "Consolidation").replace("Integrated CARGOX policy", "CARGOX"),
    cost: Math.round(r.metrics.cost_per_quintal),
    load: Math.round(r.metrics.avg_load_factor * 100),
    empty: Math.round(r.metrics.empty_km_share * 100),
  }));

  const radar = result && cargox && individual ? [
    { metric: "Low cost/q", a: 100, b: Math.round((individual.metrics.cost_per_quintal / cargox.metrics.cost_per_quintal) * 100) },
    { metric: "Load factor", a: Math.round(cargox.metrics.avg_load_factor * 100), b: Math.round(individual.metrics.avg_load_factor * 100) },
    { metric: "Low empty-km", a: Math.round((1 - cargox.metrics.empty_km_share) * 100), b: Math.round((1 - individual.metrics.empty_km_share) * 100) },
    { metric: "Coverage", a: Math.round(cargox.metrics.coverage * 100), b: Math.round(individual.metrics.coverage * 100) },
    { metric: "On-time", a: Math.round(cargox.metrics.on_time_rate * 100), b: Math.round(individual.metrics.on_time_rate * 100) },
  ] : [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="label">Digital twin · policy simulator</div>
            <h2 className="mt-0.5 text-[16px] font-semibold text-ink">Four policies, one scenario, one seed</h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-ink-muted">
              The identical scenario and random seed are replayed under individual booking, greedy matching, standard
              consolidation and the integrated CARGOX policy. Only the policy varies — metrics are computed the same way
              for all four.
            </p>
          </div>
          <button className="btn-primary" disabled={busy} onClick={run}>
            {busy ? <Spinner /> : <Play size={14} />} Run simulation
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Scenario">
            <select className="select" value={scenario} onChange={(e) => setScenario(e.target.value)}>
              {(scenarios.data?.scenarios || []).map((s: any) => (
                <option key={s.key} value={s.key}>{s.name} · {s.consignments} consignments</option>
              ))}
            </select>
          </Field>
          <Field label="Random seed" hint="Same seed = reproducible run">
            <div className="flex gap-1.5">
              <input className="input" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
              <button className="btn-outline px-2.5" onClick={() => setSeed(Math.floor(Math.random() * 1e8))}
                title="Randomise seed"><RefreshCw size={13} /></button>
            </div>
          </Field>
          <Field label="Pool threshold (kg)">
            <input className="input" type="number" value={params.pool_threshold_kg}
              onChange={(e) => setParams({ ...params, pool_threshold_kg: Number(e.target.value) })} />
          </Field>
          <Field label="Max wait (min)">
            <input className="input" type="number" value={params.max_wait_min}
              onChange={(e) => setParams({ ...params, max_wait_min: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      {!result ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical size={26} className="mb-3 text-ink-muted/60" />
            <div className="text-[13.5px] font-semibold text-ink">No simulation run yet</div>
            <div className="mt-1 max-w-sm text-[12px] text-ink-muted">
              Run a scenario to compare the four operating policies on cost per quintal, load factor and empty kilometres.
            </div>
            <button className="btn-primary mt-4" onClick={run} disabled={busy}>
              {busy ? <Spinner /> : <Play size={14} />} Run now
            </button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-ink/25 bg-ink/[0.03]">
              <div className="label">Gap to best simple baseline</div>
              <div className="mt-1 text-[22px] font-semibold text-ink">
                {result.headline.cost_gap_vs_best_baseline_pct >= 0
                  ? `−${result.headline.cost_gap_vs_best_baseline_pct}%`
                  : `+${Math.abs(result.headline.cost_gap_vs_best_baseline_pct)}%`}
              </div>
              <div className="text-[11px] text-ink-muted">vs {result.headline.best_baseline_label}</div>
            </Card>
            <Card>
              <div className="label">vs individual booking</div>
              <div className="mt-1 text-[22px] font-semibold text-emerald-600">−{result.headline.cost_reduction_pct}%</div>
              <div className="text-[11px] text-ink-muted">weakest comparator — read with caution</div>
            </Card>
            <Card>
              <div className="label">Empty-km reduction</div>
              <div className="mt-1 text-[22px] font-semibold text-emerald-600">−{result.headline.empty_km_reduction_pct}%</div>
              <div className="text-[11px] text-ink-muted">vs individual booking</div>
            </Card>
            <Card>
              <div className="label">Seed · load factor gain</div>
              <div className="mt-1 text-[22px] font-semibold text-ink">+{Math.round(result.headline.load_factor_gain * 100)} pp</div>
              <div className="text-[11px] text-ink-muted">seed {result.seed} · {result.scenario.consignments} consignments</div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <Card>
              <SectionHeader title="Policy comparison" subtitle="Same scenario, same seed" />
              <PolicyCompare data={chartData} />
            </Card>
            <Card>
              <SectionHeader title="CARGOX vs individual booking" />
              <RadarScore data={radar} />
            </Card>
          </div>

          <Card pad={false}>
            <div className="px-5 py-4"><SectionHeader title="Metrics table" subtitle="Identical definitions across every policy" /></div>
            <Table head={["Policy", "Cost/quintal", "km/quintal", "Empty-km", "Load factor", "On-time", "Coverage", "Vehicles", "Cost vs baseline"]}>
              {result.results.map((r: any) => (
                <tr key={r.policy} className={r.policy === "cargox_integrated" ? "bg-emerald-50/40" : ""}>
                  <td className="td">
                    <div className="font-semibold text-ink">{r.label}</div>
                    <div className="max-w-[280px] truncate text-[10.5px] text-ink-muted">{r.notes}</div>
                  </td>
                  <td className="td font-semibold">{inr(r.metrics.cost_per_quintal)}</td>
                  <td className="td">{r.metrics.km_per_quintal}</td>
                  <td className="td">{(r.metrics.empty_km_share * 100).toFixed(1)}%</td>
                  <td className="td">{(r.metrics.avg_load_factor * 100).toFixed(1)}%</td>
                  <td className="td">{(r.metrics.on_time_rate * 100).toFixed(0)}%</td>
                  <td className="td">{(r.metrics.coverage * 100).toFixed(0)}%</td>
                  <td className="td">{r.metrics.vehicles_used}</td>
                  <td className="td">
                    <Badge status={r.metrics.cost_reduction_vs_individual_pct > 0 ? "verified" : "pending"}>
                      {r.metrics.cost_reduction_vs_individual_pct > 0 ? "−" : ""}{Math.abs(r.metrics.cost_reduction_vs_individual_pct)}%
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card className="bg-soft/50">
            <p className="text-[11.5px] leading-relaxed text-ink-muted">{result.disclaimer}</p>
          </Card>
        </>
      )}

      <Card pad={false}>
        <div className="px-5 py-4"><SectionHeader title="Run history" subtitle="Every run stores its seed, policy config and metrics" /></div>
        <Table head={["Scenario", "Seed", "Cost reduction", "Empty-km reduction", "Created"]}
          empty={!runs.data?.items?.length}>
          {(runs.data?.items || []).map((r: any) => (
            <tr key={r.id}>
              <td className="td font-semibold">{r.scenario_name}</td>
              <td className="td font-mono text-[11px]">{r.seed}</td>
              <td className="td">{r.headline ? `−${r.headline.cost_reduction_pct}%` : "—"}</td>
              <td className="td">{r.headline ? `−${r.headline.empty_km_reduction_pct}%` : "—"}</td>
              <td className="td text-[11px] text-ink-muted">{new Date(r.created_at).toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <SyntheticNote>
        Simulation outputs are synthetic model results, not pilot measurements. Comparability depends on holding the
        scenario and seed constant, which the engine enforces.
      </SyntheticNote>
    </div>
  );
}
