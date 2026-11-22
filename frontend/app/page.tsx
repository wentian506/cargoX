"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Gauge,
  MapPin,
  Menu,
  PackageCheck,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Split,
  Truck,
  Users,
  Warehouse,
  Waves,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import Logo, { PitchMark } from "@/components/Logo";
import { Modal } from "@/components/ui";
import { homeFor, useSession } from "@/lib/session";

const NAV = [
  { href: "#top", label: "Home" },
  { href: "#about", label: "About us" },
  { href: "#solutions", label: "Services" },
  { href: "#industries", label: "Industries" },
  { href: "#careers", label: "Careers" },
];

const SLIDES = [
  {
    kicker: "Rural freight coordination",
    title: ["Smarter Transport.", "Faster Deliveries.", "Nationwide Reach."],
    body:
      "Experience technology-driven transport solutions built for speed, safety, and efficiency — from village pickups to mandi delivery, coordinated end to end.",
    stats: [
      ["36", "States & UTs covered"],
      ["801", "Districts mapped"],
      ["4,335", "Towns & villages"],
    ],
  },
  {
    kicker: "Fleet + load matching",
    title: ["Right Load.", "Right Vehicle.", "Right Time."],
    body:
      "Pool compatible consignments, match them to published capacity and let Admin release the trip only when sender and transporter both agree.",
    stats: [
      ["98%", "Load factor on pooled runs"],
      ["17.7%", "Lower cost per quintal"],
      ["4.4%", "Empty-km on the pilot corridor"],
    ],
  },
  {
    kicker: "Fair pricing, explained",
    title: ["Every Rupee.", "Traced To Cost.", "Shared Fairly."],
    body:
      "ShapleySplit allocates the pooled route cost by marginal contribution — with an explicit no-worse-than-solo check on every consignment.",
    stats: [
      ["0", "Senders worse off than solo"],
      ["₹990", "Saved on the demo coalition"],
      ["2", "Consignments, one trip"],
    ],
  },
];

export default function LandingPage() {
  const { user } = useSession();
  const [menu, setMenu] = useState(false);
  const [track, setTrack] = useState(false);
  const [slide, setSlide] = useState(0);
  const s = SLIDES[slide];

  useEffect(() => {
    const t = setInterval(() => setSlide((v) => (v + 1) % SLIDES.length), 7000);
    return () => clearInterval(t);
  }, []);

  const go = (d: number) => setSlide((v) => (v + d + SLIDES.length) % SLIDES.length);

  return (
    <div id="top" className="min-h-screen bg-night text-white">
      {/* ===================================================== floating nav -- */}
      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-5">
        <div className="mx-auto flex max-w-[1320px] items-center gap-2">
          {/* left pill: links */}
          <div className="hidden items-center rounded-pill bg-night-700/85 p-1.5 shadow-cinema backdrop-blur-xl md:flex">
            {NAV.map((n) => (
              <a
                key={n.label}
                href={n.href}
                className={
                  n.label === "Home"
                    ? "rounded-pill bg-accent px-4 py-2 text-[12px] font-medium text-ink"
                    : "rounded-pill px-4 py-2 text-[12px] font-medium text-white/70 transition-colors hover:text-white"
                }
              >
                {n.label}
              </a>
            ))}
          </div>

          {/* centre: logo card */}
          <Link
            href="/"
            className="mx-auto flex items-center gap-2.5 rounded-pill bg-white px-5 py-2.5 shadow-cinema sm:px-7 sm:py-3"
          >
            <PitchMark size={30} color="#171717" />
            <span className="leading-none">
              <span className="block text-[17px] font-semibold tracking-[-0.01em] text-ink">
                cargo<span className="font-bold">X</span>
              </span>
              <span className="mt-0.5 block text-[7.5px] font-medium uppercase tracking-[0.28em] text-ink-faint">
                rural logistics
              </span>
            </span>
          </Link>

          {/* right: actions */}
          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={() => setTrack(true)}
              className="flex items-center gap-2 rounded-pill bg-white py-1.5 pl-4 pr-1.5 text-[12px] font-medium text-ink shadow-cinema transition-transform hover:-translate-y-0.5"
            >
              Track shipment
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-white">
                <Search size={13} />
              </span>
            </button>
            <Link
              href={user ? homeFor(user.role) : "/register"}
              className="flex items-center gap-2 rounded-pill bg-accent py-1.5 pl-4 pr-1.5 text-[12px] font-medium text-ink shadow-cinema transition-transform hover:-translate-y-0.5"
            >
              {user ? "Open dashboard" : "Get in touch with us"}
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-white">
                <ArrowUpRight size={13} />
              </span>
            </Link>
          </div>

          <button
            className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-night-700/85 text-white md:hidden"
            onClick={() => setMenu((v) => !v)}
            aria-label="Menu"
          >
            {menu ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {menu && (
          <div className="mx-auto mt-2 max-w-[1320px] overflow-hidden rounded-xl3 bg-night-700/95 p-3 shadow-cinema backdrop-blur-xl md:hidden">
            {NAV.map((n) => (
              <a
                key={n.label}
                href={n.href}
                onClick={() => setMenu(false)}
                className="block rounded-pill px-4 py-2.5 text-[13px] font-medium text-white/80"
              >
                {n.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2 border-t border-white/10 pt-3">
              <Link href="/login" className="btn-outline btn-sm flex-1">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary btn-sm flex-1">
                Get started
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ============================================================= hero -- */}
      <section className="relative min-h-[720px] overflow-hidden pb-10 pt-28 sm:min-h-[780px] sm:pt-32">
        {/* photographic backdrop */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/hero-truck.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-night/95 via-night/70 to-night/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-night via-transparent to-night/50" />

        <div className="relative mx-auto flex min-h-[560px] max-w-[1320px] flex-col justify-between px-5 sm:min-h-[600px] sm:px-8">
          <div className="max-w-[620px] animate-fade-up pt-6 sm:pt-10">
            <div className="mb-5 inline-flex items-center gap-2 rounded-pill border border-white/15 bg-white/5 px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.18em] text-white/70 backdrop-blur">
              <Sparkles size={12} className="text-accent" /> {s.kicker}
            </div>
            <h1 key={slide} className="animate-fade-up text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[52px]">
              {s.title[0]}
              <br />
              {s.title[1]}
              <br />
              <span className="text-accent">{s.title[2]}</span>
            </h1>
            <p className="mt-5 max-w-[460px] text-[13px] leading-relaxed text-white/65 sm:text-[13.5px]">
              {s.body}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/how-it-works"
                className="flex items-center gap-2 rounded-pill bg-white py-1.5 pl-5 pr-1.5 text-[12.5px] font-medium text-ink transition-transform hover:-translate-y-0.5"
              >
                See how it works
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white">
                  <ArrowUpRight size={14} />
                </span>
              </Link>
              <Link
                href="/login"
                className="flex items-center gap-2 rounded-pill border border-white/25 px-5 py-3 text-[12.5px] font-medium text-white/85 transition-colors hover:bg-white/10"
              >
                <Play size={13} /> Sign in to the workspace
              </Link>
            </div>
          </div>

          {/* bottom stats + carousel control */}
          <div className="mt-16 flex flex-wrap items-end justify-between gap-6">
            <div key={`stats-${slide}`} className="flex animate-fade-up flex-wrap gap-x-10 gap-y-5 sm:gap-x-16">
              {s.stats.map(([v, l]) => (
                <div key={l}>
                  <div className="text-[26px] font-semibold leading-none tracking-[-0.02em] sm:text-[30px]">{v}</div>
                  <div className="mt-2 max-w-[110px] text-[10.5px] leading-snug text-white/50">{l}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => go(-1)}
                aria-label="Previous slide"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/25 text-white/80 transition-colors hover:bg-white hover:text-ink"
              >
                <ArrowLeft size={14} />
              </button>
              <button
                onClick={() => go(1)}
                aria-label="Next slide"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/25 text-white/80 transition-colors hover:bg-white hover:text-ink"
              >
                <ArrowRight size={14} />
              </button>
              <div className="mx-2 flex items-center gap-1.5">
                {SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSlide(i)}
                    aria-label={`Slide ${i + 1}`}
                    className={
                      i === slide
                        ? "h-[3px] w-16 rounded-pill bg-accent"
                        : "h-[3px] w-6 rounded-pill bg-white/25 transition-colors hover:bg-white/50"
                    }
                  />
                ))}
              </div>
              <span className="text-[12px] font-medium text-white/60">
                {String(slide + 1).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== trust bar -- */}
      <section className="border-y border-night-line bg-night-800">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-8 gap-y-3 px-5 py-5 sm:px-8">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
            Built for all of India
          </span>
          {[
            [MapPin, "36 states & UTs · 801 districts"],
            [Warehouse, "4,335 towns indexed as pickups"],
            [Truck, "7 vehicles, 4 classes"],
            [ShieldCheck, "3 roles, no receiver accounts"],
            [Gauge, "Live map · labelled position source"],
          ].map(([Icon, t]: any) => (
            <span key={t} className="inline-flex items-center gap-1.5 text-[11.5px] text-white/55">
              <Icon size={13} className="text-accent" /> {t}
            </span>
          ))}
        </div>
      </section>

      {/* ======================================================== solutions -- */}
      <section id="solutions" className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent">What we move</div>
            <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
              One coordination layer between the village and the mandi
            </h2>
          </div>
          <p className="max-w-sm text-[12.5px] leading-relaxed text-white/55">
            CARGOX does not own trucks or buy produce. It forecasts the harvest wave, pools compatible
            consignments, prices the shared trip fairly and keeps a human approval in front of every dispatch.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[
            [Boxes, "Consolidated pickups", "Compatible consignments on the same corridor travel as one load — gated by AgroCompat, not by guesswork."],
            [Truck, "Capacity exchange", "Verified transporters publish blocks with a reserve price; Admin matches pooled demand to the best fit."],
            [Split, "Fair cost sharing", "ShapleySplit allocates route cost by marginal contribution, capped so nobody pays more than travelling alone."],
            [BadgeCheck, "Verified delivery", "Transporter POD plus Admin reconciliation closes a trip. No GPS claims where there is no telemetry."],
            [BarChart3, "Forecast first", "HarvestPulse gives a 7–21 day p10/p50/p90 demand ribbon so capacity is placed before the queue forms."],
            [Waves, "Disruption ready", "ShadowFleet-Heal and MonsoonPass propose relocation or delay options with an explicit cost of waiting."],
          ].map(([Icon, title, body]: any) => (
            <div
              key={title}
              className="group rounded-xl3 border border-night-line bg-night-800/70 p-6 transition-colors hover:border-accent/40 hover:bg-night-800"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-ink">
                <Icon size={17} />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-white/55">{body}</p>
              <Link href="/how-it-works" className="mt-4 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent">
                How it works <ChevronRight size={12} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================ how --- */}
      <section id="industries" className="border-y border-night-line bg-night-800 py-20">
        <div className="mx-auto grid max-w-[1320px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent">How it runs</div>
            <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[36px]">
              Forecast. Pool. Price. Dispatch. Verify.
            </h2>
            <p className="mt-4 max-w-md text-[12.5px] leading-relaxed text-white/55">
              Each step is a real, inspectable module with inputs, rules and measurable outputs — surfaced in the
              Admin control tower and in the Sender and Transporter workspaces.
            </p>
            <div className="mt-8 space-y-3">
              {[
                ["01", "Sender describes a load", "Voice or form, in Punjabi, Hindi or English."],
                ["02", "Admin reviews and pools", "Compatibility gate, then corridor consolidation."],
                ["03", "Fair share is computed", "Solo cost vs pooled cost, per consignment."],
                ["04", "Two-sided consent", "Sender approves the share, transporter accepts the block."],
                ["05", "Trip closes with proof", "POD plus Admin reconciliation — the audit trail is permanent."],
              ].map(([n, t, d]) => (
                <div key={n} className="flex items-start gap-4 rounded-xl2 border border-night-line bg-night/40 p-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-ink">
                    {n}
                  </span>
                  <div>
                    <div className="text-[13px] font-semibold">{t}</div>
                    <div className="mt-0.5 text-[11.5px] text-white/50">{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-xl3 border border-night-line bg-night shadow-cinema">
              <div className="flex items-center justify-between border-b border-night-line px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  <span className="text-[11px] font-medium text-white/80">Khanna corridor · pooled plan</span>
                </div>
                <span className="rounded-pill border border-night-line px-2 py-0.5 text-[9.5px] text-white/40">
                  synthetic
                </span>
              </div>
              <div className="space-y-3 p-5">
                {[
                  ["Bhari", "3.4 t wheat", "first mile"],
                  ["Isewal", "2.1 t wheat", "first mile"],
                  ["Khanna Rural Hub", "5.5 t consolidated", "line haul"],
                  ["Mandi Gobindgarh", "delivered · POD", "pooled cost ₹1,107"],
                ].map(([place, detail, tag], i) => (
                  <div key={place} className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                      <span className={i === 2 ? "h-2.5 w-2.5 rounded-full bg-accent" : "h-2 w-2 rounded-full bg-white/30"} />
                      {i < 3 && <span className="h-8 w-px bg-white/15" />}
                    </div>
                    <div className="flex-1 rounded-xl2 border border-night-line bg-night-800/60 px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium text-white/90">{place}</span>
                        <span className="text-[10px] text-white/40">{tag}</span>
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-white/45">{detail}</div>
                    </div>
                  </div>
                ))}
                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-night-line pt-4">
                  {[
                    ["₹1,107", "pooled cost"],
                    ["₹2,097", "solo cost"],
                    ["₹990", "saved"],
                  ].map(([v, l]) => (
                    <div key={l}>
                      <div className="text-[16px] font-semibold text-accent">{v}</div>
                      <div className="text-[10px] text-white/40">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl2 border border-night-line bg-night-800 px-5 py-3.5">
              {[
                [PackageCheck, "Load factor", "96%"],
                [Truck, "Vehicle", "1 LCV"],
                [ShieldCheck, "Consent", "both sides"],
              ].map(([Icon, label, value]: any) => (
                <div key={label} className="flex items-center gap-2.5">
                  <Icon size={13} className="text-accent" />
                  <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">{label}</span>
                  <span className="text-[13px] font-semibold text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================== ai ---- */}
      <section id="careers" className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent">Intelligence</div>
            <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
              Twelve modules, one operating system
            </h2>
          </div>
          <Link href="/login" className="btn-primary btn-lg">
            Open the control tower <ArrowRight size={15} />
          </Link>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["HarvestPulse", "7–21 day demand ribbon with p10/p50/p90"],
            ["Options Exchange", "Capacity blocks, reserve price, standby"],
            ["DispatchSense", "GO / WAIT / SPLIT / CANCEL with rupee trade-off"],
            ["ReadySync", "T-60 and T-45 readiness check-ins"],
            ["GramTwin-2E", "First-mile collection + hub line-haul"],
            ["ValueClock", "Net realisation across destinations"],
            ["AgroCompat", "Hard/soft commodity compatibility"],
            ["ShapleySplit", "Marginal-cost fair allocation"],
            ["ShadowFleet-Heal", "Freeze, relocate, repair, approve"],
            ["CrossFlow-Backhaul", "Return loads with an accept/reject rule"],
            ["MonsoonPass", "Seasonal road access per vehicle class"],
            ["VoiceBoli", "Punjabi / Hindi / English voice intake"],
          ].map(([t, d], i) => (
            <div
              key={t}
              className="flex items-start gap-3 rounded-xl2 border border-night-line bg-night-800/60 px-4 py-3.5 transition-colors hover:border-accent/30"
            >
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <div className="text-[12.5px] font-semibold">{t}</div>
                <div className="text-[11px] leading-snug text-white/45">{d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ======================================================== about ---- */}
      <section id="about" className="border-y border-night-line bg-night-800 py-20">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent">About CARGOX</div>
            <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[36px]">
              Honest by construction
            </h2>
            <p className="mt-4 max-w-lg text-[12.5px] leading-relaxed text-white/55">
              CARGOX does not claim to create vehicles, guarantee crop prices or predict an individual farmer's sale
              date. It forecasts ranges, explains every recommendation, labels synthetic data, and puts a human
              approval in front of every operational change.
            </p>
            <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {[
                ["No receiver or FPO role", "Destination buyers and mandis stay external references."],
                ["No fake integrations", "GPS, weather feeds and payments are labelled when absent."],
                ["No silent reassignment", "Senders and transporters both consent before dispatch."],
                ["No black-box fair share", "Every rupee is traceable to a coalition cost."],
              ].map(([t, d]) => (
                <div key={t} className="rounded-xl2 border border-night-line bg-night/40 p-4">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                    <CheckCircle2 size={13} className="text-accent" /> {t}
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-white/45">{d}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl3 border border-night-line bg-night/50 p-7">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Reference corridor</div>
            <h3 className="mt-2 text-[18px] font-semibold">Ludhiana · Khanna · Gobindgarh</h3>
            <div className="mt-6 space-y-4">
              {[
                [Users, "3 senders", "Harpal, Manjit and Ravinder — smallholder consignments"],
                [Truck, "3 transporters", "Balwinder, Gurdeep and Satnam — 7 vehicles across 4 classes"],
                [Split, "3 roles only", "Sender, Transporter, Admin. No receiver or FPO accounts."],
              ].map(([Icon, t, d]: any) => (
                <div key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-accent">
                    <Icon size={14} />
                  </span>
                  <div>
                    <div className="text-[12.5px] font-semibold">{t}</div>
                    <div className="text-[11px] leading-snug text-white/45">{d}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl2 bg-white/[0.04] px-3.5 py-3 text-[10.5px] leading-relaxed text-white/40">
              Place names are real; all operational records are synthetic and labelled in the app.
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================== cta ---- */}
      <section className="px-3 py-16 sm:px-5">
        <div className="mx-auto max-w-[1320px] overflow-hidden rounded-xl3 border border-night-line bg-gradient-to-br from-night-800 to-night px-6 py-14 text-center sm:px-16">
          <h2 className="mx-auto max-w-2xl text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
            Right load. Right vehicle. <span className="text-accent">Right time.</span> Fair share.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[12.5px] leading-relaxed text-white/55">
            Create an account as a Sender or Transporter. Admin accounts are provisioned by invitation only.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="btn-primary btn-lg">
              Create your account <ArrowRight size={15} />
            </Link>
            <Link href="/login" className="btn btn-lg border border-white/20 text-white hover:bg-white/10">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ======================================================== made by -- */}
      <section className="px-3 pb-4 pt-0 sm:px-5">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 rounded-xl3 border border-night-line bg-white/[0.03] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-[13px] font-bold text-ink">MD</span>
            <div>
              <div className="text-[13px] font-semibold text-white">Made by @MD</div>
              <div className="text-[10.5px] text-white/45">
                Designed and built end to end — frontend, API, algorithms, data and deployment.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/40">
            <span className="rounded-pill border border-white/15 px-2.5 py-1">Next.js 14 · FastAPI</span>
            <span className="rounded-pill border border-white/15 px-2.5 py-1">Postgres / PostGIS</span>
            <span className="rounded-pill border border-white/15 px-2.5 py-1">Vercel · Render · Supabase</span>
          </div>
        </div>
      </section>

      {/* ======================================================= footer ---- */}
      <footer className="border-t border-night-line bg-night">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-14 sm:px-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo size={30} tone="light" subtitle="rural freight os" />
            <p className="mt-4 max-w-[250px] text-[11.5px] leading-relaxed text-white/45">
              A forecast-to-dispatch coordination platform for rural freight, built around three roles and one
              accountable control tower.
            </p>
          </div>
          {[
            { t: "Platform", l: [["Solutions", "#solutions"], ["How it works", "/how-it-works"], ["Services", "/services"], ["Intelligence", "#careers"]] },
            { t: "Roles", l: [["Sender", "/register"], ["Transporter", "/register"], ["Admin (invited)", "/login"], ["Sign in", "/login"]] },
            { t: "Company", l: [["About", "#about"], ["Contact", "/contact"], ["Privacy", "#about"], ["Terms", "#about"]] },
          ].map((c) => (
            <div key={c.t}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">{c.t}</div>
              <ul className="mt-4 space-y-2.5">
                {c.l.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-[11.5px] text-white/55 transition-colors hover:text-accent">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-night-line px-5 py-5">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-2 text-[10.5px] text-white/35">
            <span>© {new Date().getFullYear()} cargoX · Made by @MD · Synthetic operational data labelled throughout.</span>
            <span className="inline-flex items-center gap-1.5">
              <Split size={11} /> Sender · Transporter · Admin
            </span>
          </div>
        </div>
      </footer>

      <Modal
        open={track}
        onClose={() => setTrack(false)}
        title="Track a consignment"
        description="Live operational checkpoints — never fabricated GPS."
        footer={
          <>
            <button className="btn-outline" onClick={() => setTrack(false)}>
              Close
            </button>
            <Link href="/login" className="btn-primary">
              Sign in to track
            </Link>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          Consignment status is derived from recorded checkpoints: Admin approval, pool membership, sender
          cost approval, transporter acceptance, trip legs and delivery verification. Sign in as a Sender or
          Transporter to see the shipments you own — there is no public tracking ID lookup, by design.
        </p>
        <div className="mt-4 rounded-xl2 bg-soft px-3.5 py-3 text-[11px] leading-relaxed text-ink-muted">
          Demo accounts are listed on the sign-in screen: three senders, three transporters and one Admin
          control tower.
        </div>
      </Modal>
    </div>
  );
}
