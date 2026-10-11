"use client";

import { getUserErrorMessage } from "@/lib/api-errors";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminEmpty, AdminError, AdminPageHeader, AdminPagination, AdminStatus } from "@/components/admin/AdminUI";
import { adminDate, adminMoney } from "@/lib/admin-format";

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  email: string;
  currency: string;
  totals: { grandTotal: number };
  items: Array<{ id: string }>;
  payments: Array<{ status: string; provider: string }>;
  createdAt: string;
};

type OrdersResponse = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  orders: OrderRow[];
};

const statuses = ["", "PENDING", "PAYMENT_REVIEW", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"];

export default function AdminOrdersPage() {
  const params = useSearchParams();
  const { apiFetch } = useAdminAuth();
  const [q, setQ] = useState(params.get("q") || "");
  const [status, setStatus] = useState(params.get("status") || "");
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (page: number, nextQ = q, nextStatus = status) => {
    setError("");
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), limit: "20" });
    if (nextQ.trim()) query.set("q", nextQ.trim());
    if (nextStatus) query.set("status", nextStatus);
    try {
      setData(await apiFetch<OrdersResponse>(`/admin/orders?${query}`));
    } catch (cause) {
      setError(getUserErrorMessage(cause, "admin"));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, q, status]);

  useEffect(() => { void load(1); }, []); // initial register only; filters submit explicitly

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(1, q, status);
  }

  return (
    <>
      <AdminPageHeader index="01" eyebrow="Order Register" title="Orders" description="From reservation to delivery. Financial exceptions remain isolated from routine fulfilment." />
      <form className="admin-filter-bar" onSubmit={submit}>
        <label className="admin-search-field"><span>Search</span><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Order number, email or phone" /></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item || "all"} value={item}>{item ? item.replaceAll("_", " ") : "All states"}</option>)}</select></label>
        <button className="admin-secondary-button" type="submit">Apply</button>
      </form>

      {error ? <AdminError message={error} retry={() => void load(data?.page ?? 1)} /> : null}
      <section className="admin-register-panel">
        <div className="admin-register-caption"><span>{data ? `${data.total} orders` : "Loading register"}</span><span>Latest first</span></div>
        {data && data.orders.length === 0 ? <AdminEmpty title="No matching orders" detail="Change the search or workflow filter." /> : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--orders">
              <thead><tr><th>Order</th><th>Customer</th><th>Workflow</th><th>Payment</th><th>Items</th><th>Total</th><th>Placed</th></tr></thead>
              <tbody>
                {data?.orders.map((order) => (
                  <tr key={order.id}>
                    <td><Link className="admin-table-link" href={`/admin/orders/${order.orderNumber}`}>{order.orderNumber}</Link></td>
                    <td>{order.email}</td>
                    <td><AdminStatus value={order.status} /></td>
                    <td>{order.payments[0] ? <><AdminStatus value={order.payments[0].status} /><small>{order.payments[0].provider}</small></> : "—"}</td>
                    <td className="tnum">{order.items.length}</td>
                    <td className="tnum">{adminMoney(order.totals.grandTotal, order.currency)}</td>
                    <td>{adminDate(order.createdAt)}</td>
                  </tr>
                ))}
                {!data ? <tr><td colSpan={7} className="admin-table-loading">Loading orders…</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
        {data ? <AdminPagination page={data.page} pages={data.totalPages} total={data.total} loading={loading} onPageChange={(page) => void load(page)} /> : null}
      </section>
    </>
  );
}
