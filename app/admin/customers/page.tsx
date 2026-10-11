"use client";

import { getUserErrorMessage } from "@/lib/api-errors";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminEmpty, AdminError, AdminPageHeader, AdminPagination, AdminStatus } from "@/components/admin/AdminUI";
import { adminDate, adminMoney, adminName } from "@/lib/admin-format";

type Customer = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  orderCount: number;
  lifetimeValue: number;
};

type CustomersResponse = { page: number; limit: number; total: number; totalPages: number; customers: Customer[] };

export default function AdminCustomersPage() {
  const { apiFetch } = useAdminAuth();
  const [q, setQ] = useState("");
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (page: number, needle = q) => {
    setError("");
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), limit: "20" });
    if (needle.trim()) query.set("q", needle.trim());
    try { setData(await apiFetch<CustomersResponse>(`/admin/customers?${query}`)); }
    catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setLoading(false); }
  }, [apiFetch, q]);

  useEffect(() => { void load(1, ""); }, []);
  function submit(event: FormEvent) { event.preventDefault(); void load(1, q); }

  return (
    <>
      <AdminPageHeader index="04" eyebrow="Customer Register" title="Customers" description="Account status and EGP order value. Historical currencies remain in each customer's order history and are excluded from these totals." />
      <form className="admin-filter-bar" onSubmit={submit}>
        <label className="admin-search-field"><span>Search</span><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name, email or phone" /></label>
        <button className="admin-secondary-button" type="submit">Search</button>
      </form>
      {error ? <AdminError message={error} retry={() => void load(data?.page ?? 1)} /> : null}
      <section className="admin-register-panel">
        <div className="admin-register-caption"><span>{data ? `${data.total} accounts` : "Loading register"}</span><span>Personal data / restricted</span></div>
        {data && data.customers.length === 0 ? <AdminEmpty title="No matching customers" /> : (
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Role</th><th>Status</th><th>EGP orders</th><th>Order value · EGP only</th><th>Last active</th><th>Created</th></tr></thead><tbody>
            {data?.customers.map((customer) => <tr key={customer.id}><td><Link className="admin-table-link" href={`/admin/customers/${customer.id}`}>{adminName(customer.firstName, customer.lastName, customer.email)}</Link><small>{customer.email}</small></td><td>{customer.role}</td><td><AdminStatus value={customer.status} /></td><td className="tnum">{customer.orderCount}</td><td className="tnum">{adminMoney(customer.lifetimeValue)}</td><td>{adminDate(customer.lastLoginAt)}</td><td>{adminDate(customer.createdAt, false)}</td></tr>)}
            {!data ? <tr><td colSpan={7} className="admin-table-loading">Loading customer register…</td></tr> : null}
          </tbody></table></div>
        )}
        {data ? <AdminPagination page={data.page} pages={data.totalPages} total={data.total} loading={loading} onPageChange={(page) => void load(page)} /> : null}
      </section>
    </>
  );
}
