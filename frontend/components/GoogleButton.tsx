"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { googleClientId, googleConfigured, loadGoogleScript } from "@/lib/google";

function GoogleGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.7a14.6 14.6 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.4 0-11.7-3.8-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export default function GoogleButton({
  onCredential,
  busy = false,
  label = "Continue with Google",
  disabled = false,
  role = "sender",
  redirectPath,
}: {
  onCredential: (credential: string) => void | Promise<void>;
  busy?: boolean;
  label?: string;
  disabled?: boolean;
  role?: string | null;
  redirectPath?: string;
}) {
  const [configured, setConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const btnContainerRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    const ok = googleConfigured();
    setConfigured(ok);
    if (!ok) return;

    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !btnContainerRef.current) return;
        try {
          (window.google.accounts.id as any).disableAutoSelect?.();
        } catch {
          // ignore if not initialized yet
        }
        window.google.accounts.id.initialize({
          client_id: googleClientId(),
          callback: (resp) => {
            if (resp?.credential) {
              void callbackRef.current(resp.credential);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: false,
          context: role === "sender" ? "signup" : "signin",
        });
        btnContainerRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(btnContainerRef.current, {
          theme: "outline",
          size: "large",
          text: role === "sender" ? "signup_with" : "continue_with",
          shape: "pill",
          width: 360,
        });
        setReady(true);
      })
      .catch(() => setShowHelp(true));

    return () => {
      cancelled = true;
    };
  }, [role, redirectPath]);

  const handleFallbackClick = () => {
    if (!configured) {
      setShowHelp(true);
      return;
    }
    try {
      (window.google?.accounts?.id as any)?.disableAutoSelect?.();
      window.google?.accounts?.id?.prompt?.();
    } catch {
      setShowHelp(true);
    }
  };

  return (
    <div className="space-y-2">
      {configured && (
        <div
          className={`flex justify-center overflow-hidden rounded-pill ${
            busy || disabled ? "pointer-events-none opacity-60" : ""
          }`}
          ref={btnContainerRef}
        />
      )}

      {(!configured || !ready) && (
        <button
          type="button"
          onClick={handleFallbackClick}
          disabled={busy || disabled}
          className="flex w-full items-center justify-center gap-2.5 rounded-pill border border-white/25 bg-white py-3 text-[13px] font-semibold text-ink transition-all hover:bg-white/90 disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <GoogleGlyph />}
          {busy ? "Connecting to Google…" : label}
        </button>
      )}

      {!configured && showHelp && (
        <div className="mt-3 rounded-xl2 border border-white/20 bg-white/[0.06] px-3.5 py-3 text-[11px] leading-relaxed text-white/70">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-white">
            <AlertCircle size={12} className="text-accent" /> Google sign-in is not configured on this deployment
          </div>
          Set <span className="font-mono text-accent">NEXT_PUBLIC_GOOGLE_CLIENT_ID</span> on Vercel and{" "}
          <span className="font-mono text-accent">GOOGLE_CLIENT_ID</span> on Render, then redeploy.
        </div>
      )}
    </div>
  );
}

export { GoogleGlyph };