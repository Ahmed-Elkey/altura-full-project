"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { commerceFetch } from "@/lib/commerce-api";

import { CommerceApiError, UserActionError } from "@/lib/api-errors";

export type CustomerUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: "CUSTOMER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DISABLED";
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AuthPayload = {
  user: CustomerUser;
  accessToken: string;
  accessTokenExpiresAt?: string;
};

type AuthState = "loading" | "authenticated" | "unauthenticated";

type CustomerAuthContextValue = {
  state: AuthState;
  user: CustomerUser | null;
  login: (email: string, password: string) => Promise<CustomerUser>;
  demoLogin: (role: CustomerUser['role']) => Promise<CustomerUser>;
  register: (payload: { email: string; password: string; firstName: string; lastName: string; phone?: string }) => Promise<CustomerUser>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  clearLocalSession: () => void;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  refresh: () => Promise<string | null>;
};

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);



export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");
  const [user, setUser] = useState<CustomerUser | null>(null);
  const accessToken = useRef<string | null>(null);
  const refreshPromise = useRef<Promise<string | null> | null>(null);

  const accept = useCallback((payload: AuthPayload) => {
    if (!payload?.accessToken || !payload.user) {
      accessToken.current = null;
      setUser(null);
      setState("unauthenticated");
      return null;
    }
    accessToken.current = payload.accessToken;
    setUser(payload.user);
    setState("authenticated");
    return payload.accessToken;
  }, []);

  const refresh = useCallback(async () => {
    if (refreshPromise.current) return refreshPromise.current;
    refreshPromise.current = (async () => {
      try {
        return accept(await commerceFetch<AuthPayload>("/auth/refresh", { method: "POST", body: "{}" }, { timeoutMs: 8000 }));
      } catch (caught) {
        if (caught instanceof CommerceApiError && (caught.status === 401 || caught.status === 403)) {
          accessToken.current = null; setUser(null); setState("unauthenticated");
          return null;
        }
        // An outage does not prove session revocation. Preserve an existing
        // session view; protected requests still require backend authorization.
        if (!accessToken.current) { setUser(null); setState("unauthenticated"); }
        throw caught;
      } finally { refreshPromise.current = null; }
    })();
    return refreshPromise.current;
  }, [accept]);

  const mergeCommerceSession = useCallback(async (token: string) => {
    try {
      await commerceFetch<void>("/commerce-session/merge", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch { /* Transport logs the failure; authentication remains successful. */ }
  }, []);

  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    // Finish cookie restoration before a new login replaces that cookie/session.
    await refreshPromise.current?.catch(() => null);
    const payload = await commerceFetch<AuthPayload>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    if (!payload?.user || !payload.accessToken) throw new UserActionError("session-unavailable");
    // Unified entry: the same form accepts CUSTOMER and ADMIN.
    // Role-based redirect happens in the form/shell, not here.
    if (payload.user.role === "CUSTOMER") {
      await mergeCommerceSession(payload.accessToken);
    }
    if (!accept(payload)) throw new UserActionError("session-unavailable");
    return payload.user;
  }, [accept, mergeCommerceSession]);

  const demoLogin = useCallback(async (role: CustomerUser['role']) => {
    await refreshPromise.current?.catch(() => null);
    const payload = await commerceFetch<AuthPayload>("/auth/demo-login", { method: "POST", body: JSON.stringify({ role }) });
    if (!payload?.user || payload.user.role !== role || !payload.accessToken) throw new UserActionError("session-unavailable");
    if (role === "CUSTOMER") await mergeCommerceSession(payload.accessToken);
    if (!accept(payload)) throw new UserActionError("session-unavailable");
    return payload.user;
  }, [accept, mergeCommerceSession]);

  const register = useCallback(async (payload: { email: string; password: string; firstName: string; lastName: string; phone?: string }) => {
    await refreshPromise.current?.catch(() => null);
    const result = await commerceFetch<AuthPayload>("/auth/register", { method: "POST", body: JSON.stringify(payload) });
    if (!result?.user || result.user.role !== "CUSTOMER" || !result.accessToken) throw new UserActionError("session-unavailable");
    await mergeCommerceSession(result.accessToken);
    if (!accept(result)) throw new UserActionError("session-unavailable");
    return result.user;
  }, [accept, mergeCommerceSession]);

  // Call only after the backend confirms session revocation.
  const clearLocalSession = useCallback(() => {
    accessToken.current = null; setUser(null); setState("unauthenticated");
  }, []);

  const logout = useCallback(async () => {
    await commerceFetch<void>("/auth/logout", { method: "POST", body: "{}" });
    clearLocalSession();
  }, [clearLocalSession]);

  const apiFetchImpl = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    let token = accessToken.current || await refresh();
    if (!token) throw new UserActionError("signin-required");
    const request = (bearer: string) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${bearer}`);
      return commerceFetch<T>(path, { ...init, headers });
    };
    try { return await request(token); }
    catch (caught) {
      if (!(caught instanceof CommerceApiError) || caught.status !== 401) throw caught;
      token = await refresh();
      if (!token) throw new UserActionError("session-expired");
      return request(token);
    }
  }, [refresh]);

  const logoutAll = useCallback(async () => {
    await apiFetchImpl<void>("/auth/logout-all", { method: "POST" });
    clearLocalSession();
  }, [apiFetchImpl, clearLocalSession]);

  const value = useMemo(() => ({ state, user, login, demoLogin, register, logout, logoutAll, clearLocalSession, apiFetch: apiFetchImpl, refresh }), [state, user, login, demoLogin, register, logout, logoutAll, clearLocalSession, apiFetchImpl, refresh]);
  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (!context) throw new Error("useCustomerAuth must be used inside CustomerAuthProvider");
  return context;
}
