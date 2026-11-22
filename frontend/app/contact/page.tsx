"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import PublicShell from "@/components/PublicShell";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function ContactPage() {
  const { user } = useSession();
  const [form, setForm] = useState({ subject: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/support/tickets", form);
      setDone(true);
      setForm({ subject: "", body: "" });
    } catch (err: any) {
      setError(err?.message || "Could not send your message");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 pb-4 pt-14 sm:px-6">
        <div className="label">Contact</div>
        <h1 className="mt-2 text-[32px] font-semibold leading-[1.14] tracking-[-0.025em] text-ink sm:text-[40px]">
          Reach the control tower
        </h1>
        <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
          Messages sent here become support tickets in the admin queue, so they are tracked to resolution rather than
          lost in an inbox.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="card card-pad">
          {done ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 size={26} className="mb-3 text-emerald" />
              <div className="text-[14px] font-semibold text-ink">Ticket created</div>
              <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-ink-muted">
                An admin will respond from the support queue. You can follow your own tickets from the help centre in
                your dashboard.
              </p>
              <button className="btn-outline btn-sm mt-4" onClick={() => setDone(false)}>Send another message</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <div className="label mb-1.5">Subject</div>
                <input className="input" required value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="e.g. Pickup window change for a wheat lot" />
              </div>
              <div>
                <div className="label mb-1.5">Message</div>
                <textarea className="input min-h-[130px]" required value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Describe what you need help with." />
              </div>
              {!user && (
                <div className="rounded-xl bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-ink-muted">
                  You are not signed in. Contact messages require a signed-in account so the reply reaches you —{" "}
                  <a href="/login" className="font-semibold text-forest hover:underline">sign in</a> first, or{" "}
                  <a href="/register" className="font-semibold text-forest hover:underline">create an account</a>.
                </div>
              )}
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
              <button className="btn-primary" disabled={busy || !user}>
                {busy ? <Spinner /> : <Send size={14} />} Send to support
              </button>
            </form>
          )}
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <div className="text-[13px] font-semibold text-ink">Control tower</div>
            <div className="mt-2 space-y-1 text-[12px] text-ink-muted">
              <div>Operating across all 36 states &amp; union territories</div>
              <div>Senders, transporters and admins coordinated from one queue</div>
              <div>Typical response: next working day (pilot staffing)</div>
            </div>
          </div>
          <div className="card card-pad">
            <div className="text-[13px] font-semibold text-ink">Frequent questions</div>
            <div className="mt-2 space-y-2.5">
              {[
                ["Can I register as a buyer or FPO?", "No. CARGOX has exactly three roles. Mandis, buyers and warehouses are recorded as external shipment destinations."],
                ["How do I become an admin?", "You do not — admin accounts are provisioned by invitation only and never through public registration."],
                ["Who decides my freight cost?", "The platform computes a fair share; you approve it. Nothing is dispatched without your approval."],
              ].map(([q, a]) => (
                <div key={q} className="border-b border-line pb-2 last:border-0">
                  <div className="text-[12px] font-semibold text-ink">{q}</div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
