"use client";

import { BadgeCheck, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Card, Field, SectionHeader, Spinner, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useGuard, useSession } from "@/lib/session";

const LANGS = [
  ["en", "English"],
  ["hi", "हिन्दी"],
  ["pa", "ਪੰਜਾਬੀ"],
  ["bn", "বাংলা"],
  ["mr", "मराठी"],
  ["gu", "ગુજરાતી"],
  ["ta", "தமிழ்"],
  ["te", "తెలుగు"],
  ["kn", "ಕನ್ನಡ"],
  ["ml", "മലയാളം"],
  ["or", "ଓଡ଼ିଆ"],
  ["as", "অসমীয়া"],
];
import { STATE_NAMES, districtsOf } from "@/lib/geo/india";

export default function SenderSettings() {
  const { ready } = useGuard("sender");
  const { user, refresh } = useSession();
  const { push } = useToast();
  const [f, setF] = useState({ full_name: "", mobile: "", district: "", state: "", preferred_language: "en" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setF({
        full_name: user.full_name || "",
        mobile: user.mobile || "",
        district: user.district || "Patna",
        state: user.state || "Bihar",
        preferred_language: user.preferred_language || "en",
      });
    }
  }, [user]);

  if (!ready) return null;

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
        <SectionHeader title="Profile" subtitle="Used on shipment records and operational notifications" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><input className="input" value={f.full_name}
            onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Mobile number"><input className="input" value={f.mobile}
            onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
          <Field label="Email" hint="Email changes are handled through account verification">
            <input className="input bg-soft" value={user?.email || ""} disabled /></Field>
          <Field label="Preferred language">
            <select className="select" value={f.preferred_language}
              onChange={(e) => setF({ ...f, preferred_language: e.target.value })}>
              {LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="State / UT">
            <select className="select" value={f.state}
              onChange={(e) => setF({ ...f, state: e.target.value, district: districtsOf(e.target.value)[0] || "" })}>
              {STATE_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="District">
            <select className="select" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })}>
              {districtsOf(f.state).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : null} Save changes</button>
          <span className="text-[11px] text-ink-muted">Changes are audit-logged.</span>
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <SectionHeader title="Account" />
          <div className="space-y-2.5 text-[12.5px]">
            <div className="flex justify-between"><span className="text-ink-muted">Role</span><Badge status="active">sender</Badge></div>
            <div className="flex justify-between"><span className="text-ink-muted">Status</span><Badge status={user?.status} /></div>
            <div className="flex justify-between"><span className="text-ink-muted">Email verified</span>
              <span className="inline-flex items-center gap-1 font-medium text-ink">
                {user?.verified ? <><BadgeCheck size={13} className="text-emerald" /> verified</> : "pending"}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-ink-muted">Account ID</span>
              <span className="font-mono text-[11px] text-ink-muted">{user?.id}</span></div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-ink" />
            <div>
              <div className="text-[12.5px] font-semibold text-ink">Your data boundary</div>
              <ul className="mt-1.5 space-y-1 text-[11.5px] leading-snug text-ink-muted">
                <li>• You can only read your own shipment records.</li>
                <li>• Your identity is never shown in aggregate forecasts.</li>
                <li>• Location and phone data are used only to coordinate your shipments.</li>
                <li>• You may request deletion through Admin support.</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
