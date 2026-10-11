"use client";
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LoadingState } from '@/components/LoadingState';
import { CommerceApiError } from '@/lib/commerce-api';
import { supportDate, supportError, supportLabels, submissionKey, type SupportDetail, type SupportFetch, type SupportStatus, type SupportSubmission } from '@/lib/support';

export function SupportThread({ id, apiFetch, base, admin = false, onExpired, initialDraft = '', onDraftChange, initialSubmission = null, onSubmissionChange }: { id: string; apiFetch: SupportFetch; base: string; admin?: boolean; onExpired?: () => void; initialDraft?: string; onDraftChange?: (draft: string) => void; initialSubmission?: SupportSubmission | null; onSubmissionChange?: (submission: SupportSubmission | null) => void }) {
  const [data, setData] = useState<SupportDetail | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [draft, setDraft] = useState(initialDraft), [busy, setBusy] = useState(false), [status, setStatus] = useState<SupportStatus>('OPEN');
  const generation = useRef(0), pending = useRef(false), statusDirty = useRef(false), key = useRef<SupportSubmission | null>(initialSubmission);
  const endpoint = `${base}/${encodeURIComponent(id)}`;
  const handleError = useCallback((caught: unknown) => {
    if (onExpired && caught instanceof CommerceApiError && caught.status === 401) { onExpired(); return; }
    setError(supportError(caught));
  }, [onExpired]);
  const load = useCallback(async (quiet = false) => {
    const version = ++generation.current; if (!quiet) { setLoading(true); setError(''); }
    try {
      const result = await apiFetch<SupportDetail>(endpoint);
      if (!result?.id || !Array.isArray(result.messages)) throw new Error('Invalid conversation response');
      if (generation.current !== version) return;
      setData(result); if (!statusDirty.current) setStatus(result.status);
      // A read acknowledgement never turns a successful fetch into a lost timeline.
      if (document.visibilityState === 'visible') void apiFetch(`${endpoint}/read`, { method: 'POST', body: JSON.stringify({ version: result.version }) }).catch(() => undefined);
    } catch (caught) { if (generation.current === version) handleError(caught); }
    finally { if (generation.current === version && !quiet) setLoading(false); }
  }, [apiFetch, endpoint, handleError]);
  useEffect(() => { setData(null); statusDirty.current = false; void load(); const interval = setInterval(() => { if (!pending.current && document.visibilityState === 'visible') void load(true); }, 20000); return () => { generation.current++; clearInterval(interval); }; }, [load]);
  async function mutate(path: string, body: object, success: string, clearDraft = false) {
    if (pending.current) return; pending.current = true; generation.current++; setLoading(false); setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiFetch<SupportDetail>(path, { method: path.endsWith('/status') ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (!result?.id || !Array.isArray(result.messages)) throw new Error('Invalid conversation response');
      setData(result); statusDirty.current = false; setStatus(result.status); setNotice(success);
      if (clearDraft) { setDraft(''); onDraftChange?.(''); key.current = null; onSubmissionChange?.(null); }
    } catch (caught) { handleError(caught); }
    finally { pending.current = false; setBusy(false); }
  }
  async function reply(event: FormEvent) {
    event.preventDefault(); if (!data || pending.current) return;
    const message = draft.trim(); if (message.length < 10 || message.length > 5000) { setError('Write a reply between 10 and 5000 characters.'); return; }
    const nextKey = submissionKey(key, { message, id }); onSubmissionChange?.(key.current);
    await mutate(`${endpoint}/replies`, { message, submissionKey: nextKey, version: data.version }, 'Your reply is saved.', true);
  }
  async function retry(deliveryId: string) {
    if (pending.current) return; pending.current = true; setBusy(true); setError(''); setNotice('');
    try { const result = await apiFetch<{ queued: boolean }>(`${endpoint}/deliveries/${encodeURIComponent(deliveryId)}/retry`, { method: 'POST', body: '{}' }); if (!result?.queued) throw new Error('Invalid retry response'); setNotice('Email retry queued.'); await load(true); }
    catch (caught) { handleError(caught); } finally { pending.current = false; setBusy(false); }
  }
  return <div className="support-workspace" aria-busy={loading || busy}>
    <div className="support-topbar"><Link className="support-text-button" href={admin ? '/admin/support' : base === '/support/me' ? '/account/support' : '/info/contact'}>← {admin ? 'Support inbox' : base === '/support/me' ? 'Your support requests' : 'Contact us'}</Link><button className="support-secondary" disabled={busy || loading} onClick={() => void load()}>Refresh conversation</button></div>
    {error ? <p className="support-error" role="alert">{error}</p> : null}{notice ? <p className="support-success" role="status">{notice}</p> : null}
    {!data ? loading ? <LoadingState message="Loading conversation…" /> : <p>No conversation available. Check your access or try refreshing.</p> : <>
      <header className="support-heading"><span className="support-muted">Support / {data.reference}</span><h1>{data.subject}</h1><span className="support-status" data-status={data.status}>{admin && data.status === 'AWAITING_CUSTOMER' ? 'Awaiting customer' : supportLabels[data.status]}</span><p className="support-muted">Started {supportDate(data.createdAt)}{data.orderReference ? ` · Order reference: ${data.orderReference}` : ''}</p>{admin ? <p>{data.name} · {data.email}</p> : null}</header>
      {admin ? <form className="support-status-form support-card" onSubmit={e => { e.preventDefault(); if (data) void mutate(`${endpoint}/status`, { status, version: data.version }, 'Status updated.'); }}><label>Ticket status<select aria-label="Ticket status" value={status} disabled={busy} onChange={e => { statusDirty.current = true; setStatus(e.target.value as SupportStatus); }}><option value="OPEN">Open</option><option value="AWAITING_CUSTOMER">Awaiting customer</option><option value="RESOLVED">Resolved</option></select></label><button className="support-secondary" type="submit" disabled={busy || status === data.status}>Save status</button></form> : null}
      <ol className="support-timeline" aria-label="Conversation messages">{data.messages.map(message => <li key={message.id} className="support-message support-card" data-author={message.authorType}><div><strong>{message.authorType === 'ADMIN' ? 'ALTURA support' : admin ? data.name : 'You'}</strong><time dateTime={message.createdAt}>{supportDate(message.createdAt)}</time></div><p>{message.body}</p></li>)}</ol>
      <form className="support-reply support-card" onSubmit={reply}><label htmlFor="support-reply">Your reply<textarea aria-label="Your reply" id="support-reply" rows={5} minLength={10} maxLength={5000} value={draft} disabled={busy} onChange={e => { setDraft(e.target.value); onDraftChange?.(e.target.value); }} placeholder="Write your message…" required /></label><p className="support-muted">{data.status === 'RESOLVED' && !admin ? 'Sending a reply reopens this request.' : admin ? 'Your reply is saved here and a notification is queued for the customer.' : 'Our team will see your reply in this conversation.'}</p><button className="support-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Send reply'}</button></form>
      {admin && data.deliveries?.length ? <section className="support-card support-deliveries"><h2>Email notifications</h2><p className="support-muted">Saved messages remain available even if an email cannot be sent.</p><ul>{data.deliveries.map(delivery => <li key={delivery.id}><span>{delivery.status === 'SENT' ? `Sent ${delivery.sentAt ? supportDate(delivery.sentAt) : ''}` : delivery.status === 'FAILED' ? 'Delivery failed' : delivery.status === 'SENDING' ? 'Sending' : 'Queued'} · {delivery.attempts} attempts</span>{delivery.status === 'FAILED' ? <button className="support-secondary" type="button" disabled={busy} onClick={() => void retry(delivery.id)}>Retry email</button> : null}</li>)}</ul></section> : null}
    </>}
  </div>;
}
