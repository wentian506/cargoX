"use client";

import { ShieldCheck, Truck, UserX } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, Spinner, Stat, Table, useToast,
} from "@/components/ui";
import { api, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function TransportersAdmin() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/transporters");
  const [busy, setBusy] = useState<string | null>(null);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];

  const action = async (id: string, kind: "verify" | "suspend" | "reactivate") => {
    setBusy(id + kind);
    try {
      if (kind === "verify") await api.post(`/transporters/${id}/verify`, { verified: true });
      else await api.post(`/admin/users/${id}/status`, { action: kind, reason: "Admin action" });
      push("success", `Transporter ${kind}d`);
      reload();
    } catch (e: any) {
      push("error", "Action failed", e?.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Stat label="Transporters" value={items.length} sub="registered accounts" icon={<Truck size={15} />} />
        <Stat label="Verified" value={items.filter((t: any) => t.verification_status === "verified").length}
          sub="eligible for assignment" tone="good" icon={<ShieldCheck size={15} />} />
        <Stat label="Verified vehicles" value={items.reduce((a: number, t: any) => a + (t.verified_vehicles || 0), 0)}
          sub={`${items.reduce((a: number, t: any) => a + (t.vehicles || 0), 0)} total`} />
      </div>

      <Card pad={false}>
        <div className="px-5 py-4">
          <SectionHeader title="Transporter accounts" subtitle="Identity, fleet verification and assignment history" />
        </div>
        {!items.length ? (
          <div className="px-5 pb-5"><EmptyState title="No transporters" body="No accounts registered yet." icon={<Truck size={18} />} /></div>
        ) : (
          <Table head={["Transporter", "Contact", "Fleet", "Assignments", "Rating", "Verification", "Account", "Actions"]}>
            {items.map((t: any) => (
              <tr key={t.id} className="transition-colors hover:bg-soft/60">
                <td className="td">
                  <div className="font-semibold text-ink">{t.company_name || t.full_name}</div>
                  <div className="text-[10.5px] text-ink-muted">{t.full_name} · joined {when(t.created_at)}</div>
                </td>
                <td className="td text-[11.5px]">
                  {t.email}
                  <div className="text-ink-muted">{t.mobile}</div>
                </td>
                <td className="td">
                  {t.verified_vehicles}/{t.vehicles}
                  <div className="text-[10.5px] text-ink-muted">verified / total</div>
                </td>
                <td className="td">
                  {t.confirmed}/{t.assignments}
                  <div className="text-[10.5px] text-ink-muted">confirmed / total</div>
                </td>
                <td className="td">{t.rating ? t.rating.toFixed(1) : "—"}</td>
                <td className="td">
                  <Badge status={t.verification_status === "verified" ? "verified" : t.verification_status === "rejected" ? "rejected" : "pending"}>
                    {t.verification_status}
                  </Badge>
                </td>
                <td className="td"><Badge status={t.status} /></td>
                <td className="td">
                  <div className="flex flex-wrap gap-1.5">
                    {t.verification_status !== "verified" && (
                      <button className="btn-emerald btn-sm" disabled={busy === t.id + "verify"}
                        onClick={() => action(t.id, "verify")}>
                        {busy === t.id + "verify" ? <Spinner size={12} /> : <ShieldCheck size={12} />} Verify
                      </button>
                    )}
                    {t.status === "active" ? (
                      <button className="btn-ghost btn-sm" onClick={() => action(t.id, "suspend")}>
                        <UserX size={12} /> Suspend
                      </button>
                    ) : (
                      <button className="btn-outline btn-sm" onClick={() => action(t.id, "reactivate")}>Reactivate</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card className="bg-soft/50">
        <p className="text-[11.5px] leading-relaxed text-ink-muted">
          Verifying a transporter confirms identity and unlocks assignment eligibility. Individual vehicles still need
          their own document verification on the Vehicles screen.
        </p>
      </Card>
    </div>
  );
}
