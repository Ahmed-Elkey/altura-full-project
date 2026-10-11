"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { commerceFetch, CommerceApiError } from "@/lib/commerce-api";
import { getUserErrorMessage } from "@/lib/api-errors";

export function PasswordRecoveryForm({ reset = false }: { reset?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!reset) return;
    const readLink = () => {
      setToken(new URLSearchParams(location.hash.slice(1)).get("token") || "");
      setDone(false);
      setError("");
      setPassword("");
      setConfirmation("");
    };
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, [reset]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!reset && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 320)) { setError("Please enter a valid email address."); return; }
    if (reset && !token) { setError("This reset link is missing or invalid. Please request a new one."); return; }
    if (reset && (password.length < 10 || password.length > 128)) { setError("Choose a password between 10 and 128 characters."); return; }
    if (reset && password !== confirmation) { setError("Your passwords don't match."); return; }
    setBusy(true);
    try {
      const result = await commerceFetch<{ accepted?: boolean; reset?: boolean }>(reset ? "/auth/reset-password" : "/auth/forgot-password", { method: "POST", body: JSON.stringify(reset ? { token, password } : { email: email.trim() }) });
      if (!(reset ? result?.reset : result?.accepted)) throw new CommerceApiError(200, "recovery", "unexpected");
      setDone(true);
      if (reset) { setToken(""); setPassword(""); setConfirmation(""); history.replaceState(null, "", location.pathname); }
    } catch (caught) { setError(getUserErrorMessage(caught, "recovery")); }
    finally { setBusy(false); }
  }
  return (
    <main className="balmoral-auth customer-auth">
      <header className="balmoral-auth__header"><Link href="/" className="balmoral-auth__brand" aria-label="ALTURA home">ALTURA</Link><Link href="/account/login" className="customer-auth__back">Back to sign in</Link></header>
      <div className="balmoral-auth__center"><div className="balmoral-auth__card balmoral-auth__card--explicit">
        <h1 className="balmoral-auth__title">{reset ? "Reset password" : "Forgot password?"}</h1>
        <p className="balmoral-auth__subtitle">{reset ? "Choose a new password for your ALTURA account." : "Enter your account email to request a password reset link."}</p>
        {done ? <div className="customer-auth__success" role="status"><p>{reset ? "Your password has been updated. Sign in with your new password." : "Request received. If an eligible account uses this email, check its inbox for a reset link. The link expires in 30 minutes."}</p><Link href="/account/login" className="balmoral-auth__shopBtn">Back to sign in</Link></div> : (
          <form className="balmoral-auth__form" onSubmit={submit} noValidate aria-busy={busy}>
            {!reset ? <><label className="balmoral-auth__label" htmlFor="recovery-email">Email</label><div className="balmoral-auth__inputBox"><input id="recovery-email" type="email" inputMode="email" autoComplete="email" required maxLength={320} className="balmoral-auth__input" value={email} onChange={event => setEmail(event.target.value)} readOnly={busy} /></div></> : <>
              <label className="balmoral-auth__label" htmlFor="recovery-password">New password</label><div className="balmoral-auth__inputBox"><input id="recovery-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required aria-describedby="recovery-help" className="balmoral-auth__input" value={password} onChange={event => setPassword(event.target.value)} readOnly={busy} /></div>
              <p id="recovery-help" className="balmoral-auth__hint">Use between 10 and 128 characters.</p>
              <label className="balmoral-auth__label" htmlFor="recovery-confirm">Confirm password</label><div className="balmoral-auth__inputBox"><input id="recovery-confirm" type="password" autoComplete="new-password" required maxLength={128} className="balmoral-auth__input" value={confirmation} onChange={event => setConfirmation(event.target.value)} readOnly={busy} /></div>
            </>}
            {error ? <p className="balmoral-auth__error" role="alert">{error} {reset ? <Link href="/account/forgot-password">Request a new link</Link> : null}</p> : null}
            <button type="submit" className="balmoral-auth__shopBtn" disabled={busy}>{busy ? "Please wait…" : reset ? "Save new password" : "Send reset link"}</button>
          </form>
        )}
      </div></div>
    </main>
  );
}
