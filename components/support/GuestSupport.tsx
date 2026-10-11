"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CommerceApiError, commerceFetch } from '@/lib/commerce-api';
import { forgetGuestAccess, loadGuestAccess, saveGuestAccess, loadGuestDraft, saveGuestDraft, loadGuestSubmission, saveGuestSubmission, supportError, type SupportFetch, type SupportSubmission } from '@/lib/support';
import { LoadingState } from '@/components/LoadingState';
import { SupportThread } from './SupportThread';
export function GuestSupport({ id }: { id: string }) {
  const [access, setAccess] = useState<string | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [email, setEmail] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [savedDraft, setSavedDraft] = useState(() => loadGuestDraft(id));
  const rememberDraft = useCallback((draft: string) => { setSavedDraft(draft); saveGuestDraft(id, draft); }, [id]);
  const [savedSubmission, setSavedSubmission] = useState(() => loadGuestSubmission(id));
  const rememberSubmission = useCallback((submission: SupportSubmission | null) => { setSavedSubmission(submission); saveGuestSubmission(id, submission); }, [id]);
  const startup = useRef<Promise<string | null> | null>(null), pending = useRef(false);
  useEffect(() => {
    let active = true;
    if (!startup.current) {
      const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
      if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      startup.current = (async () => {
        if (!token) return loadGuestAccess(id);
        forgetGuestAccess(id);
        const result = await commerceFetch<{ accessToken: string }>(`/support/${encodeURIComponent(id)}/access`, { method: 'POST', body: JSON.stringify({ token }) });
        if (!result?.accessToken) throw new Error('Invalid guest access');
        saveGuestAccess(id, result.accessToken); return result.accessToken;
      })();
    }
    void startup.current.then(token => { if (active) setAccess(token); }).catch(caught => { if (active) { forgetGuestAccess(id); setError(caught instanceof CommerceApiError && [400,401].includes(caught.status) ? 'This secure link is invalid or expired. Request a new link below.' : supportError(caught)); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  const expired = useCallback(() => { forgetGuestAccess(id); setAccess(null); setError('Your secure access has expired. Request a new link below.'); }, [id]);
  const apiFetch: SupportFetch = useCallback(<T,>(path: string, init: RequestInit = {}) => { const headers = new Headers(init.headers); if (access) headers.set('X-Support-Access', access); return commerceFetch<T>(path, { ...init, headers }); }, [access]);
  async function recover(event: FormEvent) {
    event.preventDefault(); if (pending.current) return; setError(''); setNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    pending.current = true; setBusy(true);
    try { await commerceFetch(`/support/${encodeURIComponent(id)}/recover`, { method: 'POST', body: JSON.stringify({ email: email.trim() }) }); setNotice('If the details match this request, a secure link will be sent to your email.'); }
    catch (caught) { setError(supportError(caught)); } finally { pending.current = false; setBusy(false); }
  }
  if (loading) return <LoadingState message="Opening your secure conversation…" />;
  if (access) return <SupportThread key={id} initialSubmission={savedSubmission} onSubmissionChange={rememberSubmission} initialDraft={savedDraft} onDraftChange={rememberDraft} id={id} apiFetch={apiFetch} base="/support/guest" onExpired={expired} />;
  return <div className="support-workspace"><header className="support-heading"><span className="support-muted">ALTURA / Support</span><h1>Open your conversation.</h1><p>Use the secure link in your email, or request a new link for this support request.</p></header><form className="support-card support-recovery" onSubmit={recover}>{error ? <p className="support-error" role="alert">{error}</p> : null}{notice ? <p className="support-success" role="status">{notice}</p> : null}{savedDraft ? <label>Unsent reply<textarea aria-label="Unsent reply" readOnly value={savedDraft} rows={4} /><span className="support-muted">Your draft is kept in this browser tab while you recover access.</span></label> : null}<label>Email address<input type="email" autoComplete="email" maxLength={254} value={email} disabled={busy} required onChange={e => setEmail(e.target.value)} /></label><button className="support-button" type="submit" disabled={busy}>{busy ? 'Requesting…' : 'Send secure link'}</button></form></div>;
}
