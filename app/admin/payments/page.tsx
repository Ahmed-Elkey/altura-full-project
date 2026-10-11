"use client";

import { getUserErrorMessage, logApiError } from "@/lib/api-errors";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminEmpty, AdminError, AdminPageHeader, AdminSectionTitle, AdminStatus } from "@/components/admin/AdminUI";
import { adminDate, adminMoney } from "@/lib/admin-format";

type ReviewResponse = { total: number; orders: Array<{ id: string; orderNumber: string; email: string; status: string; currency: string; totals: { grandTotal: number }; payments: Array<{ id: string; provider: string; status: string; amount: number; refundedAmount: number; failureReason: string | null; lastWebhookAt: string | null }> ; updatedAt: string }>; failedWebhooks: Array<{ id: string; provider: string; externalEventId: string; eventType: string; orderId: string | null; paymentId: string | null; processingError: string | null; processedAt: string | null; createdAt: string }> };

export default function AdminPaymentsPage() {
  const { apiFetch } = useAdminAuth();
  const [data, setData] = useState<ReviewResponse | null>(null); const [error, setError] = useState("");
  const load = useCallback(async () => { setError(""); try { const next = await apiFetch<ReviewResponse>("/admin/payments/review?limit=50"); next.orders.forEach(order => order.payments.forEach(payment => { if (payment.failureReason) logApiError(new Error(payment.failureReason), "/admin/payments/review"); })); next.failedWebhooks.forEach(event => { if (event.processingError) logApiError(new Error(event.processingError), "/admin/payments/review"); }); setData(next); } catch (cause) { setError(getUserErrorMessage(cause, "admin") ); } }, [apiFetch]);
  useEffect(() => { void load(); }, [load]);
  return <>
    <AdminPageHeader index="06" eyebrow="Financial Exceptions" title="Payment review" description="A quarantine lane for amount mismatches, late confirmations, duplicate success events and webhook processing failures." action={<button className="admin-secondary-button" type="button" onClick={() => void load()}>Refresh evidence</button>} />
    <div className="admin-caution-banner"><strong>No blind overrides.</strong><span>This screen surfaces evidence only. Provider money state and stock state are never rewritten from a generic admin toggle.</span></div>
    {error ? <AdminError message={error} retry={() => void load()} /> : null}
    <section className="admin-panel"><AdminSectionTitle label="01 / Quarantine" title={`Orders requiring review${data ? ` / ${data.total}` : ""}`} />{data && !data.orders.length ? <AdminEmpty title="No payment-review orders" detail="The financial queue is clear." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Order state</th><th>Provider state</th><th>Amount</th><th>Reason</th><th>Evidence</th></tr></thead><tbody>{data?.orders.map((order) => { const payment = order.payments[0]; return <tr key={order.id}><td><Link className="admin-table-link" href={`/admin/orders/${order.orderNumber}`}>{order.orderNumber}</Link></td><td>{order.email}</td><td><AdminStatus value={order.status} /></td><td>{payment ? <><AdminStatus value={payment.status} /><small>{payment.provider}</small></> : "—"}</td><td className="tnum">{adminMoney(order.totals.grandTotal, order.currency)}</td><td>{payment?.failureReason ? "Payment needs review. Check the order details." : "Review provider evidence"}</td><td>{adminDate(payment?.lastWebhookAt)}</td></tr>; })}{!data ? <tr><td colSpan={7} className="admin-table-loading">Loading financial queue…</td></tr> : null}</tbody></table></div>}</section>
    <section className="admin-panel"><AdminSectionTitle label="02 / Webhook trace" title="Processing failures" />{data && !data.failedWebhooks.length ? <AdminEmpty title="No webhook processing errors" /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Provider</th><th>Event</th><th>External ID</th><th>Error</th><th>Received</th></tr></thead><tbody>{data?.failedWebhooks.map((event) => <tr key={event.id}><td>{event.provider}</td><td>{event.eventType}</td><td className="admin-mono">{event.externalEventId}</td><td>{event.processingError ? "This payment event needs review." : "—"}</td><td>{adminDate(event.createdAt)}</td></tr>)}</tbody></table></div>}</section>
  </>;
}
