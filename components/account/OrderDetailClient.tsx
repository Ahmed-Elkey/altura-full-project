"use client";

import { LoadingState } from "@/components/LoadingState";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getUserErrorMessage } from "@/lib/api-errors";
import { orderStatusLabel } from "@/lib/payment-display";
import { useCustomerAuth } from "./CustomerAuthProvider";
import { OrderOverview, orderDate, type CustomerOrder } from "./OrderOverview";

export function OrderDetailClient({ orderNumber }: { orderNumber: string }) {
  const { apiFetch } = useCustomerAuth();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setOrder(null);
    setError("");
    void apiFetch<CustomerOrder>(`/orders/${encodeURIComponent(orderNumber)}`)
      .then((result) => {
        if (!cancelled) setOrder(result);
      })
      .catch((caught) => {
        if (!cancelled) setError(getUserErrorMessage(caught, "orders"));
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch, orderNumber, attempt]);

  return (
    <div className="customer-order">
      <Link
        className="customer-order__link customer-order__back"
        href="/account/orders"
      >
        ← All orders
      </Link>
      {error ? (
        <div
          className="balmoral-profile__card customer-order__card"
          role="alert"
        >
          <p>{error}</p>
          <button
            className="balmoral-profile__editBtn"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : !order ? (
        <LoadingState message="Loading order…" compact />
      ) : (
        <>
          <header className="customer-order__header">
            <div>
              <h1>Order details</h1>
              <p className="customer-order__number">{order.orderNumber}</p>
              <p className="customer-order__muted">
                Placed {orderDate(order.placedAt || order.createdAt)}
              </p>
            </div>
            <span className="customer-order__badge">
              {orderStatusLabel(order.status)}
            </span>
          </header>
          <OrderOverview order={order} allowReturn />
          <div className="customer-order__actions">
            <Link
              className="balmoral-profile__editBtn"
              href={`/order-confirmation/${encodeURIComponent(order.orderNumber)}`}
            >
              View order confirmation
            </Link>
            <Link className="customer-order__link" href="/collections/shopall">
              Continue shopping →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
