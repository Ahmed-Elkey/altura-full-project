"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { commerceFetch, CommerceApiError } from "@/lib/commerce-api";
import { getUserErrorMessage } from "@/lib/api-errors";

import { rewardDescription, rewardTerms, type NewsletterReward as Reward } from "@/lib/newsletter-offer";

export function NewsletterLinkForm({ action }: { action: "confirm" | "unsubscribe" }) {
  const confirming = action === "confirm";
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const readLink = () => {
      generation.current++;
      setToken(new URLSearchParams(location.hash.slice(1)).get("token") || "");
      setReady(true); setError(""); setDone(false); setReward(null); setCopied(false); setCopyError(""); setBusy(false);
    };
    readLink(); window.addEventListener("hashchange", readLink);
    return () => { generation.current++; window.removeEventListener("hashchange", readLink); };
  }, [action]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !token) return;
    const requestGeneration = generation.current;
    setBusy(true); setError("");
    try {
      const result = await commerceFetch<{ confirmed?: boolean; unsubscribed?: boolean; reward?: Reward | null }>(`/newsletter/${action}`, { method: "POST", body: JSON.stringify({ token }) });
      if (generation.current !== requestGeneration) return;
      if (confirming ? result?.confirmed !== true || (result.reward !== null && (!result.reward?.code || !Number.isFinite(Date.parse(result.reward.expiresAt)))) : result?.unsubscribed !== true) throw new CommerceApiError(200, "newsletter", "unexpected");
      setReward(result.reward || null); setDone(true); setToken("");
      history.replaceState(null, "", location.pathname + location.search);
    } catch (caught) {
      if (generation.current !== requestGeneration) return;
      setError(caught instanceof CommerceApiError && [400, 401, 403, 404, 410].includes(caught.status)
        ? "This link is invalid or expired. Please request a new link from the newsletter form."
        : getUserErrorMessage(caught, "newsletter"));
    } finally { if (generation.current === requestGeneration) setBusy(false); }
  }
  async function copyCode() {
    if (!reward) return;
    setCopyError("");
    try { await navigator.clipboard.writeText(reward.code); setCopied(true); }
    catch { setCopyError("Copy unavailable. Select the code above and copy it manually."); }
  }
  const missing = ready && !token && !done;
  return <main className="balmoral-auth customer-auth">
    <header className="balmoral-auth__header"><Link href="/" className="balmoral-auth__brand" aria-label="ALTURA home">ALTURA</Link><Link href="/" className="customer-auth__back">Back to store</Link></header>
    <div className="balmoral-auth__center"><div className="balmoral-auth__card balmoral-auth__card--explicit newsletter-reward__card">
      <h1 className="balmoral-auth__title">{done ? confirming ? "Welcome to ALTURA" : "You're unsubscribed" : confirming ? "Confirm your subscription" : "Unsubscribe from ALTURA"}</h1>
      <p className="balmoral-auth__subtitle">{confirming ? "Confirm your email to join the ALTURA community." : "Confirm below to stop receiving newsletter emails."}</p>
      {done ? <div className="customer-auth__success" role="status">
        {confirming && reward ? <><p>Your subscription is confirmed. Your private welcome code:</p><strong className="newsletter-reward__code">{reward.code}</strong><p>{rewardDescription(reward)}</p><p>{rewardTerms(reward)}</p><p>Expires {new Date(reward.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.</p><button type="button" className="balmoral-auth__shopBtn" onClick={() => void copyCode()}>{copied ? "Code copied" : "Copy code"}</button>{copyError ? <p role="alert">{copyError}</p> : null}</> : <p>{confirming ? "Your subscription is confirmed. Your previous reward remains subject to its original expiry and usage limit." : "You are unsubscribed from newsletter emails."}</p>}
        <Link href="/shop" className="balmoral-auth__shopBtn">Explore the collection</Link>
      </div> : <form className="balmoral-auth__form" onSubmit={submit} aria-busy={busy}>
        {confirming ? <p className="newsletter-reward__terms">Your email confirmation activates your subscription. Any welcome reward follows the terms in your email.</p> : null}
        {error || missing ? <p className="balmoral-auth__error" role="alert">{error || "This email link is missing its token. Open the full link from your email."} <Link href="/#newsletter">Request a new link</Link></p> : null}
        <button className="balmoral-auth__shopBtn" type="submit" disabled={!ready || !token || busy}>{busy ? "Please wait…" : confirming ? "Confirm subscription" : "Unsubscribe"}</button>
      </form>}
    </div></div>
  </main>;
}
