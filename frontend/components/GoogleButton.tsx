"use client";

/* Reusable Google sign-in surface: the button, the honest "not configured"
 * explainer, and the redirect hand-off. Used by /login and /register so both
 * paths behave identically. */
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { googleConfigured, readGoogleCredential, startGoogleSignIn } from "@/lib/google";

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
  label = "Sign in with Google",
  disabled = false,
  role,
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
  const [showHelp, setShowHelp] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    setConfigured(googleConfigured());
    // if we are returning from Google, hand the credential to the caller
    const credential = readGoogleCredential();
    if (credential) onCredential(credential);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    if (!configured) {
      setShowHelp(true);
      return;
    }
    setWaiting(true);
    const params = role ? `?role=${role}` : "";
    startGoogleSignIn(redirectPath || `/login${params}`);
  };

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={busy || disabled || waiting}
        className="flex w-full items-center justify-center gap-2.5 rounded-pill border border-white/25 bg-white py-3 text-[13px] font-semibold text-ink transition-all hover:bg-white/90 disabled:opacity-60"
      >
        {busy || waiting ? <Loader2 size={15} className="animate-spin" /> : <GoogleGlyph />}
        {busy || waiting ? "Connecting to Google…" : label}
      </button>

      {!configured && showHelp && (
        <div className="mt-3 rounded-xl2 border border-white/20 bg-white/[0.06] px-3.5 py-3 text-[11px] leading-relaxed text-white/70">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-white">
            <AlertCircle size={12} className="text-accent" /> Google sign-in is not configured on this deployment
          </div>
          Create a <span className="text-white">Web application</span> OAuth client in Google Cloud Console →
          APIs &amp; Services → Credentials, then set two environment variables and redeploy:
          <div className="mt-2 space-y-1 font-mono text-[10px] text-accent">
            <div>GOOGLE_CLIENT_ID=…apps.googleusercontent.com <span className="text-white/35">(Render)</span></div>
            <div>NEXT_PUBLIC_GOOGLE_CLIENT_ID=…apps.googleusercontent.com <span className="text-white/35">(Vercel)</span></div>
          </div>
          <div className="mt-2 text-white/50">
            Authorised redirect URI: <span className="text-white/80">{typeof window !== "undefined" ? window.location.origin : ""}/login</span>.
            Email + password works right now — see <span className="text-white/80">DEPLOYMENT.md §6</span>.
          </div>
        </div>
      )}
    </div>
  );
}

export { GoogleGlyph };
