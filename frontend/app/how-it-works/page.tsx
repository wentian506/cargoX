import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PublicShell from "@/components/PublicShell";

export const metadata = { title: "How it works · CARGOX" };

const SENDER_STEPS = [
  ["1", "Create the consignment", "Commodity, quantity, pickup village, ready window, destination and handling needs. VoiceBoli can draft it from a spoken sentence in Punjabi, Hindi or English; nothing is submitted without your confirmation. Any state, district, town or village can be a pickup or destination, and cargo lines accept any item name."],
  ["2", "Admin review & pooling", "The control tower checks details, then pools your load with compatible consignments on the same corridor. AgroCompat blocks combinations that would damage goods."],
  ["3", "Freight share approval", "Before anything moves, you see the coalition cost, your Shapley share and your standalone cost. If pooling would cost you more, you are not forced into it."],
  ["4", "Readiness & dispatch", "Confirm the load is ready at T-60 / T-45. Admin approves the wave, the transporter starts the trip and you follow every checkpoint."],
  ["5", "Delivery verification", "Admin records proof of delivery and the external acknowledgement. Only then is the consignment marked delivered."],
];

const TRANSPORTER_STEPS = [
  ["1", "Register fleet & publish capacity", "Each vehicle is registered with payload, volume, body type and cost per km, and is verified by admin before it can be assigned."],
  ["2", "Receive coordinated offers", "Assignments arrive with route, stops, load and revenue already computed — not a phone call and a negotiation."],
  ["3", "Accept or decline", "You can decline. Nothing is forced; the control tower re-plans. Accepting is what unlocks trip execution."],
  ["4", "Execute the trip", "Start, confirm loading, report arrival at the transfer hub, and confirm delivery. Each action is a checkpoint, not GPS tracking."],
  ["5", "Return load", "CrossFlow offers a return load only when the extra revenue clears the extra cost and the next committed trip is not put at risk."],
];

const ADMIN_STEPS = [
  ["Review", "Approve, reject or request information on incoming consignments."],
  ["Pool", "Auto-pool compatible loads on the same corridor, with hard blockers surfaced first."],
  ["Match", "Search published capacity for verified vehicles that can actually cover the demand."],
  ["Plan", "Solve the route with OR-Tools time windows, single-echelon or two-stage via a hub."],
  ["Dispatch", "GO / WAIT / SPLIT / CANCEL with the rupee trade-off shown before you decide."],
  ["Allocate", "Split the coalition saving by marginal contribution and prove no sender loses."],
  ["Assign", "Create the assignment; the sender approves the share and the transporter accepts."],
  ["Verify", "Record proof of delivery, shortage and damage, then close the shipment."],
];

export default function HowItWorksPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 pb-4 pt-14 sm:px-6">
        <div className="label">How it works</div>
        <h1 className="mt-2 max-w-3xl text-[32px] font-semibold leading-[1.14] tracking-[-0.025em] text-ink sm:text-[40px]">
          One consignment, five steps, three accountable parties.
        </h1>
        <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-muted">
          The workflow below is the same one the platform enforces in code. Statuses cannot skip a step: an assignment
          cannot be confirmed until the sender approves the share and the transporter accepts the work.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-3">
        {[
          ["For senders", SENDER_STEPS],
          ["For transporters", TRANSPORTER_STEPS],
        ].map(([title, steps]: any) => (
          <div key={title} className="card p-5 lg:col-span-1">
            <div className="text-[13.5px] font-semibold text-ink">{title}</div>
            <ol className="mt-3 space-y-3">
              {steps.map(([n, head, body]: any) => (
                <li key={n} className="flex gap-2.5">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-forest text-[10px] font-bold text-lime">{n}</span>
                  <div>
                    <div className="text-[12.5px] font-semibold text-ink">{head}</div>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}

        <div className="card p-5">
          <div className="text-[13.5px] font-semibold text-ink">Inside the control tower</div>
          <ol className="mt-3 space-y-2">
            {ADMIN_STEPS.map(([head, body]: any) => (
              <li key={head} className="border-b border-line pb-2 last:border-0">
                <div className="text-[12.5px] font-semibold text-ink">{head}</div>
                <p className="text-[11.5px] leading-snug text-ink-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="rounded-xl2 border border-line bg-forest p-7 text-white">
          <div className="text-[16px] font-semibold">Consent is a state, not a promise</div>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-white/70">
            Each step writes a record. Sender approval, transporter acceptance, admin confirmation and delivery
            verification are separate rows with timestamps and actors, so any dispute can be reconstructed from the
            audit trail rather than argued from memory.
          </p>
          <Link href="/register" className="btn-emerald btn-sm mt-4">
            Create an account <ArrowRight size={13} />
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
