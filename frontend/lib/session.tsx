"use client";

import { useRouter } from "next/navigation";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth, getToken, setToken } from "./api";
import type { Role, User } from "./types";

type Session = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, role?: string | null) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  hasRole: (r: Role | Role[]) => boolean;
};

const SessionContext = createContext<Session>({
  user: null,
  loading: true,
  login: async () => {
    throw new Error("not ready");
  },
  logout: () => {},
  refresh: async () => {},
  hasRole: () => false,
});

const HOME: Record<Role, string> = { sender: "/sender", transporter: "/transporter", admin: "/admin" };
export const homeFor = (r?: Role | null) => (r ? HOME[r] : "/login");

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await auth.me();
      setUser(res.user);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string, role?: string | null) => {
    const res = await auth.login({ email, password, role });
    setToken(res.token);
    setUser(res.user);                    // resolved immediately: guards can trust it
    setLoading(false);
    return res.user as User;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const hasRole = useCallback(
    (r: Role | Role[]) => !!user && (Array.isArray(r) ? r.includes(user.role) : user.role === r),
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, hasRole }),
    [user, loading, login, logout, refresh, hasRole],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** Client-side guard: redirects to /login, or to the user's own home if wrong role. */
export function useGuard(allowed: Role | Role[]) {
  const { user, loading } = useSession();
  const router = useRouter();
  // A token that exists but has not been resolved into `user` yet is "pending",
  // not "signed out" — otherwise the guard bounces a freshly logged-in user
  // back to /login before ChatContext finishes /auth/me.
  const pending = typeof window !== "undefined" && !!getToken() && !user;
  useEffect(() => {
    if (loading || pending) return;
    if (!user) {
      router.replace(`/login?next=${typeof window !== "undefined" ? window.location.pathname : ""}`);
      return;
    }
    const ok = Array.isArray(allowed) ? allowed.includes(user.role) : user.role === allowed;
    if (!ok) router.replace(homeFor(user.role));
  }, [user, loading, pending, allowed, router]);
  return { user, ready: !loading && !pending && !!user };
}
