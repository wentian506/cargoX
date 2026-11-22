"use client";

import { HelpCircle, LifeBuoy, Send } from "lucide-react";
import { useState } from "react";
import { Badge, Card, EmptyState, Field, SectionHeader, Spinner, useToast } from "@/components/ui";
import { api, when } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useGuard } from "@/lib/session";

const FAQ = [
  ["Why does Admin review my shipment first?", "CARGOX is a coordinated model, not an open marketplace. Admin verifies details, groups compatible consignments and matches capacity — which is what makes pooled pricing possible."],
  ["Can my freight share be more than travelling alone?", "No. ShapleySplit enforces a participation check: if your allocated share would exceed your standalone cost, that coalition is not formed."],
  ["Can I change the destination after submitting?", "Yes, with Admin coordination and your explicit approval. CARGOX never silently redirects produce."],
  ["Why is my shipment not dispatched immediately?", "DispatchSense weighs the benefit of waiting for more compatible cargo against holding, quality-loss, missed-window and vehicle-idle cost. Waiting only happens when it pays."],
  ["Is the tracking map live GPS?", "No. CARGOX records operational checkpoints (loading confirmed, departed, at hub, delivered). It never fabricates a vehicle position."],
  ["What happens if my vehicle cancels?", "Admin runs ShadowFleet-Heal: unaffected loads freeze, affected loads are released, standby alternatives are proposed with the extra cost and delay shown, then Admin approves."],
];

export default function HelpPage() {
  const { ready } = useGuard("sender");
  const { push } = useToast();
  const tickets = useApi<any>("/support/tickets");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/support/tickets", { subject, body });
      push("success", "Ticket raised", "Admin will respond in the support queue.");
      setSubject(""); setBody("");
      tickets.reload();
    } catch (e: any) {
      push("error", "Could not raise ticket", e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <Card>
          <SectionHeader title="Frequently asked" eyebrow="Help centre" />
          <div className="divide-y divide-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-ink">{q}</span>
                  <span className="text-ink-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">{a}</p>
              </details>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Raise a support ticket" subtitle="Goes directly to the Admin support queue" />
          <div className="grid gap-3">
            <Field label="Subject" required>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Pickup window conflict for tomorrow's load" />
            </Field>
            <Field label="Details" required>
              <textarea className="input min-h-[96px]" value={body} onChange={(e) => setBody(e.target.value)}
                placeholder="Include the shipment code and what you need changed." />
            </Field>
            <button className="btn-primary w-fit" disabled={!subject || !body || busy} onClick={submit}>
              {busy ? <Spinner /> : <Send size={14} />} Submit ticket
            </button>
          </div>
        </Card>
      </div>

      <Card pad={false}>
        <div className="px-5 py-4">
          <SectionHeader title="Your tickets" />
        </div>
        {!tickets.data?.items?.length ? (
          <div className="px-5 pb-5"><EmptyState title="No tickets" body="You have not raised any support requests."
            icon={<LifeBuoy size={18} />} /></div>
        ) : (
          <div>
            {tickets.data.items.map((t: any) => (
              <div key={t.id} className="border-t border-line px-5 py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-ink">{t.subject}</span>
                  <Badge status={t.status === "open" ? "pending" : "verified"}>{t.status}</Badge>
                </div>
                <p className="mt-1 text-[11.5px] text-ink-muted">{t.body}</p>
                {t.resolution && (
                  <div className="mt-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
                    {t.resolution}
                  </div>
                )}
                <div className="mt-1 text-[10.5px] text-ink-muted/80">{when(t.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
