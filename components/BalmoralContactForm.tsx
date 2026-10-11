"use client";
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { commerceFetch } from '@/lib/commerce-api';
import { useCustomerAuth } from './account/CustomerAuthProvider';
import { saveGuestAccess, submissionKey, supportError, type SupportTicket } from '@/lib/support';

export function BalmoralContactForm() {
  const { state, user, apiFetch } = useCustomerAuth();
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [subject, setSubject] = useState(''), [orderReference, setOrderReference] = useState(''), [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ ticket: SupportTicket; guest: boolean } | null>(null);
  const pending = useRef(false), key = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => { if (user) { setEmail(user.email); setName(current => current || [user.firstName, user.lastName].filter(Boolean).join(' ')); } }, [user]);
  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); if (pending.current) return; setError('');
    const payload = { name: name.trim(), email: (user?.email || email).trim(), subject: subject.trim(), orderReference: orderReference.trim() || undefined, message: message.trim(), website };
    if (!payload.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || !payload.subject || payload.message.length < 10) { setError('Enter your name, a valid email, a subject and a message of at least 10 characters.'); return; }
    pending.current = true; setBusy(true);
    try {
      const fetcher = state === 'authenticated' ? apiFetch : commerceFetch;
      const result = await fetcher<{ ticket: SupportTicket; accessToken?: string }>('/support', { method: 'POST', body: JSON.stringify({ ...payload, submissionKey: submissionKey(key, payload) }) });
      if (!result?.ticket?.id || !result.ticket.reference) throw new Error('Invalid support response');
      if (result.accessToken) saveGuestAccess(result.ticket.id, result.accessToken);
      setSaved({ ticket: result.ticket, guest: state !== 'authenticated' }); key.current = null;
    } catch (caught) { setError(supportError(caught)); }
    finally { pending.current = false; setBusy(false); }
  }
  if (saved) return <div className="support-contact-result col-start-1 col-start-xl-4 col-span-xl-6"><p role="status">Your message is saved. Reference: <strong>{saved.ticket.reference}</strong>.</p><p>Our team will reply here. Email notifications help you keep up with the conversation.</p><Link className="support-button" href={`${saved.guest ? '/support' : '/account/support'}/${encodeURIComponent(saved.ticket.id)}`}>View conversation</Link><button type="button" className="support-text-button" onClick={() => { setSaved(null); setSubject(''); setMessage(''); setOrderReference(''); }}>Send another message</button></div>;
  return <form onSubmit={handleSubmit} className="support-contact-form col-start-1 col-start-xl-4 col-span-xl-6" noValidate aria-busy={busy}>
    <p>Tell us what you need help with. Your message goes directly to our support team.</p>
    <label htmlFor="contact-name">Name<input id="contact-name" name="name" autoComplete="name" placeholder="Your name" required maxLength={120} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
    <label htmlFor="contact-email">Email<input id="contact-email" name="email" type="email" autoComplete="email" placeholder="Your email" required maxLength={254} value={email} readOnly={!!user} disabled={busy} onChange={e => setEmail(e.target.value)} /></label>
    <label htmlFor="contact-subject">Subject<input id="contact-subject" name="subject" placeholder="How can we help?" required maxLength={160} value={subject} disabled={busy} onChange={e => setSubject(e.target.value)} /></label>
    <label htmlFor="contact-order">Order reference <span className="support-muted">(optional)</span><input id="contact-order" name="orderReference" placeholder="Your order number" maxLength={80} value={orderReference} disabled={busy} onChange={e => setOrderReference(e.target.value)} /></label>
    <label htmlFor="contact-message">Message<textarea aria-label="Message" id="contact-message" name="message" placeholder="Tell us about your question or problem" rows={5} required minLength={10} maxLength={5000} value={message} disabled={busy} onChange={e => setMessage(e.target.value)} /></label>
    <div className="support-honeypot" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" maxLength={200} value={website} onChange={e => setWebsite(e.target.value)} /></label></div>
    {error ? <p className="support-error" role="alert">{error}</p> : null}
    <button className="support-button" type="submit" disabled={busy || state === 'loading'}>{busy ? 'Saving message…' : 'Send message'}</button>
    <p className="support-muted">Support messages do not subscribe you to marketing emails.</p>
  </form>;
}
