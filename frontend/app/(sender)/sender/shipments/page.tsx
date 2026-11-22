"use client";

import { PackagePlus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, Table, Tabs,
} from "@/components/ui";
import { inr, kg, when } from "@/lib/api";
import { useApi, useDebounced } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending_admin_review", label: "In review" },
  { key: "awaiting_sender_approval", label: "Needs approval" },
  { key: "confirmed", label: "Confirmed" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
];

export default function MyShipments() {
  const { ready } = useGuard("sender");
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const search = useDebounced(q, 280);
  const path = `/shipments?page_size=100${tab !== "all" ? `&status=${tab}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`;
  const { data, loading, error, reload } = useApi<any>(path, [tab, search]);
  const all = useApi<any>("/shipments?page_size=200");

  if (!ready) return null;

  const counts = (all.data?.items || []).reduce((acc: Record<string, number>, s: any) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});
  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Tabs
            tabs={FILTERS.map((f) => ({
              key: f.key,
              label: f.label,
              count: f.key === "all" ? all.data?.total ?? 0 : counts[f.key] ?? 0,
            }))}
            active={tab}
            onChange={setTab}
          />
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input className="input py-2 pl-8 text-[12.5px]" placeholder="Search code, crop, village"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Link href="/sender/create" className="btn-primary btn-sm"><PackagePlus size={13} /> New</Link>
          </div>
        </div>

        {loading && !items.length ? (
          <div className="p-5"><Loading rows={3} /></div>
        ) : error ? (
          <div className="p-5"><ErrorNote message={error} onRetry={reload} /></div>
        ) : !items.length ? (
          <div className="p-5">
            <EmptyState
              title="No shipments here"
              body="Create a request and Admin will review it in the next planning window."
              action={<Link href="/sender/create" className="btn-primary btn-sm"><PackagePlus size={13} /> Create shipment</Link>}
            />
          </div>
        ) : (
          <Table head={["Shipment", "Commodity", "Quantity", "Route", "Ready", "Status", "Freight", ""]}>
            {items.map((s: any) => (
              <tr key={s.id} className="group transition-colors hover:bg-soft/60">
                <td className="td">
                  <Link href={`/sender/shipments/${s.id}`} className="font-semibold text-ink hover:underline">
                    {s.code}
                  </Link>
                  <div className="text-[10.5px] text-ink-muted">{when(s.created_at)}</div>
                </td>
                <td className="td capitalize">{s.commodity}</td>
                <td className="td">
                  {kg(s.quantity_kg)}
                  <div className="text-[10.5px] text-ink-muted">{s.quantity_quintal} q</div>
                </td>
                <td className="td">
                  <div className="text-[12.5px]">{s.pickup_village}</div>
                  <div className="text-[10.5px] text-ink-muted">→ {s.destination_name || "—"}</div>
                </td>
                <td className="td text-[12px]">{when(s.ready_from)}</td>
                <td className="td"><Badge status={s.status} dot /></td>
                <td className="td">
                  {inr(s.freight_estimate)}
                  {s.allocation && (
                    <div className={`text-[10.5px] ${s.allocation.approval === "approved" ? "text-emerald-600" : "text-amber-700"}`}>
                      {s.allocation.approval === "approved" ? `saved ${inr(s.allocation.saving)}` : s.allocation.approval}
                    </div>
                  )}
                </td>
                <td className="td text-right">
                  <Link href={`/sender/shipments/${s.id}`}
                    className="text-[11.5px] font-semibold text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink">
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <p className="px-1 text-[10.5px] text-ink-muted">
        Senders can only read their own records — the API enforces this on every request, not just in the UI.
      </p>
    </div>
  );
}
