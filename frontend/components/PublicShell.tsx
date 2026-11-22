"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import Logo from "@/components/Logo";
import { homeFor, useSession } from "@/lib/session";

export const PUBLIC_NAV = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/services", label: "Services" },
  { href: "/contact", label: "Contact" },
];

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const ready = !loading;
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-soft">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-soft/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="shrink-0"><Logo /></Link>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {PUBLIC_NAV.map((n) => (
              <Link key={n.href} href={n.href}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  path === n.href ? "bg-ink/[0.06] text-ink" : "text-ink-muted hover:text-ink"}`}>
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            {ready && user ? (
              <Link href={homeFor(user.role)} className="btn-primary btn-sm">
                Go to dashboard <ArrowRight size={13} />
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn-ghost btn-sm">Sign in</Link>
                <Link href="/register" className="btn-primary btn-sm">
                  Create account <ArrowRight size={13} />
                </Link>
              </>
            )}
          </div>

          <button className="ml-auto md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {open && (
          <div className="border-t border-line bg-surface px-4 py-3 md:hidden">
            {PUBLIC_NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                className="block rounded-lg px-2 py-2 text-[13px] font-medium text-ink hover:bg-soft">
                {n.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2 border-t border-line pt-3">
              {ready && user ? (
                <Link href={homeFor(user.role)} className="btn-primary btn-sm flex-1">Dashboard</Link>
              ) : (
                <>
                  <Link href="/login" className="btn-outline btn-sm flex-1">Sign in</Link>
                  <Link href="/register" className="btn-primary btn-sm flex-1">Register</Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main>{children}</main>

      <footer className="mt-16 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-[12px] leading-relaxed text-ink-muted">
              Rural freight coordination for every state, district and village in India. Three roles —
              sender, transporter, admin — and one coordinated flow between them.
            </p>
          </div>
          <div>
            <div className="label mb-2">Platform</div>
            {PUBLIC_NAV.slice(1).map((n) => (
              <Link key={n.href} href={n.href} className="block py-1 text-[12px] text-ink-muted hover:text-ink">{n.label}</Link>
            ))}
          </div>
          <div>
            <div className="label mb-2">Accounts</div>
            <Link href="/login" className="block py-1 text-[12px] text-ink-muted hover:text-ink">Sign in</Link>
            <Link href="/register" className="block py-1 text-[12px] text-ink-muted hover:text-ink">Register as sender</Link>
            <Link href="/register?role=transporter" className="block py-1 text-[12px] text-ink-muted hover:text-ink">Register as transporter</Link>
            <span className="block py-1 text-[12px] text-ink-muted/70">Admin: invitation only</span>
          </div>
          <div>
            <div className="label mb-2">Honest scope</div>
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              Pilot build. Demo data is synthetic and labelled. No live GPS, no real payments, no receiver or FPO
              accounts — by design.
            </p>
          </div>
        </div>
        <div className="border-t border-line px-4 py-4 text-center text-[11px] text-ink-muted sm:px-6">
          © {new Date().getFullYear()} CARGOX · Built for rural India · Made by @MD
        </div>
      </footer>
    </div>
  );
}
