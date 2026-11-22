import Link from "next/link";
import { PitchMark } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-night">
      {/* foggy bridge backdrop */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/auth-bridge.jpg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-night/90 via-night/55 to-night/35" />
      <div className="absolute inset-0 bg-gradient-to-t from-night/80 via-transparent to-night/40" />

      {/* top bar */}
      <div className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-9">
        <Link href="/" className="flex items-center gap-2 text-white">
          <PitchMark size={26} color="#FFFFFF" />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">
            cargo<span className="font-bold">X</span>
          </span>
        </Link>
        <Link
          href="/"
          className="rounded-pill border border-white/25 px-4 py-1.5 text-[11px] font-medium text-white/75 transition-colors hover:bg-white/10"
        >
          ← Back to site
        </Link>
      </div>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-84px)] max-w-[1280px] items-center gap-10 px-5 pb-12 sm:px-9 lg:grid-cols-[1fr_460px]">
        {children}
      </div>
    </div>
  );
}
