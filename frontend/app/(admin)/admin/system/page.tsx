"use client";

import { Database, FileSearch, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import {
  Badge, Card, EmptyState, ErrorNote, Loading, SectionHeader, Stat, Table, Tabs, SyntheticNote,
} from "@/components/ui";
import { titleCase, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

export default function SystemPage() {
  const { ready } = useGuard("admin");
  const system = useApi<any>("/admin/system");
  const audit = useApi<any>("/admin/audit?page_size=50");
  const [tab, setTab] = useState("audit");

  if (!ready) return null;
  if (system.loading && !system.data) return <Loading rows={3} />;
  if (system.error) return <ErrorNote message={system.error} onRetry={system.reload} />;

  const s = system.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Database engine" value={s.db_dialect} sub="SQLite (dev) / Postgres (prod)" icon={<Database size={15} />} />
        <Stat label="Profiles" value={s.tables.profiles} sub="all roles" icon={<Users size={15} />} />
        <Stat label="Audit entries" value={s.tables.audit_logs} sub="append-only trail" icon={<FileSearch size={15} />} />
        <Stat label="Simulation runs" value={s.tables.simulation_runs} sub="reproducible" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Role model" subtitle="Exactly three authenticating roles" />
          <div className="space-y-2">
            {Object.entries(s.roles).map(([role, state]: any) => (
              <div key={role} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                <span className="text-[12.5px] font-semibold capitalize text-ink">{role}</span>
                <Badge status={state === "active" ? "verified" : "rejected"}>{state}</Badge>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-muted">
            Receiver and FPO are not CARGOX roles. Destination buyers, mandis and warehouses are recorded as external
            shipment destinations only.
          </p>
        </Card>

        <Card>
          <SectionHeader title="Feature flags" subtitle="Honest capability state" />
          <div className="space-y-2">
            {Object.entries(s.feature_flags).map(([k, v]: any) => (
              <div key={k} className="flex items-center justify-between border-b border-line pb-1.5 text-[12px] last:border-0">
                <span className="capitalize text-ink-muted">{k.replace(/_/g, " ")}</span>
                <span className="font-medium text-ink">{typeof v === "boolean" ? (v ? "enabled" : "disabled") : v}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-soft px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
            {s.data_policy}
          </div>
        </Card>
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <SectionHeader title="Audit log" subtitle="Every administrative and account action" />
          <Tabs tabs={[{ key: "audit", label: "Activity" }, { key: "tables", label: "Tables" }]} active={tab} onChange={setTab} size="sm" />
        </div>

        {tab === "audit" ? (
          audit.loading && !audit.data ? <Loading rows={2} /> : !audit.data?.items?.length ? (
            <div className="px-5 pb-5"><EmptyState title="No audit entries" body="Actions appear here as they occur."
              icon={<ShieldCheck size={18} />} /></div>
          ) : (
            <Table head={["When", "Actor", "Role", "Action", "Entity", "Entity ID"]}>
              {(audit.data.items || []).map((a: any) => (
                <tr key={a.id} className="transition-colors hover:bg-soft/60">
                  <td className="td text-[11px] text-ink-muted">{when(a.created_at)}</td>
                  <td className="td text-[11.5px] font-mono">{a.actor_id || "system"}</td>
                  <td className="td"><Badge status={a.actor_role === "admin" ? "approved" : "verified"}>{a.actor_role || "—"}</Badge></td>
                  <td className="td text-[12px] font-medium">{a.action}</td>
                  <td className="td text-[11.5px] capitalize text-ink-muted">{a.entity_type?.replace(/_/g, " ")}</td>
                  <td className="td font-mono text-[10.5px] text-ink-muted">{a.entity_id}</td>
                </tr>
              ))}
            </Table>
          )
        ) : (
          <Table head={["Table", "Rows"]}>
            {Object.entries(s.tables).map(([t, n]: any) => (
              <tr key={t}>
                <td className="td font-mono text-[11.5px]">{t}</td>
                <td className="td">{n}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <SyntheticNote>{s.data_policy}</SyntheticNote>
    </div>
  );
}
