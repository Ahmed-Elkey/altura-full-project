"use client";

import { getUserErrorMessage } from "@/lib/api-errors";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminEmpty, AdminError, AdminPageHeader, AdminSectionTitle, AdminStatus } from "@/components/admin/AdminUI";
import { adminDate, adminMoney } from "@/lib/admin-format";

type ReturnRequest = {
  id: string;
  status: string;
  reason: string;
  notes: string | null;
  refundAmount: number | null;
  paymentMethod: string;
  cashRefundRequired: boolean;
  createdAt: string;
  order: { orderNumber: string; status: string; currency: string; email: string; grandTotal: number };
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  items: Array<{ id: string; quantity: number; reason: string | null; condition: string | null; productName: string; colorName: string | null; size: string | null; unitPrice: number }>;
};

const nextStatuses: Record<string, Array<{ status: string; label: string }>> = {
  REQUESTED: [{ status: "APPROVED", label: "Approve" }, { status: "REJECTED", label: "Reject" }],
  APPROVED: [{ status: "IN_TRANSIT", label: "Mark in transit" }],
  IN_TRANSIT: [{ status: "RECEIVED", label: "Mark received" }],
  RECEIVED: [{ status: "REFUNDED", label: "Issue refund" }],
  REFUNDED: [{ status: "CLOSED", label: "Close" }],
};

export default function AdminReturnsPage() {
  const { apiFetch } = useAdminAuth();
  const [data, setData] = useState<ReturnRequest[] | null>(null);
  const [error, setError] = useState("");
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError("");
    try { setData(await apiFetch<ReturnRequest[]>("/admin/returns")); }
    catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
  }, [apiFetch]);
  useEffect(() => { void load(); }, [load]);
  async function transition(request: ReturnRequest, status: string) {
    setTransitioning(request.id); setError("");
    try {
      await apiFetch(`/admin/returns/${encodeURIComponent(request.id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setTransitioning(null); }
  }

  return <>
    <AdminPageHeader index="07" eyebrow="Customer Care" title="Returns" description="Review requests, record local return progress and issue development-only mock refunds. No carrier or real payment gateway is contacted." action={<button className="admin-secondary-button" type="button" onClick={() => void load()}>Refresh queue</button>} />
    {error ? <AdminError message={error} retry={() => void load()} /> : null}
    <section className="admin-panel">
      <AdminSectionTitle label="01 / Intake" title={`Return requests${data ? ` / ${data.length}` : ""}`} />
      {data && !data.length ? <AdminEmpty title="No return requests" detail="The customer care queue is clear." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Request</th><th>Order</th><th>Customer</th><th>Items</th><th>State</th><th>Refund</th><th>Received</th><th /></tr></thead><tbody>{data?.map((request) => <tr key={request.id}><td><strong className="admin-mono">{request.id}</strong><small>{request.reason}</small></td><td><Link className="admin-table-link" href={`/admin/orders/${request.order.orderNumber}`}>{request.order.orderNumber}</Link><small>{request.order.status.replaceAll("_", " ")}</small></td><td>{request.user ? <Link className="admin-table-link" href={`/admin/customers/${request.user.id}`}>{request.user.email}</Link> : request.order.email}</td><td>{request.items.reduce((sum, item) => sum + item.quantity, 0)} unit(s)<small>{request.items.map((item) => item.productName).join(" · ")}</small></td><td><AdminStatus value={request.status} /></td><td className="tnum">{request.cashRefundRequired ? <><strong>Refund required</strong><small>{adminMoney(request.refundAmount ?? 0, request.order.currency)} due · Manual cash repayment</small></> : request.refundAmount === null ? "Pending" : adminMoney(request.refundAmount, request.order.currency)}</td><td>{adminDate(request.createdAt)}</td><td><div className="admin-return-actions">{nextStatuses[request.status]?.filter(next => !(request.paymentMethod === "CASH_ON_DELIVERY" && ["REFUNDED", "CLOSED"].includes(next.status))).map((next) => <button key={next.status} className="admin-row-action" type="button" disabled={transitioning === request.id} onClick={() => void transition(request, next.status)}>{transitioning === request.id ? "Saving" : next.label}</button>)}</div></td></tr>) ?? <tr><td colSpan={8} className="admin-table-loading">Loading returns…</td></tr>}</tbody></table></div>}
    </section>
  </>;
}
