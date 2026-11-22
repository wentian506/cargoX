"use client";

import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useState } from "react";
import Logo from "@/components/Logo";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<any>("/auth/forgot-password", { email });
      setSent(true);
      setDevToken(res?.reset_token || null);
    } catch (err: any) {
      setError(err?.message || "Could not start the reset");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="rounded-xl2 border border-line bg-surface p-6 shadow-card">
          <Link href="/login" className="mb-4 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-muted hover:text-forest">
            <ArrowLeft size={12} /> Back to sign in
          </Link>

          {sent ? (
            <div>
              <MailCheck size={22} className="text-emerald" />
              <h1 className="mt-3 text-[19px] font-semibold text-ink">Check your reset link</h1>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                If an account exists for <span className="font-semibold text-ink">{email}</span>, a single-use reset
                token has been issued. In this deployment no outbound email provider is connected, so the token is
                returned by the API instead of being emailed.
              </p>
              {devToken && (
                <div className="mt-3 rounded-xl border border-line bg-canvas px-3 py-2">
                  <div className="label">Single-use reset token (local SQLite only — Postgres emails it)</div>
                  <div className="mt-1 break-all font-mono text-[11px] text-ink">{devToken}</div>
                </div>
              )}
              <Link href="/login" className="btn-primary mt-4 w-full">Return to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h1 className="text-[19px] font-semibold text-ink">Reset your password</h1>
              <p className="mt-1 text-[12.5px] text-ink-muted">Enter the email address you registered with.</p>
              <div className="mt-4">
                <div className="label mb-1.5">Email</div>
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" />
              </div>
              {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
              <button className="btn-primary mt-4 w-full" disabled={busy}>
                {busy ? <><Spinner /> Sending…</> : "Send reset link"}
              </button>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-muted">
          Admin accounts are invitation-only. If you cannot reset your admin password, contact the platform owner —
          there is no self-service admin registration.
        </p>
      </div>
    </div>
  );
}
