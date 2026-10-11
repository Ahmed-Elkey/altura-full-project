"use client";
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LoadingState } from '@/components/LoadingState';
import { AdminPagination } from '@/components/admin/AdminUI';
import { supportDate, supportError, supportLabels, type SupportFetch, type SupportList as Register } from '@/lib/support';
export function SupportList({ apiFetch, admin = false }: { apiFetch: SupportFetch; admin?: boolean }) {
  const [data, setData] = useState<Register | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [q, setQ] = useState(''), [status, setStatus] = useState(''), [unread, setUnread] = useState(false);
  const [query, setQuery] = useState({ q: '', status: '', unread: false, page: 1 }); const generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current; setLoading(true); setError('');
    try { const params = new URLSearchParams({ page: String(query.page), limit: '25', ...(query.q ? { q: query.q } : {}), ...(query.status ? { status: query.status } : {}), ...(admin && query.unread ? { unread: 'true' } : {}) }); const result = await apiFetch<Register>(`${admin ? '/admin/support' : '/support/me'}?${params}`); if (!Array.isArray(result?.items)) throw new Error('Invalid support list'); if (generation.current === version) setData(result); }
    catch (caught) { if (generation.current === version) setError(supportError(caught)); } finally { if (generation.current === version) setLoading(false); }
  }, [admin, apiFetch, query]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  function search(event: FormEvent) { event.preventDefault(); setData(null); setQuery({ q: q.trim(), status, unread, page: 1 }); }
  return <div className="support-workspace">
    <header className="support-heading"><span className="support-muted">{admin ? 'Customer relations' : 'Account'} / Support</span><h1>{admin ? 'Support inbox' : 'Your support requests'}</h1><p className="support-muted">{admin ? 'Read customer questions, reply and keep track of the resolution.' : 'Continue your conversations with the ALTURA team.'}</p>{!admin ? <Link className="support-button" href="/info/contact">Start a new request</Link> : null}</header>
    <form className="support-filters" onSubmit={search}><label>Search support<input type="search" placeholder="Reference or subject" maxLength={160} value={q} onChange={e => setQ(e.target.value)} /></label><label>Support status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="OPEN">Open</option><option value="AWAITING_CUSTOMER">Awaiting {admin ? 'customer' : 'your reply'}</option><option value="RESOLVED">Resolved</option></select></label>{admin ? <label className="support-checkbox"><input type="checkbox" checked={unread} onChange={e => setUnread(e.target.checked)} />Unread only</label> : null}<button className="support-secondary" type="submit" disabled={loading}>Search</button><button className="support-text-button" type="button" disabled={loading} onClick={() => void load()}>Refresh inbox</button></form>
    {error ? <p className="support-error" role="alert">{error} <button type="button" className="support-text-button" onClick={() => void load()}>Try again</button></p> : null}
    {loading && !data ? <LoadingState message="Loading support requests…" /> : data && !data.items.length ? <section className="support-card"><h2>No requests found</h2><p className="support-muted">{query.q || query.status || query.unread ? 'Try another search or status.' : 'Your saved support conversations will appear here.'}</p></section> : data ? <ul className="support-register" aria-busy={loading}>{data.items.map(ticket => <li className="support-card" key={ticket.id}><div><span className="support-muted">{ticket.reference}{ticket.unread ? ' · Unread' : ''}</span><Link className="support-ticket-link" href={`${admin ? '/admin/support' : '/account/support'}/${encodeURIComponent(ticket.id)}`}>{ticket.subject}</Link>{admin ? <p className="support-muted">{ticket.name} · {ticket.email}</p> : null}<time dateTime={ticket.lastMessageAt} className="support-muted">Updated {supportDate(ticket.lastMessageAt)}</time></div><span className="support-status" data-status={ticket.status}>{admin && ticket.status === 'AWAITING_CUSTOMER' ? 'Awaiting customer' : supportLabels[ticket.status]}</span></li>)}</ul> : null}
    {data ? <AdminPagination page={query.page} pages={Math.ceil(data.total / data.limit)} total={data.total} loading={loading} onPageChange={page => setQuery(current => ({ ...current, page }))} /> : null}
  </div>;
}
