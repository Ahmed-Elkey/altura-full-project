"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getUserErrorMessage } from "@/lib/api-errors";
import { InfoModal, type InfoKey } from "@/components/InfoModal";
import { useCustomerAuth } from "./CustomerAuthProvider";
import { commerceFetch } from "@/lib/commerce-api";
import type { CustomerUser } from "./CustomerAuthProvider";

export function AccountAuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { login, demoLogin, register } = useCustomerAuth();
  const registerMode = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [demoRoles, setDemoRoles] = useState<CustomerUser['role'][]>([]);
  const [openingDemo, setOpeningDemo] = useState<CustomerUser['role'] | null>(null);
  const [infoModal, setInfoModal] = useState<InfoKey | null>(null);
  const requestedNext = params.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\") ? requestedNext : "/account";
  const modeQuery = requestedNext && next === requestedNext ? `?next=${encodeURIComponent(next)}` : "";

  useEffect(() => {
    try { localStorage.removeItem("altura_last_email"); } catch {}
  }, []);

  useEffect(() => {
    if (registerMode) return;
    const controller = new AbortController();
    void commerceFetch<{ roles: CustomerUser['role'][] }>("/auth/demo", { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setDemoRoles((result.roles || []).filter(role => role === 'CUSTOMER' || role === 'ADMIN')); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [registerMode]);

  async function openDemo(role: CustomerUser['role']) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setOpeningDemo(role); setError("");
    try {
      await demoLogin(role);
      const adminDestination = next === "/admin" || next.startsWith("/admin/");
      router.replace(role === "ADMIN" ? (adminDestination ? next : "/admin") : (adminDestination ? "/account" : next));
    } catch {
      setError("Demo sign-in is temporarily unavailable. Please try again or use your own account.");
    } finally { pending.current = false; setBusy(false); setOpeningDemo(null); }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 320) {
      setError("Please enter a valid email address.");
      return;
    }
    if (registerMode && (!firstName.trim() || !lastName.trim() || firstName.trim().length > 80 || lastName.trim().length > 80)) {
      setError("Please enter your first and last name (up to 80 characters each).");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    if (registerMode && (password.length < 10 || password.length > 128)) {
      setError("Choose a password between 10 and 128 characters.");
      return;
    }
    if (registerMode && password !== confirmation) {
      setError("Your passwords don't match. Please check them and try again.");
      return;
    }
    pending.current = true; setBusy(true);
    try {
      let signedIn;
      if (registerMode) {
        signedIn = await register({ email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() });
      } else {
        signedIn = await login(email.trim(), password);
      }
      // Unified entry: ADMIN goes to Studio, CUSTOMER follows ?next= or /account.
      if (!registerMode && signedIn.role === "ADMIN") {
        router.replace(next === "/admin" || next.startsWith("/admin/") ? next : "/admin");
      } else {
        router.replace(next);
      }
    } catch (caught) {
      setError(getUserErrorMessage(caught, registerMode ? "register" : "login"));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="balmoral-auth customer-auth">
      <header className="balmoral-auth__header">
        <Link href="/" className="balmoral-auth__brand" aria-label="ALTURA home">ALTURA</Link>
        <Link href="/collections/shopall" className="customer-auth__back">Back to shop</Link>
      </header>
      <div className="balmoral-auth__center">
        <div className="balmoral-auth__card balmoral-auth__card--explicit">
          <h1 className="balmoral-auth__title">{registerMode ? "Create account" : "Sign in"}</h1>
          <p className="balmoral-auth__subtitle">{registerMode ? "Join ALTURA to save your details and track your orders." : "Welcome back. Sign in with your email and password."}</p>
          <form className="balmoral-auth__form" onSubmit={handleSubmit} noValidate aria-busy={busy}>
            <label className="balmoral-auth__label" htmlFor="balmoral-email">Email</label>
            <div className="balmoral-auth__inputBox">
              <input id="balmoral-email" name="email" type="email" inputMode="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="balmoral-auth__input" required maxLength={320} autoFocus readOnly={busy} />
            </div>
            {registerMode ? (
              <>
                <label className="balmoral-auth__label" htmlFor="auth-first-name">First name</label>
                <div className="balmoral-auth__inputBox">
                  <input id="auth-first-name" name="firstName" type="text" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className="balmoral-auth__input" required maxLength={80} readOnly={busy} />
                </div>
                <label className="balmoral-auth__label" htmlFor="auth-last-name">Last name</label>
                <div className="balmoral-auth__inputBox">
                  <input id="auth-last-name" name="lastName" type="text" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} className="balmoral-auth__input" required maxLength={80} readOnly={busy} />
                </div>
              </>
            ) : null}
            <label className="balmoral-auth__label" htmlFor="auth-password">Password</label>
            <div className="balmoral-auth__inputBox">
              <input id="auth-password" name="password" type="password" autoComplete={registerMode ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="balmoral-auth__input" required minLength={registerMode ? 10 : 1} maxLength={registerMode ? 128 : undefined} aria-describedby={registerMode ? "auth-password-help" : undefined} readOnly={busy} />
            </div>
            {registerMode ? (
              <>
                <p id="auth-password-help" className="balmoral-auth__hint">Use between 10 and 128 characters.</p>
                <label className="balmoral-auth__label" htmlFor="auth-confirm-password">Confirm password</label>
                <div className="balmoral-auth__inputBox">
                  <input id="auth-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="balmoral-auth__input" required maxLength={128} readOnly={busy} />
                </div>
              </>
            ) : null}
            {error ? <p className="balmoral-auth__error" role="alert">{error}</p> : null}
            <button type="submit" className="balmoral-auth__shopBtn" disabled={busy}>
              {busy && !openingDemo ? (registerMode ? "Creating account…" : "Signing in…") : (registerMode ? "Create account" : "Sign in")}
            </button>
          </form>
          {!registerMode ? <Link href="/account/forgot-password" className="customer-auth__forgot">Forgot password?</Link> : null}
          <p className="balmoral-auth__switch">
            {registerMode ? "Already have an account? " : "New to ALTURA? "}
            <Link href={`${registerMode ? "/account/login" : "/account/register"}${modeQuery}`}>{registerMode ? "Sign in" : "Create account"}</Link>
          </p>
          {registerMode ? <p className="balmoral-auth__terms">By creating an account, you agree to our <Link href="/info/terms-policies" className="balmoral-auth__link">Terms of service</Link>.</p> : null}
          {!registerMode && demoRoles.length > 0 ? <section className="customer-auth__demo" aria-labelledby="demo-login-title" aria-busy={openingDemo !== null}>
            <h2 id="demo-login-title">Try the demo</h2>
            <p>Explore ALTURA with a shared demo account.</p>
            <div className="customer-auth__demo-actions">
              {demoRoles.map(role => <button key={role} type="button" disabled={busy} onClick={() => void openDemo(role)}>
                {openingDemo === role ? 'Opening…' : role === 'ADMIN' ? 'Admin demo' : 'Customer demo'}
              </button>)}
            </div>
            <p className="customer-auth__demo-note">Changes are shared with other demo users.</p>
          </section> : null}
        </div>
      </div>
      <footer className="balmoral-auth__footer">
        <button type="button" onClick={() => setInfoModal("privacy")}>Privacy policy</button>
      </footer>
      <InfoModal modalKey={infoModal} onClose={() => setInfoModal(null)} />
    </main>
  );
}
