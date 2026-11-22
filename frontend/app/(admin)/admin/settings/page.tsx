"use client";

import { Database, Info, Lock, ShieldCheck } from "lucide-react";
import { Badge, Card, SectionHeader, SyntheticNote } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useGuard, useSession } from "@/lib/session";

const POLICIES = [
  ["Roles", "Exactly three: sender, transporter, admin. Admin is invitation-only."],
  ["Data isolation", "Senders read only their own shipments. Transporters read only their own vehicles and released assignments."],
  ["Consent", "No silent reassignment. Sender approval and transporter acceptance are both required before dispatch."],
  ["Honesty", "Synthetic and model outputs are labelled in the UI and in API responses."],
  ["Payments", "Fictional credit ledger only. No real money or insurance without regulated partners."],
  ["Retention", "Operational records retained for audit; personal data minimised and deletable on request."],
];

export default function AdminSettings() {
  const { ready } = useGuard("admin");
  const { user } = useSession();
  const config = useApi<any>("/config");
  const system = useApi<any>("/admin/system");

  if (!ready) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <Card>
          <SectionHeader title="Platform policy" subtitle="Rules the product enforces, not aspirations" />
          <div className="divide-y divide-line">
            {POLICIES.map(([k, v]) => (
              <div key={k} className="flex gap-3 py-2.5">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald" />
                <div>
                  <div className="text-[12.5px] font-semibold text-ink">{k}</div>
                  <div className="text-[11.5px] leading-snug text-ink-muted">{v}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Intelligence modules" subtitle="Registered in this deployment" />
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(config.data?.modules || []).map((m: string) => (
              <div key={m} className="flex items-center gap-2 rounded-lg bg-soft px-2.5 py-1.5 text-[11.5px]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald" /> {m}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <SectionHeader title="Your account" />
          <div className="space-y-2 text-[12.5px]">
            <div className="flex justify-between"><span className="text-ink-muted">Name</span><span className="font-medium text-ink">{user?.full_name}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Email</span><span className="font-medium text-ink">{user?.email}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Role</span><Badge status="approved">admin</Badge></div>
            <div className="flex justify-between"><span className="text-ink-muted">Provisioned</span>
              <span className="text-[11px] text-emerald-600">invitation only</span></div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-soft px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
            <Lock size={12} className="mt-0.5 shrink-0" />
            Multi-factor authentication is enabled per deployment in Supabase Auth. Admin accounts cannot be created
            through public registration.
          </div>
        </Card>

        <Card>
          <SectionHeader title="Deployment" />
          <div className="space-y-2 text-[12px]">
            {[
              ["Frontend", "Next.js on Vercel"],
              ["Backend", "FastAPI on Render"],
              ["Database", "PostgreSQL + PostGIS on Supabase"],
              ["Auth", "Supabase Auth (JWT)"],
              ["Storage", "Supabase Storage (signed URLs)"],
              ["Realtime", "Supabase Realtime / SSE"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-line pb-1.5 last:border-0">
                <span className="text-ink-muted">{k}</span>
                <span className="font-medium text-ink">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-muted">
            <Database size={12} /> current engine: {system.data?.db_dialect || "—"}
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-2.5">
            <Info size={14} className="mt-0.5 shrink-0 text-ink" />
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              This build runs a full coordination workflow end to end. Integrations that require partners, licences or
              live feeds are explicitly labelled as disabled rather than simulated silently.
            </p>
          </div>
        </Card>
        <SyntheticNote />
      </div>
    </div>
  );
}
