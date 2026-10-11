"use client";

import { getUserErrorMessage } from "@/lib/api-errors";
import { FormEvent, useEffect, useState } from "react";
import { useCustomerAuth } from "./CustomerAuthProvider";
import { Modal } from "./Modal";
import { COUNTRIES, REGIONS, countryFlag, countryName, countryPrefix } from "../regions";

export type Address = {id:string; label:string|null; recipientName:string; phone:string|null; line1:string; line2:string|null; city:string; region:string|null; postalCode:string|null; countryCode:string; isDefaultShipping:boolean; isDefaultBilling:boolean};

export type AddressFormState = {firstName:string; lastName:string; phone:string; line1:string; city:string; region:string; postalCode:string; countryCode:string; isDefault:boolean};

export const blankAddressForm: AddressFormState = {firstName:"",lastName:"",phone:"",line1:"",city:"",region:"",postalCode:"",countryCode:"EG",isDefault:false};

export function splitName(recipient: string): [string, string] {
  const parts = recipient.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return ["", ""];
  if (parts.length === 1) return [parts[0], ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

export function addressToForm(a: Address): AddressFormState {
  const [firstName, lastName] = splitName(a.recipientName);
  return {firstName, lastName, phone:a.phone||"", line1:a.line1, city:a.city, region:a.region||"", postalCode:a.postalCode||"", countryCode:a.countryCode, isDefault:a.isDefaultShipping||a.isDefaultBilling};
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="acct-chev">
      <path d="M3 5.5 7 9.5 11 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AddressModal({ open, address, onClose, onSaved }: { open: boolean; address: Address | null; onClose: () => void; onSaved: () => void }) {
  const { apiFetch } = useCustomerAuth();
  const [form, setForm] = useState<AddressFormState>(blankAddressForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(address ? addressToForm(address) : blankAddressForm);
      setErrors({});
      setError("");
      setBusy(false);
      setSaved(false);
    }
  }, [open, address]);

  function update<K extends keyof AddressFormState>(k: K, v: AddressFormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((prev) => { if (!prev[k as string]) return prev; const n = { ...prev }; delete n[k as string]; return n; });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!form.firstName.trim()) fe.firstName = "Enter a first name";
    if (!form.lastName.trim()) fe.lastName = "Enter a last name";
    if (!form.line1.trim()) fe.line1 = "Enter an address";
    if (!form.city.trim()) fe.city = "Enter a city";
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const path = address ? `/users/me/addresses/${address.id}` : "/users/me/addresses";
      const method = address ? "PATCH" : "POST";
      await apiFetch(path, { method, body: JSON.stringify({
        recipientName: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        phone: form.phone.trim() || undefined,
        line1: form.line1.trim(),
        city: form.city.trim(),
        region: form.region || undefined,
        postalCode: form.postalCode.trim() || undefined,
        countryCode: form.countryCode,
        isDefaultShipping: form.isDefault || undefined,
        isDefaultBilling: form.isDefault || undefined,
      })});
      onSaved();
      setSaved(true);
      await new Promise((r) => setTimeout(r, 700));
      onClose();
    } catch (err) {
      setError(getUserErrorMessage(err, "profile"));
    } finally {
      setBusy(false);
    }
  }

  const regions = REGIONS[form.countryCode] ?? [];
  const valid = Boolean(form.firstName.trim() && form.lastName.trim() && form.line1.trim() && form.city.trim() && form.countryCode);

  return (
    <Modal open={open} label={address ? "Edit address" : "Add address"} onClose={onClose}>
      <h2 className="acct-modal__title">{address ? "Edit address" : "Add address"}</h2>
      <form onSubmit={submit} noValidate>
          <div className="acct-cell">
            <div className="acct-field acct-field--select">
              <span className="acct-float">Country/region</span>
              <span className="acct-selectRow">
                <select value={form.countryCode} onChange={(e) => { update("countryCode", e.target.value); update("region", ""); }} aria-label="Country/region">
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
                <Chevron />
              </span>
            </div>
          </div>

          <div className="acct-row2">
            <div className="acct-cell">
              <div className={`acct-field${errors.firstName ? " is-error" : ""}`}>
                <input placeholder="First name" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} autoComplete="given-name" />
              </div>
              {errors.firstName ? <p className="acct-fieldErr">{errors.firstName}</p> : null}
            </div>
            <div className="acct-cell">
              <div className={`acct-field${errors.lastName ? " is-error" : ""}`}>
                <input placeholder="Last name" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} autoComplete="family-name" />
              </div>
              {errors.lastName ? <p className="acct-fieldErr">{errors.lastName}</p> : null}
            </div>
          </div>

          <div className="acct-cell">
            <div className={`acct-field${errors.line1 ? " is-error" : ""}`}>
              <input placeholder="Address" value={form.line1} onChange={(e) => update("line1", e.target.value)} autoComplete="street-address" />
            </div>
            {errors.line1 ? <p className="acct-fieldErr">{errors.line1}</p> : null}
          </div>

          <div className="acct-row3">
            <div className="acct-cell">
              <div className={`acct-field${errors.city ? " is-error" : ""}`}>
                <input placeholder="City" value={form.city} onChange={(e) => update("city", e.target.value)} autoComplete="address-level2" />
              </div>
              {errors.city ? <p className="acct-fieldErr">{errors.city}</p> : null}
            </div>
            <div className="acct-cell">
              <div className="acct-field acct-field--select">
                <span className="acct-float">Province</span>
                <span className="acct-selectRow">
                  <select value={form.region} data-empty={!form.region} onChange={(e) => update("region", e.target.value)} aria-label="Province">
                    <option value="">{regions.length ? "Select" : "—"}</option>
                    {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <Chevron />
                </span>
              </div>
            </div>
            <div className="acct-cell">
              <div className="acct-field">
                <input placeholder="Postal code" value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} autoComplete="postal-code" />
              </div>
            </div>
          </div>

          <div className="acct-cell">
            <div className="acct-field">
              <span className="acct-float">Phone</span>
              <span className="acct-phoneRow">
                <input placeholder={`${countryPrefix(form.countryCode)} …`} value={form.phone} onChange={(e) => update("phone", e.target.value)} autoComplete="tel" />
                <span className="acct-phoneMeta">
                  <span className="acct-divider" aria-hidden="true" />
                  <span className="acct-flag" role="img" aria-label={countryName(form.countryCode)}>{countryFlag(form.countryCode)}</span>
                  <Chevron />
                </span>
              </span>
            </div>
          </div>

          <label className="acct-check">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => update("isDefault", e.target.checked)} />
            <span className="acct-box" aria-hidden="true">{form.isDefault ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6 5 8.5 9.5 3.5" stroke="var(--button-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}</span>
            This is my default address
          </label>

          {error ? <p className="acct-err">{error}</p> : null}

          <div className="acct-actions">
            <button type="button" className="acct-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className={`acct-save${valid ? " is-ready" : ""}${busy ? " is-busy" : ""}${saved ? " is-success" : ""}`} disabled={busy || saved}>{saved ? "✓ Saved" : busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
    </Modal>
  );
}
