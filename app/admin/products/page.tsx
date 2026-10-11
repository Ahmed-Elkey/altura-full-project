"use client";

import { getUserErrorMessage } from "@/lib/api-errors";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminEmpty, AdminError, AdminPageHeader, AdminPagination, AdminStatus } from "@/components/admin/AdminUI";
import { adminDate, adminMoney } from "@/lib/admin-format";

type Product = {
  id: string; slug: string; name: string; status: string; basePrice: number; currency: string; inStock: boolean; featured: boolean; updatedAt: string;
  variants: Array<{ id: string; active: boolean; inventory: { quantity: number; reservedQuantity: number; availableQuantity: number; lowStockThreshold: number } | null }>;
  images: Array<{ id: string; url: string; isPrimary: boolean; position: number }>;
  colorways: Array<{ name: string }>;
};
type ProductResponse = { items: Product[]; total: number; page: number; pages: number };

export default function AdminProductsPage() {
  const router = useRouter();
  const { apiFetch } = useAdminAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<ProductResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", slug: "", description: "", basePrice: "", status: "DRAFT" });

  const load = useCallback(async (page: number, needle = q, nextStatus = status) => {
    setError("");
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), limit: "20" });
    if (needle.trim()) query.set("q", needle.trim());
    if (nextStatus) query.set("status", nextStatus);
    try { setData(await apiFetch<ProductResponse>(`/admin/catalog/products?${query}`)); }
    catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setLoading(false); }
  }, [apiFetch, q, status]);
  useEffect(() => { void load(1, "", ""); }, []);
  function submit(event: FormEvent) { event.preventDefault(); void load(1, q, status); }
  function setName(name: string) {
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setCreateForm((current) => ({ ...current, name, slug: current.slug && current.slug !== current.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ? current.slug : slug }));
  }
  async function createProduct(event: FormEvent) {
    event.preventDefault(); setCreating(true); setError("");
    try {
      const product = await apiFetch<Product>("/admin/catalog/products", { method: "POST", body: JSON.stringify({ ...createForm, basePrice: Number(createForm.basePrice), currency: "EGP" }) });
      router.push(`/admin/products/${product.id}`);
    } catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setCreating(false); }
  }

  return (
    <>
      <AdminPageHeader index="02" eyebrow="Catalogue" title="Products" description="Public, draft and archived equipment mapped to real variants and stock records." action={<button className="admin-primary-button" type="button" onClick={() => setCreateOpen((value) => !value)}>{createOpen ? "Close form" : "Add product"}</button>} />
      {createOpen ? <form className="admin-inline-create admin-panel" onSubmit={createProduct}>
        <label><span>Name</span><input required minLength={2} maxLength={160} value={createForm.name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>Slug</span><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={120} value={createForm.slug} onChange={(event) => setCreateForm({ ...createForm, slug: event.target.value.toLowerCase() })} /></label>
        <label><span>Base price (EGP)</span><input required type="number" min="0" step="0.01" value={createForm.basePrice} onChange={(event) => setCreateForm({ ...createForm, basePrice: event.target.value })} /></label>
        <label><span>Status</span><select value={createForm.status} onChange={(event) => setCreateForm({ ...createForm, status: event.target.value })}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option></select></label>
        <label className="admin-form-wide"><span>Description</span><textarea required minLength={5} maxLength={5000} value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} /></label>
        <button className="admin-secondary-button" type="submit" disabled={creating}>{creating ? "Creating…" : "Create product"}</button>
      </form> : null}
      <form className="admin-filter-bar" onSubmit={submit}>
        <label className="admin-search-field"><span>Search</span><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Product, slug or SKU" /></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All states</option><option value="ACTIVE">ACTIVE</option><option value="DRAFT">DRAFT</option><option value="ARCHIVED">ARCHIVED</option></select></label>
        <button className="admin-secondary-button" type="submit">Apply</button>
      </form>
      {error ? <AdminError message={error} retry={() => void load(data?.page ?? 1)} /> : null}
      <section className="admin-register-panel">
        <div className="admin-register-caption"><span>{data ? `${data.total} products` : "Loading catalogue"}</span><span>Variants / inventory linked</span></div>
        {data && !data.items.length ? <AdminEmpty title="No matching products" /> : <div className="admin-table-wrap"><table className="admin-table admin-table--products"><thead><tr><th>Product</th><th>Status</th><th>Colors</th><th>SKUs</th><th>Available</th><th>Price</th><th>Updated</th></tr></thead><tbody>
          {data?.items.map((product) => {
            const image = [...product.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position)[0];
            const available = product.variants.reduce((sum, variant) => sum + (variant.inventory?.availableQuantity || 0), 0);
            return <tr key={product.id}><td><div className="admin-product-cell"><div className="admin-product-thumb">{image ? <img src={image.url} alt="" /> : <span>ALT</span>}</div><div><Link className="admin-table-link" href={`/admin/products/${product.id}`}>{product.name}</Link><small>/{product.slug}{product.featured ? " · Featured" : ""}</small></div></div></td><td><AdminStatus value={product.status} /></td><td className="tnum">{product.colorways.length}</td><td className="tnum">{product.variants.length}</td><td className="tnum">{available}</td><td className="tnum">{adminMoney(product.basePrice, product.currency)}</td><td>{adminDate(product.updatedAt)}</td></tr>;
          })}
          {!data ? <tr><td colSpan={7} className="admin-table-loading">Loading product register…</td></tr> : null}
        </tbody></table></div>}
        {data ? <AdminPagination page={data.page} pages={data.pages} total={data.total} loading={loading} onPageChange={(page) => void load(page)} /> : null}
      </section>
    </>
  );
}
