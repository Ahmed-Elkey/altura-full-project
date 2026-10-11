"use client";

import { getUserErrorMessage } from "@/lib/api-errors";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminError, AdminPageHeader, AdminSectionTitle, AdminStatus } from "@/components/admin/AdminUI";
import { adminDate, adminMoney, adminName } from "@/lib/admin-format";

type CustomerDetail = {
  id: string; email: string; firstName: string | null; lastName: string | null; phone: string | null; role: string; status: string; emailVerifiedAt: string | null; lastLoginAt: string | null; createdAt: string; orderCount: number; lifetimeValue: number;
  addresses: Array<{ id: string; label: string | null; recipientName: string; line1: string; line2: string | null; city: string; region: string | null; postalCode: string | null; countryCode: string; isDefaultShipping: boolean; isDefaultBilling: boolean }>;
  orders: Array<{ id: string; orderNumber: string; status: string; currency: string; totals: { grandTotal: number }; createdAt: string }>;
};

export default function AdminCustomerDetailPage() {
  const params = useParams<{ userId: string }>();
  const { apiFetch, user } = useAdminAuth();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try { setCustomer(await apiFetch<CustomerDetail>(`/admin/customers/${params.userId}`)); }
    catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
  }, [apiFetch, params.userId]);
  useEffect(() => { void load(); }, [load]);

  async function setStatus(status: string) {
    setBusy(true); setError("");
    try { await apiFetch(`/admin/customers/${params.userId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); }
    catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setBusy(false); }
  }

  async function setRole(role: string) {
    setBusy(true); setError("");
    try { await apiFetch(`/admin/customers/${params.userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }); await load(); }
    catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="admin-breadcrumb"><Link href="/admin/customers">Customers</Link><span>/</span><span>{customer?.email || params.userId}</span></div>
      <AdminPageHeader index="04A" eyebrow="Customer Detail" title={customer ? adminName(customer.firstName, customer.lastName, customer.email) : "Customer record"} description={customer?.email} action={customer ? <AdminStatus value={customer.status} /> : undefined} />
      {error ? <AdminError message={error} retry={() => void load()} /> : null}
      {customer ? <>
        <section className="admin-customer-grid">
          <div className="admin-panel"><AdminSectionTitle label="01 / Account" title="Identity" /><dl className="admin-definition-list"><div><dt>Email</dt><dd>{customer.email}</dd></div><div><dt>Phone</dt><dd>{customer.phone || "—"}</dd></div><div><dt>Role</dt><dd>{customer.role}</dd></div><div><dt>Email verified</dt><dd>{adminDate(customer.emailVerifiedAt)}</dd></div><div><dt>Last login</dt><dd>{adminDate(customer.lastLoginAt)}</dd></div><div><dt>Created</dt><dd>{adminDate(customer.createdAt)}</dd></div></dl></div>
          <div className="admin-panel admin-customer-value"><AdminSectionTitle label="02 / Commerce" title="Relationship" /><strong>{adminMoney(customer.lifetimeValue)}</strong><span>Order value · EGP only</span><dl className="admin-definition-list"><div><dt>EGP orders</dt><dd>{customer.orderCount}</dd></div><div><dt>Average EGP order</dt><dd>{customer.orderCount ? adminMoney(customer.lifetimeValue / customer.orderCount) : adminMoney(0)}</dd></div></dl><p className="admin-muted">Historical currencies are excluded from these totals and remain in order history.</p></div>
          <div className="admin-panel"><AdminSectionTitle label="03 / Access" title="Account control" /><label className="admin-inline-control"><span>Status</span><select value={customer.status} disabled={busy} onChange={(event) => void setStatus(event.target.value)}><option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option><option value="DISABLED">DISABLED</option></select></label>{user?.role === "ADMIN" ? <label className="admin-inline-control"><span>Role</span><select value={customer.role} disabled={busy} onChange={(event) => void setRole(event.target.value)}><option value="CUSTOMER">CUSTOMER</option><option value="ADMIN">ADMIN</option></select></label> : null}<p className="admin-caution-copy">Suspending or changing a role revokes active refresh sessions.</p></div>
        </section>
        <section className="admin-dashboard-split">
          <div className="admin-panel"><AdminSectionTitle label="04 / Addresses" title="Saved locations" />{customer.addresses.map((address) => <address className="admin-address-record" key={address.id}><strong>{address.label || address.recipientName}</strong><span>{address.line1}</span>{address.line2 ? <span>{address.line2}</span> : null}<span>{[address.city, address.region, address.postalCode].filter(Boolean).join(", ")}</span><span>{address.countryCode}</span><small>{address.isDefaultShipping ? "Default shipping" : ""}{address.isDefaultShipping && address.isDefaultBilling ? " · " : ""}{address.isDefaultBilling ? "Default billing" : ""}</small></address>)}{!customer.addresses.length ? <p className="admin-muted">No saved addresses.</p> : null}</div>
          <div className="admin-panel"><AdminSectionTitle label="05 / Orders" title="Recent history" />{customer.orders.map((order) => <Link className="admin-customer-order" href={`/admin/orders/${order.orderNumber}`} key={order.id}><div><strong>{order.orderNumber}</strong><span>{adminDate(order.createdAt)}</span></div><AdminStatus value={order.status} /><strong>{adminMoney(order.totals.grandTotal, order.currency)}</strong></Link>)}{!customer.orders.length ? <p className="admin-muted">No orders yet.</p> : null}</div>
        </section>
      </> : null}
    </>
  );
}
