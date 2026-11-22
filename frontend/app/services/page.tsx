import Link from "next/link";
import { ArrowRight, Brain, Clock, Compass, Layers, Route, Scale, Sparkles, Truck, Waves, Waypoints, Wrench } from "lucide-react";
import PublicShell from "@/components/PublicShell";

export const metadata = { title: "Services · CARGOX" };

const CORE = [
  { icon: Layers, name: "Shipment pooling", body: "Compatible consignments on one corridor are grouped into a single vehicle load, with hard commodity blockers checked first." },
  { icon: Truck, name: "Capacity exchange", body: "Transporters publish vehicle capacity and reserve price; the control tower matches published supply to real demand." },
  { icon: Route, name: "Route & time-window planning", body: "OR-Tools CVRPTW with a greedy fallback, so a plan always returns even without the solver installed." },
  { icon: Compass, name: "Destination advisor (ValueClock)", body: "Net realisation per mandi after travel, queue, retention loss and freight — not just the headline price per quintal." },
  { icon: Scale, name: "Fair cost split (ShapleySplit)", body: "Each sender pays by marginal contribution to the coalition, with a participation check proving nobody pays more than going alone." },
];

const INTELLIGENCE = [
  { icon: Brain, name: "HarvestPulse", body: "7–35 day harvest-ready volume bands (p10/p50/p90) per cluster, with a seasonal-naive baseline kept for comparison." },
  { icon: Clock, name: "DispatchSense", body: "GO / WAIT / SPLIT / CANCEL with the rupee benefit of waiting shown against the rupee cost of delay." },
  { icon: Waves, name: "MonsoonPass", body: "Road links classified by surface, width and stored seasonal risk so trucks are not planned onto kutcha tracks." },
  { icon: Waypoints, name: "CrossFlow-Backhaul", body: "Return loads offered only when incremental revenue clears incremental cost and the next committed trip is safe." },
  { icon: Wrench, name: "ShadowFleet-Heal", body: "On a breakdown: freeze unaffected commitments, repair only the affected loads, and require admin approval." },
  { icon: Sparkles, name: "AgroCompat", body: "Ethylene, moisture, odour, crushing and temperature rules decide what may share a vehicle." },
];

export default function ServicesPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 pb-4 pt-14 sm:px-6">
        <div className="label">Services & features</div>
        <h1 className="mt-2 max-w-3xl text-[32px] font-semibold leading-[1.14] tracking-[-0.025em] text-ink sm:text-[40px]">
          Coordination first. Intelligence in service of it.
        </h1>
        <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
          Every module below changes a decision that somebody actually makes in the workflow — not a dashboard tile.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CORE.map(({ icon: Icon, name, body }) => (
            <div key={name} className="card card-pad">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-forest/[0.07] text-forest"><Icon size={16} /></span>
              <div className="mt-3 text-[13px] font-semibold text-ink">{name}</div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Intelligence modules</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INTELLIGENCE.map(({ icon: Icon, name, body }) => (
            <div key={name} className="flex gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald/10 text-emerald-700"><Icon size={14} /></span>
              <div>
                <div className="text-[12.5px] font-semibold text-ink">{name}</div>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="card card-pad">
          <div className="text-[14px] font-semibold text-ink">What this deployment deliberately does not include</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              "Live GPS telemetry — trips advance by operator checkpoints.",
              "Real payments, credit or insurance — the ledger is fictional.",
              "Receiver or FPO accounts — destinations are external records.",
              "Live mandi price feeds — observations are synthetic and labelled.",
              "A commission model — no platform take rate is charged anywhere.",
              "Production identity verification — admin verification is manual.",
            ].map((t) => (
              <div key={t} className="rounded-lg bg-canvas px-3 py-2 text-[11.5px] text-ink-muted">{t}</div>
            ))}
          </div>
          <Link href="/contact" className="btn-outline btn-sm mt-4">Talk to the team <ArrowRight size={13} /></Link>
        </div>
      </section>
    </PublicShell>
  );
}
