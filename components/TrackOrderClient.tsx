"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { commerceFetch } from "@/lib/commerce-api";
import { getUserErrorMessage } from "@/lib/api-errors";
import { orderStatusLabel } from "@/lib/payment-display";
import { AccountShell } from "./account/AccountShell";
import {
  OrderOverview,
  orderDate,
  type CustomerOrder,
} from "./account/OrderOverview";

export function TrackOrderClient({
  initialOrderNumber = "",
  initialEmail = "",
}: {
  initialOrderNumber?: string;
  initialEmail?: string;
}) {
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [email, setEmail] = useState(initialEmail);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setOrder(null);
    try {
      setOrder(
        await commerceFetch<CustomerOrder>("/orders/guest/lookup", {
          method: "POST",
          body: JSON.stringify({
            orderNumber: orderNumber.trim().toUpperCase(),
            email: email.trim().toLowerCase(),
          }),
        }),
      );
    } catch (caught) {
      setError(getUserErrorMessage(caught, "orders"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountShell publicView>
      <div className="customer-order">
        <header className="customer-order__header">
          <div>
            <h1>Track your order</h1>
            <p className="customer-order__muted">
              Enter your order number and checkout email to see the latest
              updates. No account is required.
            </p>
          </div>
        </header>
        <form
          className="track-form balmoral-profile__card customer-order__card customer-order__lookup"
          onSubmit={submit}
          aria-busy={busy}
        >
          <label>
            <span>Order number</span>
            <input
              required
              name="orderNumber"
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
              placeholder="ALT-260915-XXXXXXXXXX"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
          <label>
            <span>Email</span>
            <input
              required
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              spellCheck={false}
            />
          </label>
          {error && (
            <div className="customer-order__lookup-error" role="alert">
              {error}
            </div>
          )}
          <div className="customer-order__lookup-actions">
            <button
              type="submit"
              className="balmoral-orders__shopNow"
              disabled={busy}
            >
              {busy ? "Looking up…" : "Track order →"}
            </button>
            <span className="customer-order__muted" role="status">
              {busy
                ? "Checking your order…"
                : "Your order number is on your confirmation page."}
            </span>
          </div>
        </form>
        {order && (
          <section
            className="customer-order__lookup-result"
            aria-live="polite"
            aria-labelledby="tracked-order-title"
          >
            <header className="customer-order__header">
              <div>
                <h2 id="tracked-order-title">Order details</h2>
                <p className="customer-order__number">{order.orderNumber}</p>
                <p className="customer-order__muted">
                  Placed {orderDate(order.placedAt || order.createdAt)}
                </p>
                <p className="customer-order__muted">{order.email}</p>
              </div>
              <span className="customer-order__badge">
                {orderStatusLabel(order.status)}
              </span>
            </header>
            <OrderOverview order={order} />
            <div className="customer-order__actions">
              <Link
                className="balmoral-profile__editBtn"
                href={`/account/login?next=${encodeURIComponent(`/account/orders/${order.orderNumber}`)}`}
              >
                Sign in to view order details
              </Link>
              <Link
                className="customer-order__link"
                href="/collections/shopall"
              >
                Continue shopping →
              </Link>
            </div>
          </section>
        )}
      </div>
    </AccountShell>
  );
}
