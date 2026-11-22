/* Google Identity — redirect flow (no third-party script at runtime). */

const SCOPES = "openid email profile";
const PENDING_ROLE_KEY = "cargox.google.pending_role";

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
    /* ignore in private mode */
  }
  return value;
}

export function googleAuthUrl(redirectPath = "/login"): string {
  const clientId = googleClientId();
  // Strip any ?role=... query string so redirect_uri always matches Google Cloud Console
  const cleanPath = redirectPath.split("?")[0] || "/login";
  const redirectUri = `${window.location.origin}${cleanPath}`;

  try {
    const query = redirectPath.includes("?") ? redirectPath.split("?")[1] : "";
    const role = new URLSearchParams(query).get("role");
    if (role) sessionStorage.setItem(PENDING_ROLE_KEY, role);
  } catch {
    /* ignore */
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "id_token",
    scope: SCOPES,
    nonce: nonce(),
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function startGoogleSignIn(redirectPath = "/login") {
  window.location.href = googleAuthUrl(redirectPath);
}

export function consumePendingGoogleRole(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const role = sessionStorage.getItem(PENDING_ROLE_KEY);
    if (role) sessionStorage.removeItem(PENDING_ROLE_KEY);
    return role;
  } catch {
    return null;
  }
}

/** Read the id_token Google appends to the URL fragment after the redirect. */
export function readGoogleCredential(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const token = params.get("id_token");
  if (token) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return token;
}