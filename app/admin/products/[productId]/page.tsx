"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./editor.module.css";
import { useParams } from "next/navigation";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminEmpty, AdminError, AdminPageHeader, AdminSectionTitle, AdminStatus } from "@/components/admin/AdminUI";
import { getUserErrorMessage } from "@/lib/api-errors";
import { adminMoney } from "@/lib/admin-format";

type Variant = { id: string; sku: string; colorName: string; colorHex: string | null; size: string; price: number; currency: string; active: boolean; inventory: { quantity: number; reservedQuantity: number; availableQuantity: number; lowStockThreshold: number } | null };
type Image = { id: string; url: string; altText: string | null; view: string | null; colorName: string | null; isPrimary: boolean; position: number };
type Product = { id: string; slug: string; name: string; shortDescription: string | null; seoTitle?: string | null; seoDescription?: string | null; description: string; status: string; basePrice: number; compareAtPrice: number | null; currency: string; featured: boolean; inStock: boolean; variants: Variant[]; images: Image[]; categories: Array<{ slug: string; name: string }>; collections: Array<{ slug: string; name: string }> };

const emptyVariant = { sku: "", colorName: "", colorHex: "", size: "", price: "", initialStock: "0", lowStockThreshold: "3" };
const emptyImage = { url: "", altText: "", colorName: "", view: "", isPrimary: false };

export default function AdminProductDetailPage() {
  const params = useParams<{ productId: string }>();
  const { apiFetch } = useAdminAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const recordRef = useRef<Product | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", shortDescription: "", description: "", seoTitle: "", seoDescription: "", basePrice: "", status: "DRAFT", featured: false });
  const [variantForm, setVariantForm] = useState(emptyVariant);
  const [variantDrafts, setVariantDrafts] = useState<Record<string, { sku: string; colorName: string; colorHex: string; size: string; price: string }>>({});
  const [imageForm, setImageForm] = useState(emptyImage);
  const [taxonomy, setTaxonomy] = useState<{ categories: Array<{slug: string; name: string}>; collections: Array<{slug: string; name: string}> }>({ categories: [], collections: [] });
  const [assignments, setAssignments] = useState<{ categorySlugs: string[]; collectionSlugs: string[] }>({ categorySlugs: [], collectionSlugs: [] });
  const [imageDrafts, setImageDrafts] = useState<Record<string, { url: string; altText: string; colorName: string; view: string; position: string; isPrimary: boolean }>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = "all") => {
    setError("");
    try {
      const next = await apiFetch<Product>(`/admin/catalog/products/${params.productId}`);
      const [categories, collections] = await Promise.all([apiFetch<Array<{slug: string; name: string}>>("/admin/catalog/categories"), apiFetch<Array<{slug: string; name: string}>>("/admin/catalog/collections")]);
      const priorRecord = recordRef.current;
      setTaxonomy({ categories, collections });
      if (refresh === "all" || refresh === "product") setAssignments({ categorySlugs: next.categories.map(item => item.slug), collectionSlugs: next.collections.map(item => item.slug) });
      setImageDrafts(previous => Object.fromEntries(next.images.map(image => [image.id, refresh !== "all" && refresh !== `image:${image.id}` && previous[image.id] ? { ...previous[image.id], isPrimary: previous[image.id].isPrimary === priorRecord?.images.find(old => old.id === image.id)?.isPrimary ? image.isPrimary : previous[image.id].isPrimary } : { url: image.url, altText: image.altText || "", colorName: image.colorName || "", view: image.view || "", position: String(image.position), isPrimary: image.isPrimary }])));
      recordRef.current = next;
      setProduct(next);
      if (refresh === "all" || refresh === "product") setForm({ name: next.name, slug: next.slug, shortDescription: next.shortDescription || "", description: next.description, seoTitle: next.seoTitle || "", seoDescription: next.seoDescription || "", basePrice: String(next.basePrice), status: next.status, featured: next.featured });
      setVariantDrafts(previous => Object.fromEntries(next.variants.map((variant) => [variant.id, refresh !== "all" && refresh !== `variant:${variant.id}` && previous[variant.id] ? previous[variant.id] : { sku: variant.sku, colorName: variant.colorName, colorHex: variant.colorHex || "", size: variant.size, price: String(variant.price) }])));
    } catch (cause) { setError(getUserErrorMessage(cause, "admin")); throw cause; }
  }, [apiFetch, params.productId]);
  useEffect(() => { void load().catch(() => undefined); }, [load]);

  async function mutate(task: () => Promise<unknown>, message: string, refresh: string) {
    setBusy(true); setError(""); setSuccess("");
    try { await task(); await load(refresh); setSuccess(message); return true; }
    catch (cause) { setError(getUserErrorMessage(cause, "admin")); return false; }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await mutate(() => apiFetch(`/admin/catalog/products/${params.productId}`, { method: "PATCH", body: JSON.stringify({ ...form, ...assignments, basePrice: Number(form.basePrice) }) }), "Product saved.", "product");
  }
  function archive() {
    if (!product || !window.confirm(`Archive ${product.name}? It will be hidden from the storefront while historical orders remain intact.`)) return;
    void mutate(() => apiFetch(`/admin/catalog/products/${params.productId}/archive`, { method: "POST", body: "{}" }), "Product archived.", "product");
  }
  async function createVariant(event: FormEvent) {
    event.preventDefault();
    if (await mutate(() => apiFetch(`/admin/catalog/products/${params.productId}/variants`, { method: "POST", body: JSON.stringify({ ...variantForm, colorHex: variantForm.colorHex || undefined, price: Number(variantForm.price), currency: product?.currency || "EGP", initialStock: Number(variantForm.initialStock), lowStockThreshold: Number(variantForm.lowStockThreshold) }) }), "Variant and inventory record created.", "variant:new")) setVariantForm(emptyVariant);
  }
  function saveVariant(variant: Variant) {
    const draft = variantDrafts[variant.id];
    if (!draft) return;
    void mutate(() => apiFetch(`/admin/catalog/variants/${variant.id}`, { method: "PATCH", body: JSON.stringify({ ...draft, colorHex: draft.colorHex || undefined, price: Number(draft.price) }) }), "Variant saved.", `variant:${variant.id}`);
  }
  function deactivateVariant(variant: Variant) {
    if (!window.confirm(`Deactivate SKU ${variant.sku}? It will no longer be available for purchase.`)) return;
    void mutate(() => apiFetch(`/admin/catalog/variants/${variant.id}/deactivate`, { method: "POST", body: "{}" }), "Variant deactivated.", "variant:state");
  }
  function reactivateVariant(variant: Variant) {
    void mutate(() => apiFetch(`/admin/catalog/variants/${variant.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) }), "Variant reactivated.", "variant:state");
  }
  async function addImage(event: FormEvent) {
    event.preventDefault();
    if (await mutate(() => apiFetch(`/admin/catalog/products/${params.productId}/images`, { method: "POST", body: JSON.stringify({ ...imageForm, colorName: imageForm.colorName || undefined, view: imageForm.view || undefined, altText: imageForm.altText || undefined }) }), "Image added.", "image:new")) setImageForm(emptyImage);
  }
  async function saveImage(event: FormEvent, image: Image) {
    event.preventDefault(); const draft = imageDrafts[image.id];
    await mutate(() => apiFetch(`/admin/catalog/images/${image.id}`, { method: "PATCH", body: JSON.stringify({ ...draft, position: Number(draft.position) }) }), "Image saved.", `image:${image.id}`);
  }
  function deleteImage(image: Image) {
    if (!window.confirm("Remove this image from the product?")) return;
    void mutate(() => apiFetch(`/admin/catalog/images/${image.id}`, { method: "DELETE" }), "Image removed.", `image:${image.id}`);
  }

  return <>
    <div className="admin-breadcrumb"><Link href="/admin/products">Products</Link><span>/</span><span>{product?.name || params.productId}</span></div>
    <AdminPageHeader index="02A" eyebrow="Product Detail" title={product?.name || "Product record"} description={product ? `${product.variants.length} SKUs · ${product.images.length} images · ${product.currency}` : "Loading catalogue record…"} action={product ? <AdminStatus value={product.status} /> : undefined} />
    {error ? <AdminError message={error} retry={() => void load().catch(() => undefined)} /> : null}
    {success ? <p className="admin-success" role="status">{success}</p> : null}
    {product ? <>
      <section className="admin-product-editor-grid">
        <form className="admin-panel admin-product-form" onSubmit={save}><AdminSectionTitle label="01 / Commerce" title="Product record" /><div className="admin-form-grid"><label><span>Name</span><input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label><span>Slug</span><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} /></label><label><span>Base price</span><input required type="number" min="0" step="0.01" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} /></label><label><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>DRAFT</option><option>ACTIVE</option><option>ARCHIVED</option></select></label><label className="admin-form-wide"><span>Short description</span><input maxLength={240} value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} /></label><label className="admin-form-wide"><span>Description</span><textarea required minLength={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label className="admin-check-row"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /><span>Featured product</span></label></div><div className="admin-taxonomy">{([['categories', 'categorySlugs', 'Category'], ['collections', 'collectionSlugs', 'Collection']] as const).map(([list, key, label]) => <fieldset key={list}><legend>{label === 'Category' ? 'Categories' : 'Collections'}</legend>{taxonomy[list].map(item => <label className="admin-check-row" key={item.slug}><input type="checkbox" aria-label={`${label}: ${item.name}`} checked={assignments[key].includes(item.slug)} onChange={event => setAssignments({ ...assignments, [key]: event.target.checked ? [...assignments[key], item.slug] : assignments[key].filter(slug => slug !== item.slug) })} /><span>{item.name}</span></label>)}{!taxonomy[list].length && <p>No {list} configured. <Link href={`/admin/${list}`}>Manage {list}</Link></p>}</fieldset>)}</div><div className="admin-form-grid"><label className="admin-form-wide"><span>SEO title</span><input maxLength={180} disabled={busy} value={form.seoTitle} placeholder="Use product name automatically" onChange={event => setForm({ ...form, seoTitle: event.target.value })} /></label><label className="admin-form-wide"><span id="product-seo-description-label">SEO description</span><textarea aria-labelledby="product-seo-description-label" maxLength={320} disabled={busy} value={form.seoDescription} placeholder="Use product description automatically" onChange={event => setForm({ ...form, seoDescription: event.target.value })} /></label><p className="admin-form-wide">Leave SEO fields empty to use the product name and description. Describe the actual product clearly; suggested lengths are around 60 characters for the title and 160 for the description.</p></div><div className="admin-action-row"><button className="admin-primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save product"}</button>{product.status !== "ARCHIVED" ? <button className="admin-danger-button" type="button" disabled={busy} onClick={archive}>Archive product</button> : null}</div></form>
        <aside className="admin-panel"><AdminSectionTitle label="02 / Imagery" title="Asset set" /><form className="admin-form-grid" onSubmit={addImage}><label className="admin-form-wide"><span>Image URL</span><input required type="url" maxLength={2000} value={imageForm.url} onChange={(e) => setImageForm({ ...imageForm, url: e.target.value })} /></label><label><span>Alt text</span><input maxLength={200} value={imageForm.altText} onChange={(e) => setImageForm({ ...imageForm, altText: e.target.value })} /></label><label><span>Color</span><input maxLength={60} value={imageForm.colorName} onChange={(e) => setImageForm({ ...imageForm, colorName: e.target.value })} /></label><label><span>View</span><input maxLength={60} value={imageForm.view} onChange={(e) => setImageForm({ ...imageForm, view: e.target.value })} /></label><label className="admin-check-row"><input type="checkbox" checked={imageForm.isPrimary} onChange={(e) => setImageForm({ ...imageForm, isPrimary: e.target.checked })} /><span>Primary image</span></label><button className="admin-secondary-button" type="submit" disabled={busy}>Add image</button></form><div className={`admin-image-grid ${styles.images}`}>{product.images.map((image, index) => { const draft = imageDrafts[image.id]; return draft ? <form key={image.id} role="group" aria-label={`Edit image ${index + 1}`} onSubmit={event => void saveImage(event, image)}><img src={image.url} alt={image.altText || ""} />{([['url', 'Image URL'], ['altText', 'Alt text'], ['colorName', 'Color'], ['view', 'View'], ['position', 'Position']] as const).map(([key, label]) => <label key={key}><span>{label}</span><input required={key === 'url' || key === 'position'} type={key === 'position' ? 'number' : 'text'} min={key === 'position' ? 0 : undefined} step={key === 'position' ? 1 : undefined} maxLength={key === 'url' ? 2000 : key === 'altText' ? 200 : key === 'position' ? undefined : 60} value={draft[key]} onChange={event => setImageDrafts({ ...imageDrafts, [image.id]: { ...draft, [key]: event.target.value } })} /></label>)}<label className="admin-check-row"><input type="checkbox" checked={draft.isPrimary} onChange={event => setImageDrafts({ ...imageDrafts, [image.id]: { ...draft, isPrimary: event.target.checked } })} /><span>Primary image</span></label><button className="admin-row-action" disabled={busy} type="submit">Save image</button><button className="admin-row-action" type="button" disabled={busy} onClick={() => deleteImage(image)}>Remove</button></form> : null; })}</div><div className="admin-taxonomy"><span>Categories</span><p>{product.categories.map((item) => item.name).join(" · ") || "—"}</p><span>Collections</span><p>{product.collections.map((item) => item.name).join(" · ") || "—"}</p></div></aside>
      </section>
      <section className="admin-panel"><AdminSectionTitle label="03 / SKU matrix" title="Variants & inventory" /><form className="admin-inline-create" onSubmit={createVariant}><label><span>SKU</span><input required minLength={3} value={variantForm.sku} onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value.toUpperCase() })} /></label><label><span>Color</span><input required value={variantForm.colorName} onChange={(e) => setVariantForm({ ...variantForm, colorName: e.target.value })} /></label><label><span>Color hex</span><input placeholder="#ded8ca" value={variantForm.colorHex} onChange={(e) => setVariantForm({ ...variantForm, colorHex: e.target.value })} /></label><label><span>Size</span><input required value={variantForm.size} onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })} /></label><label><span>Price</span><input required type="number" min="0" step="0.01" value={variantForm.price} onChange={(e) => setVariantForm({ ...variantForm, price: e.target.value })} /></label><label><span>Initial stock</span><input required type="number" min="0" step="1" value={variantForm.initialStock} onChange={(e) => setVariantForm({ ...variantForm, initialStock: e.target.value })} /></label><label><span>Low stock at</span><input required type="number" min="0" step="1" value={variantForm.lowStockThreshold} onChange={(e) => setVariantForm({ ...variantForm, lowStockThreshold: e.target.value })} /></label><button className="admin-secondary-button" type="submit" disabled={busy}>Add variant</button></form>
        {!product.variants.length ? <AdminEmpty title="No variants yet" detail="Add the first purchasable size and color above." /> : <div className="admin-variant-editor">{product.variants.map((variant) => { const draft = variantDrafts[variant.id]; return draft ? <div className="admin-variant-card" key={variant.id}><div className="admin-variant-card__state"><AdminStatus value={variant.active ? "ACTIVE" : "DISABLED"} /><span>{variant.inventory?.availableQuantity ?? 0} available</span></div><label><span>SKU</span><input value={draft.sku} onChange={(e) => setVariantDrafts({ ...variantDrafts, [variant.id]: { ...draft, sku: e.target.value.toUpperCase() } })} /></label><label><span>Color</span><input value={draft.colorName} onChange={(e) => setVariantDrafts({ ...variantDrafts, [variant.id]: { ...draft, colorName: e.target.value } })} /></label><label><span>Hex</span><input value={draft.colorHex} onChange={(e) => setVariantDrafts({ ...variantDrafts, [variant.id]: { ...draft, colorHex: e.target.value } })} /></label><label><span>Size</span><input value={draft.size} onChange={(e) => setVariantDrafts({ ...variantDrafts, [variant.id]: { ...draft, size: e.target.value } })} /></label><label><span>Price</span><input type="number" min="0" step="0.01" value={draft.price} onChange={(e) => setVariantDrafts({ ...variantDrafts, [variant.id]: { ...draft, price: e.target.value } })} /></label><div className="admin-action-row"><button className="admin-row-action" type="button" disabled={busy} onClick={() => saveVariant(variant)}>Save variant</button>{variant.active ? <button className="admin-row-action" type="button" disabled={busy} onClick={() => deactivateVariant(variant)}>Deactivate</button> : <button className="admin-row-action" type="button" disabled={busy} onClick={() => reactivateVariant(variant)}>Reactivate</button>}</div><small>{adminMoney(variant.price, variant.currency)} · {variant.inventory?.quantity ?? 0} physical / {variant.inventory?.reservedQuantity ?? 0} reserved</small></div> : null; })}</div>}
        <Link className="admin-inline-link" href={`/admin/inventory?q=${encodeURIComponent(product.name)}`}>Open inventory controls →</Link></section>
    </> : null}
  </>;
}
