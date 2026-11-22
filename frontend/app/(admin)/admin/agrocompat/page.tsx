"use client";

import { AlertTriangle, Check, Info, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Badge, Card, ErrorNote, Loading, SectionHeader, Spinner, SyntheticNote, useToast } from "@/components/ui";
import { api, titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

const ALL = ["wheat", "paddy", "maize", "mustard", "cotton", "potato", "onion", "tomato", "banana", "fertiliser", "cement", "seed"];

export default function AgroCompat() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const matrix = useApi<any>("/admin/agrocompat/matrix");
  const [selected, setSelected] = useState<string[]>(["wheat", "paddy", "potato", "onion", "tomato"]);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (matrix.loading && !matrix.data) return <Loading rows={3} />;
  if (matrix.error) return <ErrorNote message={matrix.error} onRetry={matrix.reload} />;

  const toggle = (c: string) => {
    setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
    setResult(null);
  };

  const check = async () => {
    setBusy(true);
    try {
      const res = await api.post<any>("/agrocompat/check", { commodities: selected });
      setResult(res);
    } catch (e: any) {
      push("error", "Check failed", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const rows = matrix.data?.matrix || [];
  const cols = matrix.data?.commodities || [];

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader title="AgroCompat" subtitle="Hard incompatibilities block pooling; soft rules warn and require handling precautions"
          eyebrow="Commodity compatibility" />
        <div className="flex flex-wrap gap-1.5">
          {ALL.map((c) => (
            <button key={c} onClick={() => toggle(c)}
              className={`rounded-xl border px-2.5 py-1.5 text-[11.5px] font-semibold capitalize transition-all ${
                selected.includes(c) ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink/25"}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button className="btn-primary" disabled={selected.length < 2 || busy} onClick={check}>
            {busy ? <Spinner /> : <Sparkles size={14} />} Check combination
          </button>
          <span className="text-[11px] text-ink-muted">{selected.length} commodity(s) selected</span>
        </div>

        {result && (
          <div className={`mt-4 rounded-xl border p-3.5 ${
            result.compatible ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-center gap-2">
              {result.compatible
                ? <Check size={15} className="text-emerald-600" />
                : <X size={15} className="text-red-600" />}
              <span className={`text-[13px] font-semibold ${result.compatible ? "text-emerald-800" : "text-red-700"}`}>
                {result.compatible ? "Pooling allowed" : "Pooling blocked"}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] text-ink-muted">{result.recommendation}</p>
            {result.blockers?.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.blockers.map((b: any, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] text-red-700">
                    <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                    <span><strong className="capitalize">{b.pair.join(" + ")}</strong>: {b.hard.join("; ")}</span>
                  </div>
                ))}
              </div>
            )}
            {result.warnings?.length > 0 && (
              <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                <span className="font-semibold">Precautions: </span>{result.warnings.join("; ")}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card pad={false}>
        <div className="px-5 py-4">
          <SectionHeader title="Compatibility matrix" subtitle="Green = poolable · red = hard block" />
        </div>
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="th sticky left-0 bg-white">Commodity</th>
                {cols.map((c: string) => (
                  <th key={c} className="th text-center capitalize">{c.slice(0, 5)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.commodity}>
                  <td className="td sticky left-0 bg-white font-semibold capitalize">{r.commodity}</td>
                  {r.cells.map((c: any, i: number) => (
                    <td key={i} className="border-t border-line px-1 py-1.5 text-center">
                      <span className={`inline-grid h-6 w-6 place-items-center rounded-md text-[10px] font-bold ${
                        c.compatible
                          ? c.score >= 0.99 ? "bg-emerald/15 text-emerald-600" : "bg-accent/40 text-ink"
                          : "bg-red-100 text-red-600"}`}>
                        {c.compatible ? (c.score >= 0.99 ? "•" : "ok") : "✕"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="bg-soft/50">
        <div className="flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-ink" />
          <p className="text-[11.5px] leading-relaxed text-ink-muted">
            Rules cover ethylene interaction, moisture, odour, contamination, stackability, crushing risk, packaging
            and temperature. They are broad published-handling priors and require domain validation before any
            commercial pilot.
          </p>
        </div>
      </Card>
      <SyntheticNote />
    </div>
  );
}
