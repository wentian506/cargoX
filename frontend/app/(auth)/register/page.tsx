"use client";

import { ArrowRight, ArrowLeft, Check, Search, ShieldCheck, Truck, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Spinner, useToast } from "@/components/ui";
import { readGoogleCredential } from "@/lib/google";
import GoogleButton from "@/components/GoogleButton";
import { ApiError, auth } from "@/lib/api";
import { STATE_NAMES, districtsOf, townsInDistrict } from "@/lib/geo/india";
import { homeFor, useSession } from "@/lib/session";
import { setToken } from "@/lib/api";

type Role = "sender" | "transporter";

const STATES = STATE_NAMES;                      // all 36 states + union territories
const LANGS_ALL = [
  { k: "en", label: "English" }, { k: "hi", label: "हिन्दी (Hindi)" }, { k: "pa", label: "ਪੰਜਾਬੀ (Punjabi)" },
  { k: "bn", label: "বাংলা (Bengali)" }, { k: "mr", label: "मराठी (Marathi)" }, { k: "gu", label: "ગુજરાતી (Gujarati)" },
  { k: "ta", label: "தமிழ் (Tamil)" }, { k: "te", label: "తెలుగు (Telugu)" }, { k: "kn", label: "ಕನ್ನಡ (Kannada)" },
  { k: "ml", label: "മലയാളം (Malayalam)" }, { k: "or", label: "ଓଡ଼ିଆ (Odia)" }, { k: "as", label: "অসমীয়া (Assamese)" },
];

function decodeJwtPayload(token: string): { email?: string; name?: string } | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return null;
  }
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="text-[13px] text-white/60">Loading…</div>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useSession();
  const { push } = useToast();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role | null>(null);
  const [f, setF] = useState({
    full_name: "", email: "", mobile: "", password: "", confirm_password: "",
    state: "Bihar", district: "Patna", village: "", preferred_language: "hi",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoGoogle, setAutoGoogle] = useState<string | null>(null);

  /* ?role=sender|transporter jumps straight to the details form; ?google=1
     (and the pending credential Google appends to the fragment) auto-starts
     the Google hand-off once the form is on screen. */
  useEffect(() => {
    const r = (params.get("role") || "").toLowerCase();
    if ((r === "sender" || r === "transporter") && step === 1) {
      setRole(r as Role);
      setStep(2);
    }
    const credential = params.get("google") ? readGoogleCredential() : null;
    if (credential) setAutoGoogle(credential);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  /* Cascade: state -> districts -> villages/towns. Every state and UT is
     pickable (4,300+ towns in total), so registration is not Punjab-only. */
  const districts = useMemo(() => districtsOf(f.state), [f.state]);
  const villages = useMemo(
    () => (role === "sender" ? townsInDistrict(f.state, f.district) : []),
    [f.state, f.district, role]
  );
  useEffect(() => {
    if (!districts.length) return;
    if (!districts.includes(f.district)) setF((v) => ({ ...v, district: districts[0], village: "" }));
  }, [districts, f.district]);
  useEffect(() => {
    if (role === "sender" && villages.length && !villages.some((t) => t.name === f.village)) {
      setF((v) => ({ ...v, village: villages[0].name }));
    }
  }, [villages, role, f.village]);

  const strength = useMemo(() => {
    const p = f.password;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  }, [f.password]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (f.full_name.trim().length < 2) e.full_name = "Enter your full name";
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = "Enter a valid email";
    if (f.mobile.replace(/\D/g, "").length < 10) e.mobile = "Enter a 10-digit mobile number";
    if (f.password.length < 8) e.password = "At least 8 characters";
    if (f.password !== f.confirm_password) e.confirm_password = "Passwords do not match";
    return e;
  }, [f]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await auth.register({ ...f, account_type: role, village: role === "sender" ? f.village : undefined });
      setToken(res.token);
      await refresh();
      push("success", "Account created", role === "transporter" ? "Add a vehicle to unlock assignments." : "Create your first shipment request.");
      router.push(homeFor(role!));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  /* A credential returned from Google's redirect has to be spent before it is
     forgotten in the URL fragment. */
  useEffect(() => {
    if (autoGoogle && role && step === 3 && !busy) {
      const cred = autoGoogle;
      setAutoGoogle(null);
      void googleSignup(cred);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGoogle, role, step]);

  /* Sign up with Google: the details typed in steps 1–2 are sent with the
     verified credential, so the account is complete in one go. */
  const googleSignup = async (credential: string) => {
    if (!role) return;
    setBusy(true);
    setError(null);
    try {
      const claims = decodeJwtPayload(credential);
      const res = await auth.google({
        credential,
        role,
        full_name: f.full_name.trim() || claims?.name || undefined,
        mobile: f.mobile.replace(/\D/g, "") || undefined,
        state: f.state || undefined,
        district: f.district || undefined,
        village: role === "sender" ? f.village || undefined : undefined,
        preferred_language: f.preferred_language,
      });
      setToken(res.token);
      await refresh();
      push("success", "Account created with Google", `Signed in as ${res.user.email}.`);
      router.push(homeFor(role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Google sign-up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* left: context panel (desktop) */}
      <div className="hidden max-w-[520px] animate-fade-up text-white lg:block">
        <div className="mb-5 inline-flex items-center gap-2 rounded-pill border border-white/20 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/65 backdrop-blur">
          Two roles · every state and district in India
        </div>
        <h1 className="text-[46px] font-semibold leading-[1.08] tracking-[-0.03em]">
          Join the
          <br />
          freight network.
        </h1>
        <p className="mt-5 max-w-[420px] text-[13.5px] leading-relaxed text-white/60">
          Senders describe a load once — from any village, district or state. Transporters publish the blocks they
          can actually run. Admin matches the two, prices the shared trip fairly and keeps both sides in control of
          the decision.
        </p>
        <div className="mt-9 space-y-3">
          {[
            ["Forecast", "7–21 day demand ribbon with p10/p50/p90 bands"],
            ["Pool", "Compatibility-gated consolidation on one corridor"],
            ["Price", "Shapley fair share with a no-worse-than-solo check"],
            ["Verify", "Transporter POD plus Admin reconciliation before close"],
          ].map(([t, d], i) => (
            <div key={t} className="flex items-start gap-3 rounded-xl2 border border-white/10 bg-white/[0.05] px-4 py-3 backdrop-blur">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-bold text-ink">
                {i + 1}
              </span>
              <div>
                <div className="text-[12.5px] font-semibold text-white">{t}</div>
                <div className="text-[11px] leading-snug text-white/50">{d}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 text-[10px] text-white/30">
          The seeded register is synthetic and labelled in every screen.
        </div>
      </div>

      {/* right: form */}
      <div className="mx-auto w-full max-w-[440px] animate-fade-up">
      <div className="auth-glass rounded-xl3 px-6 py-7 sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-1 items-center gap-2">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors ${
                step >= i ? "bg-accent text-ink" : "bg-white/15 text-white/50"
              }`}
            >
              {step > i ? <Check size={12} /> : i}
            </span>
            {i < 3 && <span className={`h-0.5 flex-1 rounded ${step > i ? "bg-accent" : "bg-white/20"}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="animate-fade-up">
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-white">Create your account</h1>
          <p className="mt-1.5 text-[13px] text-white/50">Choose the role you operate as on CARGOX.</p>

          <div className="mt-6 space-y-3">
            {[
              {
                k: "sender" as Role, icon: UserRound, title: "I am a Sender",
                body: "Farmer, shipper or business sending produce to a mandi, warehouse or buyer.",
                points: ["Create shipment requests", "Approve your fair freight share", "Track every consignment"],
              },
              {
                k: "transporter" as Role, icon: Truck, title: "I am a Transporter",
                body: "Owner-driver, tempo service or fleet operator moving rural freight.",
                points: ["Register vehicles", "Publish capacity blocks", "Accept authorised trips"],
              },
            ].map((c) => (
              <button
                key={c.k}
                onClick={() => { setRole(c.k); setStep(2); }}
                className={`w-full rounded-xl2 border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift ${
                  role === c.k ? "border-white/50 bg-white/10" : "border-white/15 bg-white/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-accent">
                    <c.icon size={17} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-white">{c.title}</div>
                    <div className="mt-0.5 text-[12px] leading-snug text-white/50">{c.body}</div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {c.points.map((p) => (
                        <span key={p} className="inline-flex items-center gap-1 text-[10.5px] text-accent">
                          <Check size={10} /> {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ArrowRight size={15} className="mt-1 shrink-0 text-white/50" />
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-white/5 px-3 py-2.5 text-[11px] leading-relaxed text-white/50">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            <span>
              Admin accounts are provisioned by an existing administrator and can never be self-registered.
              Destination buyers, mandis and warehouses are shipment destinations, not account roles.
            </span>
          </div>

          <p className="mt-6 text-center text-[12.5px] text-white/50">
            Already registered?{" "}
            <Link href="/login" className="font-semibold text-accent hover:underline">Sign in</Link>
          </p>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={(e) => { e.preventDefault(); setStep(3); }} className="animate-fade-up">
          <button type="button" onClick={() => setStep(1)} className="mb-4 inline-flex items-center gap-1 text-[12px] font-semibold text-white/50 hover:text-white">
            <ArrowLeft size={13} /> Back
          </button>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white">
            {role === "sender" ? "Sender details" : "Transporter details"}
          </h1>
          <p className="mt-1.5 text-[13px] text-white/50">This information appears on your operational records.</p>

          <div className="mt-6 grid gap-4">
            <label className="block">
              <div className="mb-1.5 text-[12px] font-semibold text-white">Full name *</div>
              <input className="auth-field" value={f.full_name} onChange={set("full_name")} placeholder="Harpal Singh" required />
            </label>
            <label className="block">
              <div className="mb-1.5 text-[12px] font-semibold text-white">Mobile number *</div>
              <input className="auth-field" value={f.mobile} onChange={set("mobile")} placeholder="98765 43210" required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-white">
                  State / UT
                  <span className="text-[9.5px] font-normal text-white/40">{STATES.length} listed</span>
                </div>
                <select className="auth-field appearance-none pr-9" value={f.state} onChange={set("state")}>
                  {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="block">
                <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-white">
                  District
                  <span className="text-[9.5px] font-normal text-white/40">{districts.length} listed</span>
                </div>
                <select className="auth-field appearance-none pr-9" value={f.district} onChange={set("district")}>
                  {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            </div>
            {role === "sender" && (
              <label className="block">
                <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-white">
                  Village / town
                  <span className="text-[9.5px] font-normal text-white/40">{villages.length} in {f.district}</span>
                </div>
                <select className="auth-field appearance-none pr-9" value={f.village} onChange={set("village")}>
                  {villages.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <div className="mb-1.5 text-[12px] font-semibold text-white">Preferred language</div>
              <select className="auth-field appearance-none pr-9" value={f.preferred_language} onChange={set("preferred_language")}>
                {LANGS_ALL.map((l) => <option key={l.k} value={l.k}>{l.label}</option>)}
              </select>
            </label>
          </div>

          <button className="btn-primary mt-6 w-full py-3">
            Continue <ArrowRight size={15} />
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={submit} className="animate-fade-up">
          <button type="button" onClick={() => setStep(2)} className="mb-4 inline-flex items-center gap-1 text-[12px] font-semibold text-white/50 hover:text-white">
            <ArrowLeft size={13} /> Back
          </button>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-white">Secure your account</h1>
          <p className="mt-1.5 text-[13px] text-white/50">Email verification is sent on signup.</p>

          <div className="mt-6 grid gap-4">
            <label className="block">
              <div className="mb-1.5 text-[12px] font-semibold text-white">Email *</div>
              <input className="auth-field" type="email" value={f.email} onChange={set("email")} placeholder="you@example.com" required />
              {errors.email && <div className="mt-1 text-[11px] text-red-200">{errors.email}</div>}
            </label>
            <label className="block">
              <div className="mb-1.5 text-[12px] font-semibold text-white">Password *</div>
              <input className="auth-field" type="password" value={f.password} onChange={set("password")} placeholder="At least 8 characters" required />
              <div className="mt-2 flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`h-1 flex-1 rounded-full ${
                    strength > i ? (strength <= 2 ? "bg-accent" : "bg-accent") : "bg-white/20"
                  }`} />
                ))}
              </div>
              {errors.password && <div className="mt-1 text-[11px] text-red-200">{errors.password}</div>}
            </label>
            <label className="block">
              <div className="mb-1.5 text-[12px] font-semibold text-white">Confirm password *</div>
              <input className="auth-field" type="password" value={f.confirm_password} onChange={set("confirm_password")} required />
              {errors.confirm_password && <div className="mt-1 text-[11px] text-red-200">{errors.confirm_password}</div>}
            </label>
          </div>

          {error && <div className="mt-4 rounded-xl border border-red-300/40 bg-red-500/15 px-3 py-2 text-[12px] text-red-100">{error}</div>}

          <button className="btn-primary mt-6 w-full py-3" disabled={busy}>
            {busy ? <><Spinner /> Creating account…</> : <>Create {role} account <ArrowRight size={15} /></>}
          </button>

          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-white/30">
            <span className="h-px flex-1 bg-white/15" /> or <span className="h-px flex-1 bg-white/15" />
          </div>
          <GoogleButton
            onCredential={googleSignup}
            busy={busy}
            role={role}
            redirectPath={`/register?role=${role}&google=1`}
            label={`Sign up with Google as ${role === "sender" ? "Sender" : "Transporter"}`}
          />
          <p className="mt-2 text-center text-[10.5px] leading-relaxed text-white/35">
            The Google address you verify becomes your login — your name, mobile and location from this form are
            saved with it.
          </p>

          <p className="mt-4 text-center text-[10.5px] leading-relaxed text-white/50">
            Operational data shown in the workspace is synthetic until validated in a field pilot.
          </p>
        </form>
      )}
      </div>
      </div>
    </>
  );
}
