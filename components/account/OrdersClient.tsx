"use client";
import { LoadingState } from "@/components/LoadingState";
import { paymentMethodLabel, paymentStatusLabel, orderStatusLabel } from "@/lib/payment-display";

import { getUserErrorMessage } from "@/lib/api-errors";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { useCustomerAuth } from "./CustomerAuthProvider";

type Order = { orderNumber: string; status: string; currency: string; totals: { grandTotal: number }; createdAt: string; items: { productName: string; quantity: number }[] };
type Result = { orders: Order[]; total: number; page: number; totalPages: number };

export function OrdersClient() {
  const { apiFetch } = useCustomerAuth();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextPage: number) => {
    setError("");
    setLoading(true);
    try {
      setResult(await apiFetch<Result>(`/orders?limit=20&page=${nextPage}`));
    } catch (e) {
      setError(getUserErrorMessage(e, "orders"));
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { void load(page); }, [load, page]);

  if (error) return <div className="balmoral-orders__error" role="alert">{error} <button type="button" onClick={() => void load(page)}>Try again</button></div>;
  if (!result) return <LoadingState message="Loading orders…" />;

  return (
    <div className="balmoral-orders">
      {/* Welcome card — always on top like screenshot */}
      <div className="balmoral-orders__welcome">
        <div className="balmoral-orders__welcomeText">
          <strong>Welcome</strong>
          <span>Ready to shop?</span>
        </div>
        <Link href="/collections/shopall" className="balmoral-orders__shopNow">
          Shop now
        </Link>
      </div>

      {result.orders.length > 0 ? (
        <div className="balmoral-orders__list">
          {result.orders.map((order) => (
            <Link key={order.orderNumber} href={`/account/orders/${encodeURIComponent(order.orderNumber)}`} className="balmoral-orders__row">
              <div>
                <span>{new Date(order.createdAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}</span>
                <strong>{order.orderNumber}</strong>
              </div>
              <div>
                <span>{order.items.reduce((s, i) => s + i.quantity, 0)} items</span>
                <span>{orderStatusLabel(order.status)}</span>
              </div>
              <strong>{formatMoney(order.totals.grandTotal, order.currency)}</strong>
            </Link>
          ))}
        </div>
      ) : <p role="status" className="balmoral-orders__empty">No orders yet.</p>}
      {result.totalPages > 1 ? (
        <nav className="account-orders-pagination" aria-label="Order pages">
          <span>Page {result.page} of {result.totalPages} · {result.total} orders</span>
          <div>
            <button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
            <button type="button" disabled={loading || page >= result.totalPages} onClick={() => setPage((current) => current + 1)}>Next</button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
