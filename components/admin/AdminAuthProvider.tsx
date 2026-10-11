"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { COMMERCE_API_BASE, commerceFetch } from "@/lib/commerce-api";

import { CommerceApiError, UserActionError } from "@/lib/api-errors";

export type AdminUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "CUSTOMER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DISABLED";
};

type AuthResponse = {
  user: AdminUser;
  accessToken: string;
  accessTokenExpiresAt?: string;
};

type AdminAuthState = "loading" | "authenticated" | "unauthenticated";

type AdminAuthContextValue = {
  state: AdminAuthState;
  user: AdminUser | null;
  apiBase: string;
  login: (email: string, password: string) => Promise<AdminUser>;
  logout: () => Promise<void>;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

const API_BASE = COMMERCE_API_BASE;



export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AdminAuthState>("loading");
  const [user, setUser] = useState<AdminUser | null>(null);
  const accessToken = useRef<string | null>(null);
  const refreshPromise = useRef<Promise<string | null> | null>(null);

  const acceptSession = useCallback((payload: AuthResponse) => {
    if (!payload?.accessToken || !payload?.user || payload.user.role !== "ADMIN") {
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

  const refresh = useCallback(async (): Promise<string | null> => {
    if (refreshPromise.current) return refreshPromise.current;
    refreshPromise.current = (async () => {
      try {
        return acceptSession(await commerceFetch<AuthResponse>("/auth/refresh", { method: "POST", body: "{}" }, { timeoutMs: 8000 }));
      } catch (caught) {
        if (caught instanceof CommerceApiError && (caught.status === 401 || caught.status === 403)) {
          accessToken.current = null; setUser(null); setState("unauthenticated");
          return null;
        }
        // A failed connection cannot establish session revocation. The backend
        // continues to authorize every protected request.
        if (!accessToken.current) { setUser(null); setState("unauthenticated"); }
        throw caught;
      } finally { refreshPromise.current = null; }
    })();
    return refreshPromise.current;
  }, [acceptSession]);

  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const payload = await commerceFetch<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    if (!payload?.user || !payload.accessToken) throw new UserActionError("session-unavailable");
    if (payload.user.role !== "ADMIN") {
      await commerceFetch<void>("/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
      throw new UserActionError("studio-forbidden");
    }
    if (!acceptSession(payload)) throw new UserActionError("session-unavailable");
    return payload.user;
  }, [acceptSession]);

  const logout = useCallback(async () => {
    try { await commerceFetch<void>("/auth/logout", { method: "POST", body: "{}" }); }
    finally { accessToken.current = null; setUser(null); setState("unauthenticated"); }
  }, []);

  const apiFetch = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
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

  const value = useMemo<AdminAuthContextValue>(
    () => ({ state, user, apiBase: API_BASE, login, logout, apiFetch }),
    [state, user, login, logout, apiFetch],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return context;
}
