"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { getUserErrorMessage } from "@/lib/api-errors";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminEmpty, AdminError, AdminPageHeader, AdminSectionTitle, AdminStatus } from "@/components/admin/AdminUI";
import { adminMoney } from "@/lib/admin-format";

type Method = { id: string; code: string; name: string; currency: string; price: number; freeAbove: number | null; estimatedMinDays: number | null; estimatedMaxDays: number | null; active: boolean };
type Zone = { id: string; name: string; countries: string[]; active: boolean; methods: Method[] };
const blankZone = { name: "", countries: "", active: true };
const blankMethod = { zoneId: "", name: "", code: "", currency: "EGP", price: "0", freeAbove: "", estimatedMinDays: "", estimatedMaxDays: "", active: true };
export default function AdminShippingPage() {
  const { apiFetch } = useAdminAuth();
  const [data, setData] = useState<Zone[] | null>(null);
  const [zoneForm, setZoneForm] = useState(blankZone); const [methodForm, setMethodForm] = useState(blankMethod);
  const [editor, setEditor] = useState<{ kind: "zones" | "methods"; id?: string } | null>(null);
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setData(await apiFetch<Zone[]>("/admin/shipping")); }, [apiFetch]);
  useEffect(() => { void load().catch(cause => setError(getUserErrorMessage(cause, "admin"))); }, [load]);
  function editZone(zone?: Zone) { setError(""); setSuccess(""); setEditor({ kind: "zones", id: zone?.id }); setZoneForm(zone ? { name: zone.name, countries: zone.countries.join(", "), active: zone.active } : blankZone); }
  function editMethod(zone: Zone, method?: Method) { setError(""); setSuccess(""); setEditor({ kind: "methods", id: method?.id }); setMethodForm(method ? { zoneId: zone.id, name: method.name, code: method.code, currency: method.currency, price: String(method.price), freeAbove: method.freeAbove == null ? "" : String(method.freeAbove), estimatedMinDays: method.estimatedMinDays == null ? "" : String(method.estimatedMinDays), estimatedMaxDays: method.estimatedMaxDays == null ? "" : String(method.estimatedMaxDays), active: method.active } : { ...blankMethod, zoneId: zone.id }); }
  async function mutate(path: string, method: string, body: unknown, message: string) {
    setBusy(true); setError(""); setSuccess("");
    try { await apiFetch(path, { method, body: JSON.stringify(body) }); setEditor(null); setSuccess(message); await load(); }
    catch (cause) { setError(getUserErrorMessage(cause, "admin")); } finally { setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault(); if (!editor) return;
    if (editor.kind === "methods" && methodForm.estimatedMinDays !== "" && methodForm.estimatedMaxDays !== "" && Number(methodForm.estimatedMinDays) > Number(methodForm.estimatedMaxDays)) { setError("Minimum delivery days cannot exceed maximum delivery days."); return; }
    const nullable = (value: string) => value === "" ? null : Number(value);
    const body = editor.kind === "zones" ? { ...zoneForm, name: zoneForm.name.trim(), countries: zoneForm.countries.split(/[\s,]+/).filter(Boolean).map(code => code.toUpperCase()) } : { ...methodForm, name: methodForm.name.trim(), price: Number(methodForm.price), freeAbove: nullable(methodForm.freeAbove), estimatedMinDays: nullable(methodForm.estimatedMinDays), estimatedMaxDays: nullable(methodForm.estimatedMaxDays) };
    void mutate(`/admin/shipping/${editor.kind}${editor.id ? `/${editor.id}` : ""}`, editor.id ? "PATCH" : "POST", body, editor.kind === "zones" ? "Zone saved." : "Method saved.");
  }
  function deactivate(kind: "zones" | "methods", id: string, name: string) {
    if (window.confirm(`Deactivate ${name}? Checkout will stop offering it; historical shipments are preserved.`)) void mutate(`/admin/shipping/${kind}/${id}/deactivate`, "POST", {}, "Shipping rule deactivated.");
  }
  return <>
    <AdminPageHeader index="08" eyebrow="Delivery Rules" title="Shipping" description="Configure checkout zones, prices, free delivery thresholds and delivery estimates. Deactivation preserves historical shipments." action={<button className="admin-primary-button" disabled={busy} type="button" onClick={() => editZone()}>Add zone</button>} />
    {error && <AdminError message={error} />}{success && <p className="admin-success" role="status">{success}</p>}
    {editor && <form className="admin-panel admin-form-grid" onSubmit={save}>
      {editor.kind === "zones" ? <><label><span>Zone name</span><input required maxLength={100} value={zoneForm.name} onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })} /></label><label><span>Country codes</span><input required placeholder="EG, AE" value={zoneForm.countries} onChange={e => setZoneForm({ ...zoneForm, countries: e.target.value })} /></label><label className="admin-check-row"><input type="checkbox" checked={zoneForm.active} onChange={e => setZoneForm({ ...zoneForm, active: e.target.checked })} /><span>Active zone</span></label></> : <>
        <label><span>Method name</span><input required maxLength={100} value={methodForm.name} onChange={e => setMethodForm({ ...methodForm, name: e.target.value })} /></label>
        <label><span>Code</span><input required pattern="[A-Z0-9_-]+" maxLength={60} value={methodForm.code} onChange={e => setMethodForm({ ...methodForm, code: e.target.value.toUpperCase() })} /></label>
        <label><span>Currency</span><input required pattern="[A-Z]{3}" maxLength={3} value={methodForm.currency} onChange={e => setMethodForm({ ...methodForm, currency: e.target.value.toUpperCase() })} /></label>
        {([['price', 'Price'], ['freeAbove', 'Free above'], ['estimatedMinDays', 'Minimum days'], ['estimatedMaxDays', 'Maximum days']] as const).map(([key, label]) => <label key={key}><span>{label}</span><input required={key === 'price'} type="number" min="0" max={key.startsWith('estimated') ? 365 : 9999999999.99} step={key.startsWith('estimated') ? 1 : 0.01} value={methodForm[key]} onChange={e => setMethodForm({ ...methodForm, [key]: e.target.value })} /></label>)}
        <label className="admin-check-row"><input type="checkbox" checked={methodForm.active} onChange={e => setMethodForm({ ...methodForm, active: e.target.checked })} /><span>Active method</span></label>
      </>}
      <div className="admin-action-row"><button className="admin-primary-button" disabled={busy} type="submit">{busy ? "Saving…" : editor.kind === "zones" ? "Save zone" : "Save method"}</button><button className="admin-secondary-button" disabled={busy} type="button" onClick={() => setEditor(null)}>Cancel</button></div>
    </form>}
    {!data?.length && data ? <AdminEmpty title="No shipping zones" detail="Add a zone to configure delivery." /> : <div className="admin-dashboard-split">{data?.map(zone => <section className="admin-panel" key={zone.id}>
      <AdminSectionTitle label="Zone" title={zone.name} /><div className="admin-register-caption"><span>{zone.countries.join(" · ")}</span><AdminStatus value={zone.active ? "ACTIVE" : "DISABLED"} /></div>
      <div className="admin-action-row"><button className="admin-row-action" disabled={busy} type="button" onClick={() => editZone(zone)}>Edit zone</button><button className="admin-row-action" disabled={busy} type="button" onClick={() => editMethod(zone)}>Add method</button>{zone.active && <button className="admin-row-action" disabled={busy} type="button" onClick={() => deactivate("zones", zone.id, zone.name)}>Deactivate zone</button>}</div>
      {zone.methods.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Method</th><th>Price</th><th>Free above</th><th>Estimate</th><th>State</th><th>Actions</th></tr></thead><tbody>{zone.methods.map(method => <tr key={method.id}><td>{method.name}<small className="admin-muted"> {method.code}</small></td><td>{adminMoney(method.price, method.currency)}</td><td>{method.freeAbove === null ? "—" : adminMoney(method.freeAbove, method.currency)}</td><td>{method.estimatedMinDays ?? "—"}–{method.estimatedMaxDays ?? "—"} days</td><td><AdminStatus value={method.active ? "ACTIVE" : "DISABLED"} /></td><td><button className="admin-row-action" disabled={busy} type="button" onClick={() => editMethod(zone, method)}>Edit {method.name}</button>{method.active && <button className="admin-row-action" disabled={busy} type="button" onClick={() => deactivate("methods", method.id, method.name)}>Deactivate</button>}</td></tr>)}</tbody></table></div> : <p className="admin-muted">No methods configured for this zone.</p>}
    </section>) ?? <p>Loading shipping configuration…</p>}</div>}
  </>;
}
