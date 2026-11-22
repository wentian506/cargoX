import PublicShell from "@/components/PublicShell";

export const metadata = {
  title: "About · CARGOX",
  description: "Why CARGOX exists: fragmented rural freight, coordinated through one control tower.",
};

const PRINCIPLES = [
  ["Three roles, no more", "Sender, transporter, admin. Mandis, buyers and warehouses are external destinations, never platform accounts."],
  ["Admin-coordinated, not automatic", "Every pool, assignment, allocation and delivery verification passes through an accountable admin step."],
  ["Consent both ways", "A transporter accepts the work and the sender approves the freight share before anything is dispatched."],
  ["Labelled honesty", "Synthetic forecasts, modelled savings and demonstration data are marked as such everywhere they appear."],
];

const CONTEXT = [
  ["The problem", "A farmer with 40 quintals of wheat and a transporter with a half-empty tractor-trolley are in the same village, on the same morning, and never meet. Loads move one consignment per vehicle, empty kilometres are normal, and mandi queues destroy the value of a good price."],
  ["What CARGOX does", "It pools compatible consignments, matches them to published capacity, plans the route with time windows, decides whether waiting pays, splits the saving fairly, and recovers the plan when a vehicle breaks down — with an admin approving each step."],
  ["What it does not do", "It does not take a commission, promise prices, track vehicles by GPS, or hold your money. Those need partners, licences and field validation this build does not have."],
];

export default function AboutPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl px-4 pb-6 pt-14 sm:px-6">
        <div className="label">About</div>
        <h1 className="mt-2 max-w-3xl text-[34px] font-semibold leading-[1.12] tracking-[-0.025em] text-ink sm:text-[42px]">
          Rural freight fails in the gaps between people who never talk to each other.
        </h1>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          CARGOX is a coordination layer for village-to-mandi freight anywhere in India. It is built for the agricultural
          reality of small loads, shared vehicles, seasonal urgency and roads that change with the weather.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:px-6 lg:grid-cols-3">
        {CONTEXT.map(([title, body]) => (
          <div key={title} className="card card-pad">
            <div className="text-[13.5px] font-semibold text-ink">{title}</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">{body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="card overflow-hidden">
          <div className="border-b border-line px-6 py-5">
            <div className="text-[15px] font-semibold text-ink">Four operating principles</div>
            <div className="mt-1 text-[12px] text-ink-muted">These are enforced in the product, not just stated on a page.</div>
          </div>
          <div className="grid divide-line sm:grid-cols-2 sm:divide-x">
            {PRINCIPLES.map(([title, body]) => (
              <div key={title} className="border-b border-line px-6 py-5 last:border-b-0">
                <div className="text-[13px] font-semibold text-forest">{title}</div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="rounded-xl2 border border-line bg-surface p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[15px] font-semibold text-ink">Coverage: all of India</div>
            <span className="rounded-pill bg-accent-100 px-2.5 py-1 text-[10px] font-semibold text-ink">
              36 states &amp; UTs · 800+ districts · 4,300+ towns
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-ink-muted">
            CARGOX is not tied to one state or one crop. Every state, union territory, district and thousands of
            towns and villages are pickable as a pickup or a destination, and a consignment can carry any item name
            the sender types — a crop, a basket, a machine part — with their own written requirement alongside it.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              ["Seeded demonstration", "Twelve villages in the Khanna–Payal–Sahnewal cluster with Mandi Gobindgarh, Khanna Mandi, Ludhiana Grain Market and Jagraon as destinations and approved hubs at Khanna and Payal."],
              ["Honest data boundary", "Village coordinates and district geometry are real public reference data; queues, prices, forecasts and trips are synthetic and labelled in the app."],
            ].map(([t, b]) => (
              <div key={t} className="rounded-xl2 border border-line bg-soft/60 px-3.5 py-3">
                <div className="text-[11.5px] font-semibold text-ink">{t}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-ink-muted">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
