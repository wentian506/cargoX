"use client";

import { CheckCircle2, Container, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, Spinner, Stat, Table, Tabs, useToast,
} from "@/components/ui";
import { api, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function VehiclesAdmin() {
  const { ready } = useGuard("admin");
  const { push } = useToast();
  const [tab, setTab] = useState("all");
  const { data, loading, error, reload } = useApi<any>("/vehicles?status=all");
  const [busy, setBusy] = useState<string | null>(null);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];
  const list = tab === "pending" ? items.filter((v: any) => !v.verified) :
    tab === "verified" ? items.filter((v: any) => v.verified) : items;

  const verify = async (id: string, verified: boolean) => {
    setBusy(id);
    try {
      await api.post(`/vehicles/${id}/verify`, { verified });
      push("success", `Vehicle ${verified ? "verified" : "rejected"}`);
      reload();
    } catch (e: any) {
      push("error", "Action failed", e?.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-4">
        <Stat label="Vehicles" value={items.length} sub="registered fleet" icon={<Container size={15} />} />
        <Stat label="Verified" value={items.filter((v: any) => v.verified).length} sub="assignment eligible" tone="good" />
        <Stat label="Pending" value={items.filter((v: any) => !v.verified).length} sub="awaiting documents"
          tone={items.some((v: any) => !v.verified) ? "warn" : "default"} />
        <Stat label="Total payload" value={kg(items.filter((v: any) => v.verified).reduce((a: number, v: any) => a + v.payload_kg, 0))}
          sub="verified capacity" />
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <SectionHeader title="Vehicle management" subtitle="Document verification gates every assignment" />
          <Tabs tabs={[
            { key: "all", label: "All", count: items.length },
            { key: "pending", label: "Pending", count: items.filter((v: any) => !v.verified).length },
            { key: "verified", label: "Verified", count: items.filter((v: any) => v.verified).length },
          ]} active={tab} onChange={setTab} size="sm" />
        </div>
        {!list.length ? (
          <div className="px-5 pb-5"><EmptyState title="Nothing here" body="No vehicles in this view." icon={<Container size={18} />} /></div>
        ) : (
          <Table head={["Registration", "Class", "Payload", "Volume", "Owner", "Cost rate", "Availability", "Verification", "Actions"]}>
            {list.map((v: any) => (
              <tr key={v.id} className="transition-colors hover:bg-soft/60">
                <td className="td font-semibold tracking-wide">{v.reg_no}</td>
                <td className="td capitalize">{titleCase(v.vehicle_class)}</td>
                <td className="td">{kg(v.payload_kg)}</td>
                <td className="td">{v.volume_m3} m³</td>
                <td className="td text-[12px]">{v.transporter_name}</td>
                <td className="td">₹{v.cost_per_km}/km</td>
                <td className="td"><Badge status={v.availability} /></td>
                <td className="td">
                  <Badge status={v.verified ? "verified" : "pending"}>
                    {v.verified ? `verified ${v.verified_at ? when(v.verified_at) : ""}` : "pending"}
                  </Badge>
                </td>
                <td className="td">
                  <div className="flex gap-1.5">
                    {!v.verified ? (
                      <>
                        <button className="btn-emerald btn-sm" disabled={busy === v.id} onClick={() => verify(v.id, true)}>
                          {busy === v.id ? <Spinner size={12} /> : <CheckCircle2 size={12} />} Verify
                        </button>
                        <button className="btn-ghost btn-sm" disabled={busy === v.id} onClick={() => verify(v.id, false)}>
                          <XCircle size={12} /> Reject
                        </button>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                        <ShieldCheck size={12} /> eligible
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
