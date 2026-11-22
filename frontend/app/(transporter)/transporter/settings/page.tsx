"use client";

import { BadgeCheck, FileCheck2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Card, Field, SectionHeader, Spinner, useToast } from "@/components/ui";
import { api, titleCase } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard, useSession } from "@/lib/session";
import { STATE_NAMES, districtsOf } from "@/lib/geo/india";

export default function TransporterSettings() {
  const { ready } = useGuard("transporter");
  const { user, refresh } = useSession();
  const { push } = useToast();
  const me = useApi<any>("/auth/me");
  const vehicles = useApi<any>("/vehicles");
  const [f, setF] = useState({ full_name: "", mobile: "", district: "", state: "", preferred_language: "pa" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setF({
        full_name: user.full_name || "", mobile: user.mobile || "",
        district: user.district || "Patna", state: user.state || "Bihar",
        preferred_language: user.preferred_language || "pa",
      });
    }
  }, [user]);

  if (!ready) return null;

  const tp = me.data?.transporter;

  const save = async () => {
    setBusy(true);
    try {
      await api.patch("/auth/me", f);
      await refresh();
      push("success", "Profile updated");
    } catch (e: any) {
      push("error", "Could not save", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <SectionHeader title="Profile" subtitle="Shown to Admin when verifying your account" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name / company"><input className="input" value={f.full_name}
            onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Mobile number"><input className="input" value={f.mobile}
            onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
          <Field label="Email" hint="Managed through account verification">
            <input className="input bg-soft" value={user?.email || ""} disabled /></Field>
          <Field label="Preferred language">
            <select className="select" value={f.preferred_language}
              onChange={(e) => setF({ ...f, preferred_language: e.target.value })}>
              <option value="pa">ਪੰਜਾਬੀ</option>
              <option value="hi">हिन्दी</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="State / UT">
            <select className="select" value={f.state}
              onChange={(e) => setF({ ...f, state: e.target.value, district: districtsOf(e.target.value)[0] || "" })}>
              {STATE_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="District"><input className="input" value={f.district}
            onChange={(e) => setF({ ...f, district: e.target.value })} /></Field>
        </div>
        <div className="mt-5"><button className="btn-primary" disabled={busy} onClick={save}>
          {busy ? <Spinner /> : null} Save changes</button></div>
      </Card>

      <div className="space-y-4">
        <Card>
          <SectionHeader title="Verification" />
          <div className="space-y-2.5 text-[12.5px]">
            <div className="flex justify-between"><span className="text-ink-muted">Account</span>
              <Badge status={tp?.verification_status === "verified" ? "verified" : "pending"}>
                {tp?.verification_status || "pending"}
              </Badge></div>
            <div className="flex justify-between"><span className="text-ink-muted">Company</span>
              <span className="font-medium text-ink">{tp?.company_name || "—"}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Fleet size</span>
              <span className="font-medium text-ink">{tp?.fleet_size ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Email verified</span>
              <span className="inline-flex items-center gap-1 font-medium text-ink">
                {user?.verified ? <><BadgeCheck size={13} className="text-emerald" /> verified</> : "pending"}
              </span></div>
          </div>
        </Card>

        <Card pad={false}>
          <div className="px-5 py-4"><SectionHeader title="Vehicle documents" /></div>
          <div>
            {(vehicles.data?.items || []).map((v: any) => (
              <div key={v.id} className="flex items-center justify-between border-t border-line px-5 py-3">
                <div>
                  <div className="text-[12.5px] font-semibold text-ink">{v.reg_no}</div>
                  <div className="text-[10.5px] text-ink-muted">{titleCase(v.vehicle_class)} · RC / insurance / permit / fitness</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
                  {v.verified
                    ? <><FileCheck2 size={13} className="text-emerald" /> <span className="text-emerald-600">verified</span></>
                    : <span className="text-amber-700">pending</span>}
                </span>
              </div>
            ))}
            {!(vehicles.data?.items || []).length && (
              <div className="border-t border-line px-5 py-6 text-center text-[12px] text-ink-muted">
                No vehicles registered yet.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-ink" />
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              You can only see your own vehicles and assignments released to you by Admin. Document storage uses
              private references; public links are never generated.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
