"use client";

import { CheckCircle2, Clock, Info, Waves } from "lucide-react";
import { Badge, Card, EmptyState, ErrorNote, Loading, Progress, SectionHeader, SyntheticNote, Table } from "@/components/ui";
import { kg, titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function ReadySync() {
  const { ready } = useGuard("admin");
  const { data, loading, error, reload } = useApi<any>("/readysync/board");

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="label">ReadySync</div>
            <h2 className="mt-0.5 text-[16px] font-semibold text-ink">Readiness check-ins and wave management</h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-ink-muted">
              Check-ins are due at T-60 and T-45 minutes. An unready load moves to the next wave instead of holding
              every co-shipper — the wave, not the individual consignment, is the unit of dispatch.
            </p>
          </div>
          <div className="flex gap-2">
            {(data?.checkpoints || ["T-60", "T-45"]).map((c: string) => (
              <span key={c} className="chip border-ink/20 bg-ink/[0.06] text-ink">{c}</span>
            ))}
          </div>
        </div>
      </Card>

      {!items.length ? (
        <EmptyState title="No waves waiting" body="Waves appear when a confirmed trip is approaching departure."
          icon={<Waves size={18} />} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((t: any) => {
            const v = t.verdict || {};
            return (
              <Card key={t.trip_id}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{t.trip_code}</span>
                      <Badge status={t.trip_status}>{titleCase(t.trip_status)}</Badge>
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-muted">
                      {t.reg_no} · {t.transporter_name}
                      {t.checkpoint?.minutes_to_departure !== null && t.checkpoint?.minutes_to_departure !== undefined &&
                        ` · ${Math.round(t.checkpoint.minutes_to_departure)} min to departure`}
                    </div>
                  </div>
                  <Badge status={v.action === "DISPATCH_WAVE" ? "verified" : v.action === "HOLD_WAVE" ? "rejected" : "pending"}>
                    {v.action?.replace(/_/g, " ")}
                  </Badge>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="text-ink-muted">readiness</span>
                    <span className="font-semibold text-ink">{Math.round((v.readiness_ratio || 0) * 100)}%</span>
                  </div>
                  <Progress value={v.readiness_ratio || 0} tone={(v.readiness_ratio || 0) >= 0.85 ? "emerald" : "amber"} />
                  <div className="mt-1 text-[10.5px] text-ink-muted">
                    {v.ready || 0} ready · {v.delayed || 0} delayed · {v.awaiting_check_in || 0} awaiting check-in
                  </div>
                </div>

                <div className="mt-3">
                  <Table head={["Shipment", "Ready from", "Status"]} dense>
                    {(t.shipments || []).map((s: any) => (
                      <tr key={s.id}>
                        <td className="td py-2 text-[11.5px] font-medium">{s.code}</td>
                        <td className="td py-2 text-[10.5px] text-ink-muted">
                          {s.ready_from ? new Date(s.ready_from).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="td py-2 text-[10.5px] capitalize">{s.status.replace(/_/g, " ")}</td>
                      </tr>
                    ))}
                  </Table>
                </div>

                <div className="mt-2 rounded-lg bg-soft px-2.5 py-1.5 text-[11px] text-ink-muted">
                  {v.note}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-soft/50">
        <div className="flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-ink" />
          <div className="text-[11.5px] leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">No penalty policy.</span> Any incentive, fee, penalty or rebate
            for unready loads is a pilot design question — it is deliberately not part of this build. Senders confirm
            readiness from their shipment detail screen, which updates the wave instantly.
          </div>
        </div>
      </Card>
      <SyntheticNote />
    </div>
  );
}
