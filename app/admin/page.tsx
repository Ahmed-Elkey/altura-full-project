"use client";

import { getUserErrorMessage } from "@/lib/api-errors";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminError, AdminSectionTitle, AdminStatus } from "@/components/admin/AdminUI";
import { adminDate, adminMoney } from "@/lib/admin-format";

type Dashboard = {
  generatedAt: string;
  currency: string;
  revenueScope: string;
  metrics: {
    customers: number;
    activeProducts: number;
    ordersToday: number;
    paymentReview: number;
    netRevenue30d: number;
    grossRevenue30d: number;
    refunded30d: number;
    totalOrders: number;
    pendingOrders: number;
    confirmedPreparingOrders: number;
    shippedOrders: number;
    deliveredOrders: number;
    lowStockSkus: number;
    outOfStockSkus: number;
    totalSkuRecords: number;
    physicalUnits: number;
    reservedUnits: number;
    availableUnits: number;
  };
  ordersByStatus: Record<string, number>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    email: string;
    status: string;
    total: number;
    currency: string;
    itemCount: number;
    paymentStatus: string | null;
    paymentProvider: string | null;
    createdAt: string;
  }>;
};

export default function AdminDashboardPage() {
  const { apiFetch } = useAdminAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await apiFetch<Dashboard>("/admin/dashboard"));
    } catch (cause) {
      setError(getUserErrorMessage(cause, "admin"));
    }
  }, [apiFetch]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="customer-admin__dashboard">
      <header className="customer-admin__heading">
        <div><h1>Dashboard</h1><p>Overview of your orders, revenue and inventory.</p></div>
        <button type="button" className="admin-secondary-button" onClick={() => void load()}>Refresh data</button>
      </header>

      {error ? <AdminError message={error} retry={() => void load()} /> : null}

      <section className="admin-metric-grid" aria-label="Commerce metrics">
        <article className="admin-metric admin-metric--hero">
          <span>30 day net revenue · EGP only</span>
          <strong>{data ? adminMoney(data.metrics.netRevenue30d, data.currency) : "—"}</strong>
          <small>{data ? `${adminMoney(data.metrics.refunded30d, data.currency)} refunded` : "Loading ledger…"}</small>
          <small>{data?.revenueScope}</small>
        </article>
        <article className="admin-metric">
          <span>Total orders</span>
          <strong>{data?.metrics.totalOrders ?? "—"}</strong>
          <small>{data ? `${data.metrics.ordersToday} placed today` : "Loading register…"}</small>
        </article>
        <article className="admin-metric">
          <span>Pending / review</span>
          <strong>{data?.metrics.pendingOrders ?? "—"}</strong>
          <small>{data?.metrics.paymentReview ? `${data.metrics.paymentReview} payment exceptions` : "Awaiting confirmation"}</small>
        </article>
        <article className="admin-metric">
          <span>Confirmed / preparing</span>
          <strong>{data?.metrics.confirmedPreparingOrders ?? "—"}</strong>
          <small>{data ? `${data.metrics.shippedOrders} shipped · ${data.metrics.deliveredOrders} delivered` : "Loading workflow…"}</small>
        </article>
      </section>

      <section className="admin-dashboard-split">
        <div className="admin-panel">
          <AdminSectionTitle label="01 / Order register" title="Recent orders" href="/admin/orders" />
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Order</th><th>Customer</th><th>Status</th><th>Value</th><th>Placed</th></tr>
              </thead>
              <tbody>
                {data?.recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td><Link className="admin-table-link" href={`/admin/orders/${order.orderNumber}`}>{order.orderNumber}</Link><small>{order.itemCount} item{order.itemCount === 1 ? "" : "s"}</small></td>
                    <td>{order.email}</td>
                    <td><AdminStatus value={order.status} /></td>
                    <td className="tnum">{adminMoney(order.total, order.currency)}</td>
                    <td>{adminDate(order.createdAt)}</td>
                  </tr>
                ))}
                {data && !data.recentOrders.length ? <tr><td colSpan={5} className="admin-table-loading">No orders yet.</td></tr> : null}
                {!data ? <tr><td colSpan={5} className="admin-table-loading">Loading order register…</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="admin-panel admin-panel--inventory">
          <AdminSectionTitle label="02 / Inventory" title="Stock pressure" href="/admin/inventory" />
          <div className="admin-inventory-stat">
            <span>Low stock SKUs</span>
            <strong>{data?.metrics.lowStockSkus ?? "—"}</strong>
            <Link href="/admin/inventory?lowStock=true">Inspect low stock →</Link>
          </div>
          <dl className="admin-definition-list">
            <div><dt>Out of stock SKUs</dt><dd>{data?.metrics.outOfStockSkus ?? "—"}</dd></div>
            <div><dt>Physical units</dt><dd>{data?.metrics.physicalUnits ?? "—"}</dd></div>
            <div><dt>Reserved units</dt><dd>{data?.metrics.reservedUnits ?? "—"}</dd></div>
            <div><dt>SKU records</dt><dd>{data?.metrics.totalSkuRecords ?? "—"}</dd></div>
            <div><dt>Active products</dt><dd>{data?.metrics.activeProducts ?? "—"}</dd></div>
            <div><dt>Customers</dt><dd>{data?.metrics.customers ?? "—"}</dd></div>
          </dl>
        </aside>
      </section>

      <section className="admin-status-register">
        <AdminSectionTitle label="03 / Workflow" title="Orders by state" />
        <div className="admin-status-grid">
          {Object.entries(data?.ordersByStatus || {}).map(([status, count]) => (
            <div key={status}><AdminStatus value={status} /><strong>{count}</strong></div>
          ))}
          {data && Object.keys(data.ordersByStatus).length === 0 ? <p>No order states recorded yet.</p> : null}
        </div>
        <div className="admin-data-footnote">Snapshot {data ? adminDate(data.generatedAt) : "loading"}</div>
      </section>
    </div>
  );
}
