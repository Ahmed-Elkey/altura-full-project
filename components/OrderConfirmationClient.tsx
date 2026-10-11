"use client";
import { LoadingState } from "@/components/LoadingState";
import { orderStatusLabel } from "@/lib/payment-display";

import { getUserErrorMessage } from "@/lib/api-errors";

import Link from "next/link";
import { useEffect, useState } from "react";
import { commerceFetch } from "@/lib/commerce-api";
import { AccountShell } from "./account/AccountShell";
import {
  OrderOverview,
  orderDate,
  type CustomerOrder,
} from "./account/OrderOverview";
import { useCustomerAuth } from "./account/CustomerAuthProvider";

export function OrderConfirmationClient({
  orderNumber,
  email,
}: {
  orderNumber: string;
  email?: string;
}) {
  const { state, apiFetch } = useCustomerAuth();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setOrder(null);
    setError("");
    setLoading(true);
    const load = async () => {
      try {
        const result = email
          ? await commerceFetch<CustomerOrder>("/orders/guest/lookup", {
              method: "POST",
              body: JSON.stringify({
                orderNumber,
                email: email.trim().toLowerCase(),
              }),
            })
          : state === "authenticated"
            ? await apiFetch<CustomerOrder>(
                `/orders/${encodeURIComponent(orderNumber)}`,
              )
            : null;
        if (!cancelled && result) setOrder(result);
        if (!result && !cancelled && state !== "loading")
          setError(
            "Sign in to view the full order, or use Track order with your confirmation email.",
          );
      } catch (caught) {
        if (!cancelled) setError(getUserErrorMessage(caught, "orders"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (email || state !== "loading") void load();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, email, orderNumber, state]);

  const trackingQuery = new URLSearchParams({ order: orderNumber });
  if (email) trackingQuery.set("email", email.trim());

  return (
    <AccountShell publicView>
      <div className="customer-order">
        <header className="customer-order__header">
          <div>
            <span className="customer-order__muted">Order confirmation</span>
            <h1>
              {order
                ? "Order received."
                : loading
                  ? "Verifying your order…"
                  : "Order could not be verified."}
            </h1>
            {order && (
              <>
                <p className="customer-order__number">{order.orderNumber}</p>
                <p className="customer-order__muted">
                  Placed {orderDate(order.placedAt || order.createdAt)}
                </p>
              </>
            )}
          </div>
          {order && (
            <span className="customer-order__badge">
              {orderStatusLabel(order.status)}
            </span>
          )}
        </header>
        {order ? (
          <>
            <div className="balmoral-profile__card customer-order__card customer-order__thanks">
              <strong>Thank you for your order.</strong>
              <p className="customer-order__muted">
                You can check your delivery and payment details below.
              </p>
              <span className="customer-order__muted">{order.email}</span>
            </div>
            <OrderOverview order={order} />
          </>
        ) : error ? (
          <div
            className="balmoral-profile__card customer-order__card"
            role="alert"
          >
            {error}
          </div>
        ) : (
          <LoadingState message="Loading order details…" compact />
        )}
        <div className="customer-order__actions">
          <Link
            href="/collections/shopall"
            className="balmoral-orders__shopNow"
          >
            Continue shopping
          </Link>
          <Link
            href={`/track-order?${trackingQuery}`}
            className="balmoral-profile__editBtn"
          >
            Track this order
          </Link>
          {order && state === "authenticated" && (
            <Link
              href={`/account/orders/${encodeURIComponent(orderNumber)}`}
              className="customer-order__link"
            >
              View order details →
            </Link>
          )}
        </div>
      </div>
    </AccountShell>
  );
}
