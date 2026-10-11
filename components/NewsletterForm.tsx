"use client";

import { getUserErrorMessage } from "@/lib/api-errors";

import { FormEvent, useEffect, useId, useState } from "react";
import { commerceFetch, CommerceApiError } from "@/lib/commerce-api";

import type { OfferPresentation } from "@/lib/newsletter-offer";

export function NewsletterForm() {
  const [offer, setOffer] = useState<OfferPresentation | null>(null);
  useEffect(() => { let active = true; commerceFetch<OfferPresentation>("/newsletter/offer").then(result => { if (active) setOffer(result); }).catch(() => undefined); return () => { active = false; }; }, []);
  const messageId = useId();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = email.trim().toLowerCase();
    if (trimmed.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setMessage({ kind: "error", text: "Enter a valid email address." });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const result = await commerceFetch<{ subscribed: boolean }>("/newsletter/subscribe", {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      });
      if (result?.subscribed !== true) throw new CommerceApiError(200, "newsletter", "unexpected");
      setMessage({ kind: "success", text: "Request received. Check your inbox to confirm your subscription." });
      setEmail("");
    } catch (caught) {
      setMessage({ kind: "error", text: getUserErrorMessage(caught, "newsletter") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="newsletter" className="site-footer__newsletterForm newsletter-reward__form" onSubmit={submit} noValidate aria-busy={busy}>
      <p className="newsletter-reward__offer">{offer?.headline || "Join the ALTURA newsletter."}</p>
      <div className="newsletter-reward__entry"><input
        type="email"
        className="site-footer__newsletterInput"
        inputMode="email"
        autoComplete="email"
        placeholder="Enter your email address here"
        aria-label="Email address"
        required
        maxLength={320}
        readOnly={busy}
        value={email}
        aria-invalid={message?.kind === "error"}
        aria-describedby={message ? messageId : undefined}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button className="site-footer__newsletterSubmit" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Subscribe"}
      </button></div>
      <p className="newsletter-reward__terms">{offer?.terms || "Confirm by email to receive collection news and updates."}</p>
      {message ? <p id={messageId} className="site-footer__newsletterStatus" role={message.kind === "error" ? "alert" : "status"} aria-live="polite">{message.text}</p> : null}
    </form>
  );
}
