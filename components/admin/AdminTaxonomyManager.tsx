"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "./AdminAuthProvider";
import { AdminError, AdminPageHeader, AdminEmpty, AdminStatus } from "./AdminUI";
import { getUserErrorMessage } from "@/lib/api-errors";

type Item = { id: string; name: string; slug: string; description: string | null; position: number; parent?: { slug: string } | null; heroImageUrl?: string | null; status?: string; _count?: { products: number } };
const blank = { name: "", slug: "", description: "", position: "0", parentSlug: "", heroImageUrl: "", status: "DRAFT" };
export function AdminTaxonomyManager({ kind }: { kind: "categories" | "collections" }) {
  const { apiFetch } = useAdminAuth();
  const singular = kind === "categories" ? "category" : "collection";
  const [items, setItems] = useState<Item[] | null>(null);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const load = useCallback(async () => { setItems(await apiFetch<Item[]>(`/admin/catalog/${kind}`)); }, [apiFetch, kind]);
  useEffect(() => { void load().catch(cause => setError(getUserErrorMessage(cause, "admin"))); }, [load]);
  function edit(item?: Item) {
    if (busy) return;
    setEditing(item?.id ?? null); setError(""); setSuccess("");
    setForm(item ? { name: item.name, slug: item.slug, description: item.description || "", position: String(item.position), parentSlug: item.parent?.slug || "", heroImageUrl: item.heroImageUrl || "", status: item.status || "DRAFT" } : blank);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(""); setSuccess("");
    const body = { name: form.name.trim(), slug: form.slug, description: form.description, position: Number(form.position), ...(kind === "categories" ? { parentSlug: form.parentSlug } : { heroImageUrl: form.heroImageUrl, status: form.status }) };
    try {
      await apiFetch(`/admin/catalog/${kind}${editing ? `/${editing}` : ""}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) });
      setEditing(undefined); setSuccess(`${singular[0].toUpperCase() + singular.slice(1)} saved.`); await load();
    } catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setBusy(false); }
  }
  return <>
    <AdminPageHeader index="CAT" eyebrow="Catalog organization" title={kind === "categories" ? "Categories" : "Collections"} description="Manage storefront organization and display order." action={<button disabled={busy} type="button" className="admin-primary-button" onClick={() => edit()}>Add {singular}</button>} />
    {error && <AdminError message={error} />}{success && <p className="admin-success" role="status">{success}</p>}
    {editing !== undefined && <form className="admin-panel admin-form-grid" onSubmit={save}>
      <label><span>Name</span><input disabled={busy} required maxLength={kind === "categories" ? 100 : 120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label><span>Slug</span><input disabled={busy} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase() })} /></label>
      <label><span>Position</span><input disabled={busy} required type="number" min="0" step="1" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} /></label>
      {kind === "categories" ? <label><span>Parent category</span><select disabled={busy} value={form.parentSlug} onChange={e => setForm({ ...form, parentSlug: e.target.value })}><option value="">No parent</option>{items?.filter(item => item.id !== editing).map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label> : <><label><span>Status</span><select disabled={busy} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>DRAFT</option><option>ACTIVE</option><option>ARCHIVED</option></select></label><label className="admin-form-wide"><span>Hero image URL</span><input disabled={busy} type="url" maxLength={2000} value={form.heroImageUrl} onChange={e => setForm({ ...form, heroImageUrl: e.target.value })} /></label></>}
      <label className="admin-form-wide"><span>Description</span><textarea disabled={busy} maxLength={kind === "categories" ? 2000 : 3000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <div className="admin-action-row"><button disabled={busy} className="admin-primary-button" type="submit">{busy ? "Saving…" : `Save ${singular}`}</button><button disabled={busy} className="admin-secondary-button" type="button" onClick={() => setEditing(undefined)}>Cancel</button></div>
    </form>}
    <section className="admin-panel">{items?.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Slug</th><th>Position</th><th>{kind === "categories" ? "Parent" : "Status"}</th><th>Products</th><th>Action</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.slug}</td><td>{item.position}</td><td>{kind === "categories" ? item.parent?.slug || "—" : <AdminStatus value={item.status || "DRAFT"} />}</td><td>{item._count?.products ?? 0}</td><td><button disabled={busy} className="admin-row-action" type="button" onClick={() => edit(item)}>Edit {item.name}</button></td></tr>)}</tbody></table></div> : items ? <AdminEmpty title={`No ${kind}`} detail={`Add a ${singular} to organize products.`} /> : <p>Loading…</p>}</section>
  </>;
}
