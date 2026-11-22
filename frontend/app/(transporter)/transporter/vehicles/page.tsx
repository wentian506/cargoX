"use client";

import { Plus, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import { Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, Table, useToast } from "@/components/ui";
import { api, kg, titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";
import { useState } from "react";

export default function MyVehicles() {
  const { ready } = useGuard("transporter");
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<any>("/vehicles");
  const [busy, setBusy] = useState<string | null>(null);

  if (!ready) return null;
  if (loading && !data) return <Loading rows={3} />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const items = data?.items || [];

  const setAvailability = async (id: string, availability: string) => {
    setBusy(id);
    try {
      await api.patch(`/vehicles/${id}`, { availability });
      push("success", "Availability updated");
      reload();
    } catch (e: any) {
      push("error", "Could not update", e?.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Fleet register</div>
          <h2 className="mt-1 text-[20px] font-semibold text-ink">{items.length} vehicle(s)</h2>
        </div>
        <Link href="/transporter/vehicles/add" className="btn-primary"><Plus size={14} /> Add vehicle</Link>
      </div>

      {!items.length ? (
        <EmptyState title="No vehicles registered" body="Add your first vehicle. Admin verifies documents before assignments unlock."
          icon={<Truck size={18} />} action={<Link href="/transporter/vehicles/add" className="btn-primary btn-sm">Add vehicle</Link>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((v: any) => (
            <Card key={v.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[15px] font-semibold tracking-wide text-ink">{v.reg_no}</div>
                  <div className="text-[11.5px] text-ink-muted">{titleCase(v.vehicle_class)} · {titleCase(v.body_type)}</div>
                </div>
                <Badge status={v.verified ? "verified" : "pending"}>{v.verified ? "verified" : "pending"}</Badge>
              </div>

              <div className="mt-3 space-y-1.5 text-[12px]">
                {[
                  ["Payload", kg(v.payload_kg)],
                  ["Volume", `${v.volume_m3} m³`],
                  ["Operating area", v.operating_districts || "—"],
                  ["Cost rate", `₹${v.cost_per_km}/km`],
                  ["Added", when(v.created_at)],
                ].map(([k, val]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-ink-muted">{k}</span>
                    <span className="font-medium text-ink">{val}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <Badge status={v.availability} dot>{titleCase(v.availability)}</Badge>
                <div className="flex gap-1.5">
                  {v.availability !== "available" && (
                    <button className="btn-outline btn-sm" disabled={busy === v.id}
                      onClick={() => setAvailability(v.id, "available")}>Set available</button>
                  )}
                  {v.availability === "available" && (
                    <button className="btn-ghost btn-sm" disabled={busy === v.id}
                      onClick={() => setAvailability(v.id, "maintenance")}>Maintenance</button>
                  )}
                  <Link href="/transporter/capacity" className="btn-emerald btn-sm">Publish capacity</Link>
                </div>
              </div>

              {!v.verified && (
                <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10.5px] text-amber-800">
                  <ShieldCheck size={11} className="mt-0.5 shrink-0" />
                  Documents are awaiting Admin verification. Capacity cannot be published until verified.
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <p className="px-1 text-[10.5px] text-ink-muted">
        Vehicle documents are stored as references in this build; wire Supabase Storage signed URLs in production.
      </p>
    </div>
  );
}
