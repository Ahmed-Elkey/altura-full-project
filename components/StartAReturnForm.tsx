"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoadingState } from "@/components/LoadingState";
import { useSearchParams } from "next/navigation";
import { getUserErrorMessage } from "@/lib/api-errors";
import { commerceFetch } from "@/lib/commerce-api";
import { formatMoney } from "@/lib/money";
import { useCustomerAuth } from "@/components/account/CustomerAuthProvider";

type ReturnOrderItem = {
  id: string;
  productName: string;
  colorName: string | null;
  size: string | null;
  productImageUrl: string | null;
  unitPrice?: number;
  lineTotal?: number;
  quantity: number;
};

type ReturnOrder = {
  orderNumber: string;
  status: string;
  currency: string;
  items: ReturnOrderItem[];
};

type ReturnHistoryItem = {
  id: string;
  status: string;
  reason: string;
  createdAt: string;
  refundAmount: number | null;
  order: { orderNumber: string; currency: string; status: string };
  items: { orderItemId: string; productName: string; quantity: number }[];
};

const REASONS = ["Size or fit", "Changed my mind", "Item arrived damaged", "Item differs from expectation", "Other"];

const statusCopy: Record<string, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  IN_TRANSIT: "In transit",
  RECEIVED: "Received",
  REFUNDED: "Refunded",
  CLOSED: "Closed",
};

/** Single canonical return form (Balmoral styling) for /start-a-return.
 *  Guests use order number + checkout email; signed-in shoppers get the
 *  same flow plus notes and their request history. /returns redirects here. */
function StartAReturnFormInner() {
  const { state: authState, apiFetch, user } = useCustomerAuth();
  const searchParams = useSearchParams();
  const isGuest = authState !== "authenticated";
  const [email, setEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [order, setOrder] = useState<ReturnOrder | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState("");
  const [returns, setReturns] = useState<ReturnHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedReturn, setSavedReturn] = useState<ReturnHistoryItem | null>(null);
  const pending = useRef(false);
  const historyGeneration = useRef(0);
  const sessionGeneration = useRef(0);

  // Prefill from ?order= links (order confirmation emails, account pages).
  useEffect(() => {
    const prefill = searchParams.get("order");
    if (prefill && !orderNumber) setOrderNumber(prefill.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function loadHistory() {
    if (authState !== "authenticated") return;
    const session = sessionGeneration.current;
    const generation = ++historyGeneration.current;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const result = await apiFetch<ReturnHistoryItem[]>("/returns");
      if (generation === historyGeneration.current && session === sessionGeneration.current) setReturns(result);
    } catch (caught) {
      if (generation === historyGeneration.current && session === sessionGeneration.current) setHistoryError(getUserErrorMessage(caught, "returns"));
    } finally {
      if (generation === historyGeneration.current && session === sessionGeneration.current) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    sessionGeneration.current++; pending.current = false; setBusy(false);
    setReturns([]); setOrder(null); setSelected({}); setSavedReturn(null); setMessage(""); setError(""); setNotes(""); setHistoryError("");
    void loadHistory();
    return () => { historyGeneration.current++; sessionGeneration.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, user?.id]);

  async function loadOrder(event: FormEvent) {
    event.preventDefault();
    if (pending.current || authState === "loading") return;
    const session = sessionGeneration.current;
    setError("");
    setMessage("");
    setOrder(null);
    setSavedReturn(null);
    setSelected({});
    if (!orderNumber.trim()) return;
    if (isGuest && !email.trim()) {
      setError("Enter the email used at checkout.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      if (isGuest) {
        const guestOrder = await commerceFetch<ReturnOrder>("/orders/guest/lookup", {
          method: "POST",
          body: JSON.stringify({ orderNumber: orderNumber.trim().toUpperCase(), email: email.trim().toLowerCase() }),
        });
        if (session === sessionGeneration.current) setOrder(guestOrder);
      } else {
        const result = await apiFetch<ReturnOrder>(`/orders/${encodeURIComponent(orderNumber.trim().toUpperCase())}`);
        if (session === sessionGeneration.current) setOrder(result);
      }
    } catch (caught) {
      if (session === sessionGeneration.current) setError(getUserErrorMessage(caught, "returns"));
    } finally {
      if (session === sessionGeneration.current) { pending.current = false; setBusy(false); }
    }
  }

  async function submitReturn(event: FormEvent) {
    event.preventDefault();
    if (pending.current || authState === "loading") return;
    const session = sessionGeneration.current;
    setError("");
    setMessage("");
    const items = Object.entries(selected)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (savedReturn) return;
    if (!order || !items.length) {
      setError("Select at least one item to return.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const payload = { orderNumber: order.orderNumber, reason, notes: notes.trim() || undefined, items };
      let saved: ReturnHistoryItem;
      if (isGuest) {
        saved = await commerceFetch<ReturnHistoryItem>("/returns/guest", {
          method: "POST",
          body: JSON.stringify({ ...payload, email: email.trim().toLowerCase() }),
        });
      } else {
        saved = await apiFetch<ReturnHistoryItem>("/returns", { method: "POST", body: JSON.stringify(payload) });
      }
      if (session !== sessionGeneration.current) return;
      setSavedReturn(saved);
      setSelected({});
      setNotes("");
      setMessage("Your return request has been submitted. ALTURA will review it before any refund is issued.");
      await loadHistory();
    } catch (caught) {
      if (session === sessionGeneration.current) setError(getUserErrorMessage(caught, "returns"));
    } finally {
      if (session === sessionGeneration.current) { pending.current = false; setBusy(false); }
    }
  }

  function unitPrice(item: ReturnOrderItem, currency: string) {
    const unit = item.unitPrice ?? Math.round(((item.lineTotal ?? 0) / Math.max(item.quantity, 1)) * 100) / 100;
    return formatMoney(unit, currency);
  }

  if (authState === "loading") return <div className="pb-row-form__form col-start-1 col-start-xl-4 col-span-xl-6"><LoadingState message="Loading return form…" /></div>;

  return (
    <div className="pb-row-form__form col-start-1 col-start-xl-4 col-span-xl-6">
      {savedReturn ? (
        <section className="brf-confirmation">
          <p className="brf-success" role="status">{message}<br /><strong>Reference: {savedReturn.id}</strong></p>
          <p>Order {savedReturn.order.orderNumber} · {statusCopy[savedReturn.status] || savedReturn.status}</p>
          {isGuest ? <p>Keep this reference. If you need an update, <Link href="/info/contact">contact our team</Link> with your order number.</p> : <Link href={`/account/returns/${encodeURIComponent(savedReturn.id)}`}>View return details →</Link>}
          <button className="brf-submit brf-submit--ghost" type="button" onClick={() => { setSavedReturn(null); setOrder(null); setMessage(""); }}>Load another order</button>
        </section>
      ) : !order ? (
        <form className="brf" onSubmit={loadOrder}>
          {isGuest ? (
            <label className="brf-field">
              <span>Your email*</span>
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="" autoComplete="email" />
            </label>
          ) : null}
          <label className="brf-field">
            <span>Your order number*</span>
            <input required value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="Order number from your confirmation" maxLength={64} autoComplete="off" aria-label="Order number" />
          </label>
          {error ? <p className="brf-error" role="alert">{error}</p> : null}
          <button className="brf-submit" type="submit" disabled={busy}>{busy ? "Loading…" : "Load order →"}</button>
        </form>
      ) : (
        <form className="brf" onSubmit={submitReturn}>
          <p className="brf-orderline">{order.orderNumber}</p>
          {order.status !== "DELIVERED" ? (
            <>
              <p className="brf-note">Returns become available after an order is marked delivered.</p>
              <button className="brf-submit brf-submit--ghost" type="button" disabled={busy} onClick={() => setOrder(null)}>← Back</button>
            </>
          ) : (
            <>
              <div className="brf-items">
                {order.items.map((item) => {
                  const quantity = selected[item.id] || 0;
                  return (
                    <div className={`brf-item ${quantity ? "is-selected" : ""}`} key={item.id}>
                      <label className="brf-check returns-item-check">
                        <input
                          type="checkbox"
                          checked={quantity > 0}
                          onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.checked ? 1 : 0 }))}
                          aria-label={`Return ${item.productName}`}
                        />
                        <span aria-hidden="true" />
                      </label>
                      <div className="brf-iteminfo">
                        <strong>{item.productName}</strong>
                        <small>{[item.colorName, item.size].filter(Boolean).join(" / ")} · {unitPrice(item, order.currency)} · {item.quantity} ordered</small>
                      </div>
                      {quantity > 0 && (
                        <select
                          aria-label={`Quantity to return for ${item.productName}`}
                          value={quantity}
                          onChange={(event) => setSelected((current) => ({ ...current, [item.id]: Number(event.target.value) }))}
                        >
                          {Array.from({ length: item.quantity }, (_, index) => index + 1).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
              <label className="brf-field">
                <span>Reason*</span>
                <select value={reason} onChange={(event) => setReason(event.target.value)} className="brf-select" aria-label="Primary reason">
                  {REASONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="brf-field">
                <span>Notes <em>Optional</em></span>
                <textarea className="brf-textarea" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Anything our team should know?" aria-label="Notes" />
              </label>
              {error ? <p className="brf-error" role="alert">{error}</p> : null}
              {message ? <p className="brf-success" role="status" aria-live="polite">{message}</p> : null}
              <button className="brf-submit" type="submit" disabled={busy}>{busy ? "Submitting…" : "Request return →"}</button>
              <button className="brf-submit brf-submit--ghost" type="button" disabled={busy} onClick={() => { setOrder(null); setSelected({}); setMessage(""); }}>← Back</button>
            </>
          )}
        </form>
      )}
      
      {authState === "authenticated" ? (
        <div className="brf-history">
          <h3>Previous requests</h3>
          {historyError ? <p className="brf-error" role="alert">{historyError} <button type="button" onClick={() => void loadHistory()}>Try again</button></p> : null}
          {historyLoading ? <p aria-live="polite">Loading return history…</p> : returns.length ? (
            <ul>
              {returns.map((item) => (
                <li key={item.id}>
                  <span>{item.order.orderNumber}</span>
                  <strong>{statusCopy[item.status] || item.status}</strong>
                  <small>{item.items.map((i) => `${i.productName} × ${i.quantity}`).join(" · ")} · {new Date(item.createdAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })} · {item.reason}</small>
                  {item.refundAmount !== null ? <strong>Refund: {formatMoney(item.refundAmount, item.order.currency)}</strong> : null}
                  <Link href={`/account/returns/${encodeURIComponent(item.id)}`}>View return</Link>
                </li>
              ))}
            </ul>
          ) : !historyError ? <p>No return requests yet.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function StartAReturnForm() {
  return (
    <Suspense fallback={<div className="pb-row-form__form col-start-1 col-start-xl-4 col-span-xl-6" aria-busy="true"><p>Loading return form…</p></div>}>
      <StartAReturnFormInner />
    </Suspense>
  );
}
