"use client";

import Link from "next/link";
import { NewsletterOfferEditor } from "@/components/admin/NewsletterOfferEditor";
import { rewardDescription, type NewsletterReward } from "@/lib/newsletter-offer";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminEmpty, AdminError, AdminPageHeader, AdminPagination, AdminStatus } from "@/components/admin/AdminUI";
import { adminDate } from "@/lib/admin-format";
import { CommerceApiError } from "@/lib/commerce-api";
import { getUserErrorMessage } from "@/lib/api-errors";

type Subscriber = {
  id: string; email: string; status: string; subscribedAt: string; confirmedAt: string | null; unsubscribedAt: string | null;
  welcomeStatus: string; welcomeSentAt: string | null;
  reward: (NewsletterReward & {active:boolean;usageCount:number;orderNumbers:string[]}) | null;
};
type Register = { items: Subscriber[]; total: number; page: number; limit: number; counts: { total: number; pending: number; subscribed: number; unsubscribed: number; deliveryFailed: number } };

function rewardStatus(subscriber: Subscriber) {
  const reward = subscriber.reward;
  if (!reward) return "Not issued";
  if (reward.usageCount > 0) return "Used";
  if (Date.parse(reward.expiresAt) <= Date.now()) return "Expired";
  if (!reward.active) return "Disabled";
  if (!subscriber.confirmedAt) return "Unavailable";
  return "Available";
}

export default function AdminNewsletterPage() {
  const { apiFetch } = useAdminAuth();
  const [data, setData] = useState<Register | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState({ q: "", status: "", page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(query.page), limit: "25", ...(query.q ? { q: query.q } : {}), ...(query.status ? { status: query.status } : {}) });
      const result = await apiFetch<Register>(`/admin/newsletter?${params}`);
      if (requestVersion.current === version) setData(result);
    } catch (cause) { if (requestVersion.current === version) setError(getUserErrorMessage(cause, "admin")); }
    finally { if (requestVersion.current === version) setLoading(false); }
  }, [apiFetch, query]);
  useEffect(() => { void load(); return () => { requestVersion.current++; }; }, [load]);
  function searchSubscribers(event: FormEvent) {
    event.preventDefault(); setSuccess(""); setData(null); setQuery({ q: search.trim(), status: filter, page: 1 });
  }
  async function retryEmail(subscriber: Subscriber) {
    if (retrying) return;
    setRetrying(subscriber.id); setError(""); setSuccess("");
    try {
      const result = await apiFetch<{ queued: boolean }>(`/admin/newsletter/${encodeURIComponent(subscriber.id)}/retry`, { method: "POST", body: "{}" });
      if (!result?.queued) throw new CommerceApiError(200, "admin", "unexpected");
      setSuccess(`Email retry queued for ${subscriber.email}.`);
      await load();
    } catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setRetrying(null); }
  }
  return <>
    <AdminPageHeader index="11" eyebrow="Customer Relations" title="Newsletter" description="Subscriptions, welcome email delivery and private welcome rewards." />
    <NewsletterOfferEditor />
    <div className="newsletter-admin__counts" aria-label="Newsletter totals">
      {([['Total', 'total'], ['Pending', 'pending'], ['Subscribed', 'subscribed'], ['Unsubscribed', 'unsubscribed'], ['Delivery failed', 'deliveryFailed']] as const).map(([label, key]) => <div key={key}><span>{label}</span><strong>{data ? data.counts[key] : '—'}</strong></div>)}
    </div>
    <form className="newsletter-admin__filters" onSubmit={searchSubscribers}>
      <label><span>Search email</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Email address" maxLength={120} /></label>
      <label><span>Subscription status</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="">All subscriptions</option><option value="PENDING">Pending confirmation</option><option value="SUBSCRIBED">Subscribed</option><option value="UNSUBSCRIBED">Unsubscribed</option></select></label>
      <button className="admin-secondary-button" type="submit" disabled={loading || !!retrying}>Search</button>
    </form>
    {error ? <AdminError message={error} retry={() => void load()} /> : null}
    {success ? <p className="admin-success" role="status">{success}</p> : null}
    <section className="admin-register-panel" aria-busy={loading}>
      <div className="admin-register-caption"><span>{data ? `${data.total} subscribers` : "Loading subscribers"}</span><span>Personal rewards · Saved offer terms · Email bound</span></div>
      {data && !data.items.length ? <AdminEmpty title="No subscribers found" detail="Try another email or subscription status." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Email</th><th>Subscription</th><th>Welcome email</th><th>Reward</th><th>Reward orders</th><th>Action</th></tr></thead><tbody>
        {data?.items.map(subscriber => <tr key={subscriber.id}>
          <td><strong>{subscriber.email}</strong><small>Requested {adminDate(subscriber.subscribedAt)}</small></td>
          <td><AdminStatus value={subscriber.status} />{subscriber.confirmedAt ? <small>Confirmed {adminDate(subscriber.confirmedAt)}</small> : null}{subscriber.unsubscribedAt ? <small>Opted out {adminDate(subscriber.unsubscribedAt)}</small> : null}</td>
          <td><AdminStatus value={subscriber.welcomeStatus} />{subscriber.welcomeSentAt ? <small>Sent {adminDate(subscriber.welcomeSentAt)}</small> : null}</td>
          <td><strong className="admin-mono">{subscriber.reward?.code || '—'}</strong><small>{rewardStatus(subscriber)}{subscriber.reward ? ` · ${rewardDescription(subscriber.reward)} · ${subscriber.reward.usageCount}/${subscriber.reward.offer?.usageLimit || 1} uses` : ''}</small>{subscriber.reward ? <small>Expires {adminDate(subscriber.reward.expiresAt)}</small> : null}</td>
          <td>{subscriber.reward?.orderNumbers.length ? subscriber.reward.orderNumbers.map(number => <Link key={number} className="admin-table-link newsletter-admin__order" href={`/admin/orders/${encodeURIComponent(number)}`}>{number}</Link>) : '—'}</td>
          <td>{['FAILED', 'PENDING'].includes(subscriber.welcomeStatus) && subscriber.status !== 'UNSUBSCRIBED' && !(subscriber.status === 'SUBSCRIBED' && subscriber.confirmedAt) ? <button type="button" className="admin-row-action" disabled={!!retrying || loading} onClick={() => void retryEmail(subscriber)}>{retrying === subscriber.id ? 'Queuing…' : 'Retry email'}</button> : <small>{subscriber.welcomeStatus === 'SENT' ? 'Sent' : 'No retry available'}</small>}</td>
        </tr>)}
        {!data ? <tr><td colSpan={6} className="admin-table-loading">{loading ? 'Loading subscribers…' : 'Subscriber list unavailable.'}</td></tr> : null}
      </tbody></table></div>}
    </section>
    {data ? <AdminPagination page={query.page} pages={Math.ceil(data.total / data.limit)} total={data.total} loading={loading || !!retrying} onPageChange={page => { setSuccess(""); setQuery(current => ({ ...current, page })); }} /> : null}
  </>;
}
