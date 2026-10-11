"use client";

import { getUserErrorMessage } from "@/lib/api-errors";

import Link from "next/link";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useCustomerAuth } from "./CustomerAuthProvider";
import { Modal } from "./Modal";
import { AddressModal, type Address } from "./AddressModal";
import { countryName } from "../regions";

export function ProfileClient() {
  const { user, apiFetch, refresh, logout } = useCustomerAuth();
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [editingContact, setEditingContact] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressError, setAddressError] = useState("");
  const [addrModal, setAddrModal] = useState<{ open: boolean; address: Address | null }>({ open: false, address: null });
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteSaved, setDeleteSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [emailErr, setEmailErr] = useState("");

  const loadAddresses = useCallback(async () => {
    setAddressLoading(true);
    setAddressError("");
    try {
      setAddresses(await apiFetch<Address[]>("/users/me/addresses"));
    } catch (caught) {
      setAddressError(getUserErrorMessage(caught, "profile"));
    } finally {
      setAddressLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { void loadAddresses(); }, [loadAddresses]);

  async function removeAddress() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteSaved(false);
    try {
      await apiFetch(`/users/me/addresses/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteSaved(true);
      await new Promise((r) => setTimeout(r, 700));
      setDeleteTarget(null);
      await loadAddresses();
    } catch (caught) {
      setAddressError(getUserErrorMessage(caught, "profile"));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      await logout();
      // The account guard owns the redirect after the session is cleared.
    } catch (caught) {
      setSignOutError(getUserErrorMessage(caught, "session"));
    } finally {
      setSigningOut(false);
    }
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const profileReady = Boolean(firstName.trim() && lastName.trim() && emailValid);

  async function saveContact(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !emailValid) {
      if (!emailValid) setEmailErr("Enter a valid email address");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    setSaved(false);
    try {
      await apiFetch("/users/me", { method: "PATCH", body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() }) });
      await refresh();
      setMsg("Saved");
      setSaved(true);
      await new Promise((r) => setTimeout(r, 700));
      setEditingContact(false);
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setErr(getUserErrorMessage(e, "profile"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="balmoral-profile">
      {/* Contact */}
      <div className="balmoral-profile__head">
        <h2>Contact</h2>
        <button type="button" className="balmoral-profile__editBtn" onClick={() => { setSaved(false); setFirstName(user?.firstName || ""); setLastName(user?.lastName || ""); setEmail(user?.email || ""); setPhone(user?.phone || ""); setEmailErr(""); setErr(""); setMsg(""); setEditingContact(true); }}>
          Edit
        </button>
      </div>

      <div className="balmoral-profile__card">
        <span className="balmoral-profile__label">Email</span>
        <span className="balmoral-profile__value">{user?.email}</span>
      </div>

      <Modal open={editingContact} label="Edit profile" onClose={() => setEditingContact(false)}>
        <h2 className="acct-modal__title">Edit profile</h2>
        <form onSubmit={saveContact} noValidate>
          <div className="acct-row2">
            <div className="acct-cell">
              <div className="acct-field">
                <input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
              </div>
            </div>
            <div className="acct-cell">
              <div className="acct-field">
                <input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
              </div>
            </div>
          </div>
          <div className="acct-cell">
            <div className={`acct-field acct-field--select${emailErr ? " is-error" : ""}`}>
              <span className="acct-float">Email</span>
              <span className="acct-selectRow">
                <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailErr(""); }} autoComplete="email" aria-label="Email" />
              </span>
            </div>
            {emailErr ? <p className="acct-fieldErr">{emailErr}</p> : <p className="acct-note">This email is used for sign-in and order updates.</p>}
          </div>
          <div className="acct-cell">
            <div className="acct-field">
              <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </div>
          </div>
          {err ? <p className="acct-err">{err}</p> : null}
          {msg ? <p className="acct-ok">{msg}</p> : null}
          <div className="acct-actions">
            <button type="button" className="acct-cancel" onClick={() => setEditingContact(false)}>Cancel</button>
            <button type="submit" className={`acct-save${profileReady ? " is-ready" : ""}${busy ? " is-busy" : ""}${saved ? " is-success" : ""}`} disabled={busy || saved}>
              {saved ? "✓ Saved" : busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Addresses */}
      <div className="balmoral-profile__head" style={{ marginTop: 28 }}>
        <h2>Addresses</h2>
        <button type="button" className="balmoral-profile__editBtn" onClick={() => setAddrModal({ open: true, address: null })}>
          Add
        </button>
      </div>
      {addressError ? <p className="acct-err" role="alert">{addressError} <button type="button" onClick={() => void loadAddresses()}>Try again</button></p> : null}
      {addressLoading ? <p className="balmoral-profile__muted" aria-live="polite">Loading addresses…</p> : null}
      {!addressLoading && addresses.length === 0 && !addressError ? (
        <div className="balmoral-profile__card balmoral-profile__card--addr">
          <span className="balmoral-profile__addrIcon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
          <span className="balmoral-profile__muted">No addresses added</span>
        </div>
      ) : !addressLoading && addresses.length ? (
        addresses.map((a) => (
          <div className="balmoral-profile__card balmoral-profile__card--addr" key={a.id} style={{ marginBottom: 10 }}>
            <span className="balmoral-profile__addrIcon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </span>
            <span className="balmoral-profile__value" style={{ fontSize: 13, flex: 1 }}>
              <strong>{a.recipientName}</strong>
              <br />
              {a.line1}, {a.city}{a.region ? `, ${a.region}` : ""} · {countryName(a.countryCode)}
              {(a.isDefaultShipping || a.isDefaultBilling) ? " · Default" : ""}
            </span>
            <span className="account-card-actions">
              <button type="button" onClick={() => setAddrModal({ open: true, address: a })}>Edit</button>
              <button type="button" onClick={() => { setDeleteSaved(false); setDeleteTarget(a); }}>Remove</button>
            </span>
          </div>
        ))
      ) : null}
      <AddressModal
        open={addrModal.open}
        address={addrModal.address}
        onClose={() => setAddrModal({ open: false, address: null })}
        onSaved={loadAddresses}
      />
      <Modal open={deleteTarget !== null} label="Delete address" onClose={() => setDeleteTarget(null)} small>
        <h2 className="acct-modal__title">Delete address?</h2>
        {deleteTarget ? (
          <div className="ship-info">
            <p>
              <strong>{deleteTarget.recipientName}</strong>
              <br />
              {deleteTarget.line1}, {deleteTarget.city}
              {deleteTarget.region ? `, ${deleteTarget.region}` : ""} · {countryName(deleteTarget.countryCode)}
            </p>
            <p>This cannot be undone.</p>
          </div>
        ) : null}
        <div className="acct-actions">
          <button type="button" className="acct-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button type="button" className={`acct-save is-ready${deleteBusy ? " is-busy" : ""}${deleteSaved ? " is-success" : ""}`} disabled={deleteBusy || deleteSaved} onClick={() => void removeAddress()}>
            {deleteSaved ? "✓ Deleted" : deleteBusy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>

      {/* Marketing */}
      <div className="balmoral-profile__head" style={{ marginTop: 28 }}>
        <h2>Marketing preferences</h2>
      </div>
      <div className="balmoral-profile__card">
        <span className="balmoral-profile__marketingLabel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="7" width="18" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M3.5 7.5 12 12.5l8.5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Email
        </span>
        <span>Choose whether to receive ALTURA news and offers by email. <Link style={{ textDecoration: "underline", textUnderlineOffset: "3px" }} href="/account/rewards">Manage email preferences</Link></span>
      </div>

      {/* Sign out */}
      <div className="balmoral-profile__signoutRow">
        <button
          type="button"
          className="balmoral-profile__signout"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        {signOutError ? <p className="acct-err" role="alert">{signOutError}</p> : null}
      </div>
    </div>
  );
}
