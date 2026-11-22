/* Google Identity — redirect flow (no third-party script at runtime).
 *
 * The login screen is fully usable offline: if NEXT_PUBLIC_GOOGLE_CLIENT_ID is
 * unset the button explains how to enable it. When it is set, the button sends
 * the browser to Google's OAuth endpoint with response_type=id_token, and the
 * returned credential is verified server-side in /api/auth/google.
 */

const SCOPES = "openid email profile";

export const googleClientId = () => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export function googleConfigured() {
  return Boolean(googleClientId());
}

function nonce(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const value = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    sessionStorage.setItem("cargox.google.nonce", value);
  } catch {
    /* private mode — the server checks aud/iss/exp regardless */
  }
  return value;
}

export function googleAuthUrl(redirectPath = "/login"): string {
  const clientId = googleClientId();
  const redirectUri = `${window.location.origin}${redirectPath}`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "id_token",
    scope: SCOPES,
    nonce: nonce(),
    prompt: "select_account",
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function startGoogleSignIn(redirectPath = "/login") {
  window.location.href = googleAuthUrl(redirectPath);
}

/** Read the id_token Google appends to the URL fragment after the redirect. */
export function readGoogleCredential(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const token = params.get("id_token");
  if (token) {
    // clean the address bar so a refresh does not replay the token
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return token;
}
