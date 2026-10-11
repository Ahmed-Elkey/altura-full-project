"use client";

import { getUserErrorMessage } from "@/lib/api-errors";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminEmpty, AdminError, AdminPageHeader, AdminPagination, AdminStatus } from "@/components/admin/AdminUI";
import { adminDate } from "@/lib/admin-format";

type InventoryRow = {
  id: string; variantId: string; sku: string; colorName: string; size: string; variantActive: boolean;
  product: { id: string; slug: string; name: string; status: string };
  quantity: number; reservedQuantity: number; availableQuantity: number; lowStockThreshold: number; lowStock: boolean; updatedAt: string;
};
type InventoryResponse = { items: InventoryRow[]; page: number; limit: number; total: number; pages: number };

export default function AdminInventoryPage() {
  const params = useSearchParams();
  const { apiFetch } = useAdminAuth();
  const [q, setQ] = useState(params.get("q") || "");
  const [lowStock, setLowStock] = useState(params.get("lowStock") === "true");
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [thresholds, setThresholds] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const applied = useRef({ q: params.get("q") || "", low: params.get("lowStock") === "true" });
  const generation = useRef(0);
  const pendingRefresh = useRef<string | undefined>(undefined);

  const load = useCallback(async (page: number, needle = applied.current.q, low = applied.current.low, savedId?: string) => {
    const current = ++generation.current;
    setError("");
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), limit: "50" });
    if (needle.trim()) query.set("q", needle.trim());
    if (low) query.set("lowStock", "true");
    try {
      const next = await apiFetch<InventoryResponse>(`/admin/inventory?${query}`);
      if (current !== generation.current) return false;
      applied.current = { q: needle, low };
      setData(next);
      setDrafts(previous => Object.fromEntries(next.items.map(row => [row.variantId, savedId && row.variantId !== savedId && previous[row.variantId] !== undefined ? previous[row.variantId] : String(row.quantity)])));
      setThresholds(previous => Object.fromEntries(next.items.map(row => [row.variantId, savedId && row.variantId !== savedId && previous[row.variantId] !== undefined ? previous[row.variantId] : String(row.lowStockThreshold)])));
      pendingRefresh.current = undefined;
      return true;
    } catch (cause) { if (current === generation.current) setError(getUserErrorMessage(cause, "admin")); return false; }
    finally { if (current === generation.current) setLoading(false); }
  }, [apiFetch]);
  useEffect(() => { void load(1, params.get("q") || "", params.get("lowStock") === "true"); }, []);
  function submit(event: FormEvent) { event.preventDefault(); void load(1, q, lowStock); }

  async function save(row: InventoryRow) {
    if (saving !== null || loading) return;
    const quantity = Number(drafts[row.variantId]);
    const threshold = Number(thresholds[row.variantId]);
    if (!Number.isInteger(quantity) || quantity < row.reservedQuantity) {
      setError(`Quantity for ${row.sku} must be an integer at least equal to reserved stock (${row.reservedQuantity}).`);
      return;
    }
    if (!Number.isInteger(threshold) || threshold < 0) {
      setError(`Low-stock threshold for ${row.sku} must be a non-negative integer.`); return;
    }
    setSaving(row.variantId); setError(""); setSuccess("");
    try {
      await apiFetch(`/admin/inventory/${row.variantId}`, { method: "PATCH", body: JSON.stringify({ quantity, lowStockThreshold: threshold, note: "Updated from ALTURA Studio" }) });
      pendingRefresh.current = row.variantId;
      if (await load(data?.page ?? 1, applied.current.q, applied.current.low, row.variantId)) setSuccess(`${row.sku} inventory saved.`);
    } catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setSaving(null); }
  }

  return <>
    <AdminPageHeader index="03" eyebrow="Inventory Ledger" title="Inventory" description="Physical, reserved and sellable stock at exact SKU level. Reserved units are never silently overwritten." />
    <form className="admin-filter-bar" onSubmit={submit}>
      <label className="admin-search-field"><span>Search</span><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Product, SKU, color or size" /></label>
      <label className="admin-check-filter"><input type="checkbox" checked={lowStock} onChange={(event) => setLowStock(event.target.checked)} /><span>Low stock only</span></label>
      <button className="admin-secondary-button" type="submit" disabled={loading || saving !== null}>Apply</button>
    </form>
    {error ? <AdminError message={error} retry={() => { if (!saving && !loading) void load(data?.page ?? 1, applied.current.q, applied.current.low, pendingRefresh.current); }} /> : null}
    {success ? <p className="admin-success" role="status">{success}</p> : null}
    <section className="admin-register-panel">
      <div className="admin-register-caption"><span>{data ? `${data.total} SKU records` : "Loading ledger"}</span><span>Physical − reserved = available</span></div>
      {data && !data.items.length ? <AdminEmpty title="No matching inventory" /> : <div className="admin-table-wrap"><table className="admin-table admin-table--inventory"><thead><tr><th>Product / SKU</th><th>Variant</th><th>State</th><th>Physical</th><th>Reserved</th><th>Available</th><th>Threshold</th><th>Updated</th><th /></tr></thead><tbody>{data?.items.map((row) => { const state = !row.variantActive ? "DISABLED" : row.availableQuantity <= 0 ? "OUT_OF_STOCK" : row.availableQuantity <= row.lowStockThreshold ? "LOW_STOCK" : "IN_STOCK"; const unchanged = String(row.quantity) === drafts[row.variantId] && String(row.lowStockThreshold) === thresholds[row.variantId]; return <tr key={row.variantId} className={row.lowStock ? "is-low-stock" : ""}><td><Link className="admin-table-link" href={`/admin/products/${row.product.id}`}>{row.product.name}</Link><small className="admin-mono">{row.sku}</small></td><td>{row.colorName} / {row.size}</td><td><AdminStatus value={state} /></td><td><input aria-label={`Physical stock for ${row.sku}`} className="admin-quantity-input" disabled={loading || saving === row.variantId} inputMode="numeric" value={drafts[row.variantId] ?? row.quantity} onChange={(event) => setDrafts({ ...drafts, [row.variantId]: event.target.value })} /></td><td className="tnum">{row.reservedQuantity}</td><td className="tnum"><strong>{row.availableQuantity}</strong></td><td><input aria-label={`Low stock threshold for ${row.sku}`} className="admin-quantity-input" disabled={loading || saving === row.variantId} inputMode="numeric" value={thresholds[row.variantId] ?? row.lowStockThreshold} onChange={(event) => setThresholds({ ...thresholds, [row.variantId]: event.target.value })} /></td><td>{adminDate(row.updatedAt)}</td><td><button type="button" className="admin-row-action" disabled={saving !== null || loading || unchanged} onClick={() => void save(row)}>{saving === row.variantId ? "Saving" : "Save"}</button></td></tr>; })}{!data ? <tr><td colSpan={9} className="admin-table-loading">Loading inventory…</td></tr> : null}</tbody></table></div>}
      {data ? <AdminPagination page={data.page} pages={data.pages} total={data.total} loading={loading || saving !== null} onPageChange={(page) => void load(page)} /> : null}
    </section>
  </>;
}
