/* Typed client for the CARGOX API.
 *
 * All calls go through the Next.js rewrite `/api/backend/*` -> FastAPI, so the
 * browser never needs to know where the backend lives. That keeps the preview
 * proxy and Vercel/Render split working without any origin juggling.
 */
const BASE = "/api/backend";
const TOKEN_KEY = "cargox.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) ||
      (typeof data === "string" ? data : `Request failed (${res.status})`);
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? "{}" : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  raw: async (path: string) => {
    const token = getToken();
    const res = await fetch(`${BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.text();
  },
};

/* ---------------------------------- auth --------------------------------- */
export type AuthResult = { token: string; user: any; redirect: string };

export const auth = {
  login: (payload: { email: string; password: string; role?: string | null }) =>
    api.post<AuthResult>("/auth/login", payload),
  google: (payload: {
    credential: string; role?: string | null; state?: string; district?: string;
    village?: string; full_name?: string; mobile?: string; preferred_language?: string;
  }) =>
    api.post<AuthResult & { created?: boolean }>("/auth/google", payload),
  register: (payload: Record<string, unknown>) => api.post<AuthResult>("/auth/register", payload),
  me: () => api.get<{ user: any }>("/auth/me"),
  config: () => api.get<any>("/auth/config"),
  update: (payload: Record<string, unknown>) => api.patch("/auth/me", payload),
  forgot: (email: string) => api.post<any>("/auth/forgot-password", { email }),
};

/* -------------------------------- formatting ------------------------------ */
export const inr = (n?: number | null, compact = false) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (compact && Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (compact && Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};

export const kg = (n?: number | null) => {
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 1 : 2)} t`;
  return `${Math.round(n)} kg`;
};

export const quintals = (nKg?: number | null) =>
  nKg === null || nKg === undefined ? "—" : `${(nKg / 100).toFixed(1)} q`;

export const when = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export const dateOnly = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const titleCase = (s?: string | null) =>
  (s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const pct = (n?: number | null, digits = 0) =>
  n === null || n === undefined ? "—" : `${(n * 100).toFixed(digits)}%`;

/* ------------------------------- geo helpers ------------------------------ */
export const apiGeo = {
  states: () => api.get<{ count: number; states: any[] }>("/geo/states"),
  districts: (state: string) => api.get<{ districts: string[] }>(`/geo/districts?state=${encodeURIComponent(state)}`),
  search: (q: string) => api.get<{ results: any[] }>(`/geo/search?q=${encodeURIComponent(q)}`),
  reverse: (lat: number, lng: number) => api.get<any>(`/geo/reverse?lat=${lat}&lng=${lng}`),
  stats: () => api.get<any>("/geo/stats"),
};

export const apiTracking = {
  live: () => api.get<any>("/tracking/live"),
  trip: (id: string) => api.get<any>(`/tracking/trips/${id}`),
  ping: (body: any) => api.post<any>("/tracking/ping", body),
  subscribe: (body: any) => api.post<any>("/tracking/subscribe", body),
  network: () => api.get<any>("/tracking/active-network"),
};
