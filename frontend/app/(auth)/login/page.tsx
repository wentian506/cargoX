"use client";

import { ArrowLeft, ArrowRight, Eye, EyeOff, Info, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import GoogleButton from "@/components/GoogleButton";
import RolePicker, { ROLES, type Role } from "@/components/RolePicker";
import { Modal, Spinner, useToast } from "@/components/ui";
import { ApiError, auth, setToken } from "@/lib/api";
import { googleConfigured } from "@/lib/google";
import { homeFor, useSession } from "@/lib/session";

function LoginInner() {
  const { login, refresh } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const { push } = useToast();

  // step 1 = pick who you are, step 2 = choose how to sign in
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [method, setMethod] = useState<"google" | "email" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [googleOn, setGoogleOn] = useState(false);
  const [ownerAdmins, setOwnerAdmins] = useState<string[]>([]);
  // Google identity that is not linked to an account yet: we show the address
  // Google returned, the user confirms it, and the account is created then.
  const [pendingCredential, setPendingCredential] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [gName, setGName] = useState("");
  const [gState, setGState] = useState("");
  const [gDistrict, setGDistrict] = useState("");

  useEffect(() => {
    auth
      .config()
      .then((c) => {
        setGoogleOn(Boolean(c.google_oauth));
        setOwnerAdmins(c.owner_admin_emails || []);
      })
      .catch(() => null);
  }, []);

  // a role can arrive by link (?role=sender), e.g. from the landing page CTAs
  useEffect(() => {
    const r = (params.get("role") || "").toLowerCase();
    if (r === "sender" || r === "transporter" || r === "admin") {
      setRole(r);
      setStep(2);
    }
  }, [params]);

  const go = (r: Role) => {
    setRole(r);
    setError(null);
    setStep(2);
  };

  const finish = async (user: any) => {
    push("success", `Welcome back, ${String(user.full_name || "there").split(" ")[0]}`);
    await refresh();                      // resolve the session before the guard runs
    const next = params.get("next");
    router.replace(next && next.startsWith("/") ? next : homeFor(user.role));
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await auth.login({ email, password, role } as any);
      setToken(res.token);
      finish(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = useCallback(
    async (credential: string) => {
      setBusy(true);
      setError(null);
      try {
        // 1st pass: sign in only. No account is created until the person sees
        // the address Google returned and confirms it.
        const res = await auth.google({ credential });
        setToken(res.token);
        finish(res.user);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "";
        const claims = decodeJwtPayload(credential);
        if (msg === "new_account_needs_role") {
          setPendingCredential(credential);
          setGoogleEmail(claims?.email || null);
          setGName(claims?.name || "");
        } else {
          setError(msg || "Google sign-in failed");
        }
      } finally {
        setBusy(false);
      }
    },
    [finish]
  );

  const createWithGoogle = async () => {
    if (!pendingCredential || !role) return;
    setBusy(true);
    setError(null);
    try {
      const res = await auth.google({
        credential: pendingCredential,
        role,
        full_name: gName.trim() || undefined,
        state: gState || undefined,
        district: gDistrict || undefined,
      });
      setToken(res.token);
      push("success", "Google account linked", `Signed in as ${res.user.email}.`);
      finish(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not link this Google account");
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (method) setMethod(null);
    else if (step === 2) setStep(1);
    setError(null);
  };

  const roleLabel = ROLES.find((r) => r.id === role)?.label;

  return (
    <>
      {/* ------------------------------------------------ left: invitation -- */}
      <div className="hidden max-w-[520px] animate-fade-up text-white lg:block">
        <div className="mb-5 inline-flex items-center gap-2 rounded-pill border border-white/20 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/65 backdrop-blur">
          Sender · Transporter · Admin
        </div>
        <h1 className="text-[46px] font-semibold leading-[1.08] tracking-[-0.03em]">
          Don&apos;t Have An
          <br />
          Account?
        </h1>
        <p className="mt-5 max-w-[420px] text-[13.5px] leading-relaxed text-white/60">
          Register to access all the features of CARGOX. Forecast the harvest wave, pool the load, price it
          fairly and verify the delivery — across every state, district and village in India. It&apos;s free for
          senders and transporters.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/register"
            className="flex items-center gap-2 rounded-pill bg-white py-1.5 pl-5 pr-1.5 text-[12.5px] font-medium text-ink transition-transform hover:-translate-y-0.5"
          >
            Create an account
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white">
              <ArrowRight size={14} />
            </span>
          </Link>
          <Link
            href="/how-it-works"
            className="rounded-pill border border-white/25 px-5 py-3 text-[12.5px] font-medium text-white/80 transition-colors hover:bg-white/10"
          >
            How it works
          </Link>
        </div>
        <div className="mt-10 flex items-center gap-2 text-[10.5px] text-white/35">
          <ShieldCheck size={12} /> Admin accounts are invitation-only — there is no public Admin registration.
        </div>
      </div>

      {/* ------------------------------------------------- right: sign in -- */}
      <div className="mx-auto w-full max-w-[440px] animate-fade-up">
        <div className="auth-glass rounded-xl3 px-7 py-8 sm:px-9 sm:py-9">
          {/* header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[26px] font-semibold leading-none tracking-[-0.01em] text-white">
                {step === 1 ? "login" : method === "google" ? "Sign in with Google" : "Sign in"}
              </h2>
              <p className="mt-1.5 text-[11.5px] text-white/45">
                {step === 1
                  ? "First, tell us who you are"
                  : method === "google"
                    ? `Continue as ${roleLabel} using your Google account`
                    : `Email and password · ${roleLabel}`}
              </p>
            </div>
            {step === 2 && (
              <button
                type="button"
                onClick={back}
                className="flex items-center gap-1 rounded-pill border border-white/20 px-2.5 py-1 text-[10.5px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft size={11} /> back
              </button>
            )}
          </div>

          {/* step 1 — role */}
          {step === 1 && (
            <div className="mt-6">
              <RolePicker value={role} onChange={go} />
              <p className="mt-4 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-white/35">
                <Info size={11} className="mt-0.5 shrink-0" />
                You sign in to the workspace that matches your role. Admin accounts are issued by an existing
                administrator.
              </p>
            </div>
          )}

          {/* step 2 — method */}
          {step === 2 && !method && (
            <div className="mt-6 space-y-2.5">
              {role === "admin" && (
                <div className="rounded-xl2 border border-accent/35 bg-accent/[0.08] px-3.5 py-2.5 text-[10.5px] leading-relaxed text-white/70">
                  <span className="font-semibold text-white">Admin is invitation-only.</span>{" "}
                  {ownerAdmins.length ? (
                    <>
                      The owner admin signs in with Google as{" "}
                      <span className="font-semibold text-accent">{ownerAdmins[0]}</span>
                      {ownerAdmins.length > 1 ? ` (+${ownerAdmins.length - 1} more)` : ""}. Other admins use the
                      email + password issued to them.
                    </>
                  ) : (
                    <>Use the Google account or credentials issued by an existing administrator.</>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => setMethod("google")}
                className="flex w-full items-center gap-3 rounded-xl2 border border-white/15 bg-white/[0.05] px-4 py-3.5 text-left transition-colors hover:border-white/35 hover:bg-white/10"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white">
                  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.6 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4z" />
                    <path fill="#FBBC05" d="M10.4 28.7a14.6 14.6 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
                    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.4 0-11.7-3.8-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-white">Sign in with Google</span>
                  <span className="block text-[10.5px] text-white/40">
                    {googleOn ? "Use your Google account — no password to remember" : "Requires a Google client id (setup guide included)"}
                  </span>
                </span>
                <ArrowRight size={14} className="shrink-0 text-white/40" />
              </button>

              <button
                type="button"
                onClick={() => setMethod("email")}
                className="flex w-full items-center gap-3 rounded-xl2 border border-white/15 bg-white/[0.05] px-4 py-3.5 text-left transition-colors hover:border-white/35 hover:bg-white/10"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70">
                  <Mail size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-white">Email id with password</span>
                  <span className="block text-[10.5px] text-white/40">Use the CARGOX account you registered</span>
                </span>
                <ArrowRight size={14} className="shrink-0 text-white/40" />
              </button>

              <div className="pt-4 text-center text-[11px] text-white/45">
                New to CARGOX?{" "}
                <Link href={`/register${role ? `?role=${role}` : ""}`} className="font-semibold text-white hover:underline">
                  create an account
                </Link>
              </div>
            </div>
          )}

          {/* step 2 — google */}
          {step === 2 && method === "google" && !pendingCredential && (
            <div className="mt-6 space-y-4">
              <GoogleButton onCredential={onGoogle} busy={busy} role={role} label={`Continue as ${roleLabel}`} />
              {error && (
                <div className="rounded-xl2 border border-red-300/40 bg-red-500/15 px-4 py-2.5 text-center text-[11.5px] leading-relaxed text-red-100">
                  {error}
                </div>
              )}
              {!googleConfigured() && (
                <p className="text-center text-[10.5px] leading-relaxed text-white/35">
                  Google sign-in switches on once the client id is in the deployment environment — the exact
                  steps are in DEPLOYMENT.md §6. Email + password works now.
                </p>
              )}
              <div className="flex items-center gap-2 text-[10px] text-white/25">
                <ShieldCheck size={11} /> The Google credential is verified server-side (audience, issuer, expiry).
              </div>
            </div>
          )}

          {/* step 2 — google, address not linked yet: confirm + create */}
          {step === 2 && method === "google" && pendingCredential && (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl2 border border-accent/30 bg-accent/[0.07] px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                  Google verified · {roleLabel}
                </div>
                <div className="mt-1 break-all text-[13.5px] font-medium text-white">
                  {googleEmail || "your Google address"}
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-white/50">
                  This address has no CARGOX account yet. Confirm it to open your {roleLabel} workspace.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <input
                  className="auth-field sm:col-span-2"
                  placeholder="full name"
                  aria-label="Full name"
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                />
                <input
                  className="auth-field"
                  placeholder="state (optional)"
                  aria-label="State"
                  value={gState}
                  onChange={(e) => setGState(e.target.value)}
                />
                <input
                  className="auth-field"
                  placeholder="district (optional)"
                  aria-label="District"
                  value={gDistrict}
                  onChange={(e) => setGDistrict(e.target.value)}
                />
              </div>
              {error && (
                <div className="rounded-xl2 border border-red-300/40 bg-red-500/15 px-4 py-2.5 text-center text-[11.5px] leading-relaxed text-red-100">
                  {error}
                </div>
              )}
              <button
                type="button"
                onClick={createWithGoogle}
                disabled={busy}
                className="btn-primary w-full py-3"
              >
                {busy ? "Creating your account…" : `Confirm ${googleEmail || "this address"} & continue`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingCredential(null);
                  setGoogleEmail(null);
                  setError(null);
                }}
                className="w-full text-center text-[11px] text-white/45 hover:text-white"
              >
                Use a different Google account
              </button>
            </div>
          )}

          {/* step 2 — email */}
          {step === 2 && method === "email" && (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <input
                className="auth-field"
                type="email"
                autoComplete="email"
                placeholder="email address"
                aria-label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <div className="relative">
                <input
                  className="auth-field pr-12"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="password"
                  aria-label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/45 transition-colors hover:text-white"
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              <div className="flex items-center justify-between px-1 pt-0.5">
                <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-white/60">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-white/30 bg-white/10 accent-accent"
                  />
                  remember me
                </label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-[11.5px] text-white/60 transition-colors hover:text-white"
                >
                  forget password
                </button>
              </div>

              {error && (
                <div className="rounded-xl2 border border-red-300/40 bg-red-500/15 px-4 py-2.5 text-center text-[11.5px] leading-relaxed text-red-100">
                  {error}
                </div>
              )}

              <button
                className="flex w-full items-center justify-center gap-2 rounded-pill bg-white py-3 text-[13.5px] font-semibold text-ink transition-all hover:bg-white/90 disabled:opacity-60"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <Spinner /> Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          )}

        </div>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-white/35">
          Only Sender, Transporter and Admin can sign in. No receiver or FPO accounts exist.
        </p>
      </div>

      <Modal
        open={forgotOpen}
        onClose={() => {
          setForgotOpen(false);
          setForgotMsg(null);
        }}
        title="Reset your password"
        description="We send a recovery link through Supabase Auth."
        footer={
          <>
            <button className="btn-outline" onClick={() => setForgotOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={async () => {
                const res = await auth.forgot(forgotEmail);
                setForgotMsg(
                  res.message,
                );
              }}
            >
              Send reset link
            </button>
          </>
        }
      >
        <label className="block">
          <div className="mb-1.5 text-[11.5px] font-medium text-ink">Account email</div>
          <input
            className="input"
            type="email"
            placeholder="you@example.com"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
          />
        </label>
        {forgotMsg && (
          <div className="mt-3 flex items-start gap-2 rounded-xl2 border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">
            <Info size={13} className="mt-0.5 shrink-0" /> {forgotMsg}
          </div>
        )}
      </Modal>
    </>
  );
}

/** Read the (unverified) payload of a Google ID token — display only. The
 *  backend re-verifies signature, issuer, audience and expiry. */
function decodeJwtPayload(token: string): { email?: string; name?: string } | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(part + "=".repeat((4 - (part.length % 4)) % 4))
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-[13px] text-white/60">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
