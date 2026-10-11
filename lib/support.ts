import { CommerceApiError } from './commerce-api';
import { getUserErrorMessage } from './api-errors';
export type SupportStatus = 'OPEN' | 'AWAITING_CUSTOMER' | 'RESOLVED';
export type SupportTicket = { id: string; reference: string; name: string; email: string; subject: string; orderReference: string | null; status: SupportStatus; version: number; createdAt: string; updatedAt: string; lastMessageAt: string; unread: boolean };
export type SupportDetail = SupportTicket & { messages: Array<{ id: string; authorType: 'CUSTOMER' | 'ADMIN'; body: string; createdAt: string }>; deliveries?: Array<{ id: string; messageId: string | null; status: string; attempts: number; sentAt: string | null }> };
export type SupportList = { items: SupportTicket[]; total: number; page: number; limit: number };
export type SupportFetch = <T>(path: string, init?: RequestInit) => Promise<T>;
export const supportLabels: Record<SupportStatus, string> = { OPEN: 'Open', AWAITING_CUSTOMER: 'Awaiting your reply', RESOLVED: 'Resolved' };
export const supportDate = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export function supportError(error: unknown) {
  if (error instanceof CommerceApiError) {
    if (error.status === 409) return 'This conversation changed. Refresh it, review the latest messages, then try again. Your draft is still here.';
    if (error.status === 404) return 'This support request is unavailable.';
    if (error.status === 400) return 'Check your details and message, then try again.';
  }
  return getUserErrorMessage(error);
}
const guestMemory = new Map<string, string>();
export function guestAccessKey(id: string) { return `altura-support-access:${id}`; }
export function saveGuestAccess(id: string, accessToken: string) { guestMemory.set(id, accessToken); if (guestMemory.size > 30) guestMemory.delete(guestMemory.keys().next().value!); try { sessionStorage.setItem(guestAccessKey(id), accessToken); } catch { /* Per-tab memory still enables current visit. */ } }
export function loadGuestAccess(id: string) { try { return sessionStorage.getItem(guestAccessKey(id)) || guestMemory.get(id) || null; } catch { return guestMemory.get(id) || null; } }
export function forgetGuestAccess(id: string) { guestMemory.delete(id); try { sessionStorage.removeItem(guestAccessKey(id)); } catch {} }
export function submissionKey(previous: { current: { body: string; key: string } | null }, payload: unknown) {
  const body = JSON.stringify(payload);
  if (!previous.current || previous.current.body !== body) previous.current = { body, key: crypto.randomUUID() };
  return previous.current.key;
}

const guestDraftMemory = new Map<string, string>();
export function loadGuestDraft(id: string) { try { return sessionStorage.getItem(`altura-support-draft:${id}`) || guestDraftMemory.get(id) || ''; } catch { return guestDraftMemory.get(id) || ''; } }
export function saveGuestDraft(id: string, draft: string) {
  if (draft) guestDraftMemory.set(id, draft); else guestDraftMemory.delete(id);
  if (guestDraftMemory.size > 30) guestDraftMemory.delete(guestDraftMemory.keys().next().value!);
  try { if (draft) sessionStorage.setItem(`altura-support-draft:${id}`, draft); else sessionStorage.removeItem(`altura-support-draft:${id}`); } catch {}
}

export type SupportSubmission = { body: string; key: string };
const guestSubmissionMemory = new Map<string, SupportSubmission>();
export function loadGuestSubmission(id: string): SupportSubmission | null {
  try {
    const stored = sessionStorage.getItem(`altura-support-submission:${id}`);
    if (stored) { const value = JSON.parse(stored); if (typeof value.body === 'string' && value.body.length <= 32000 && typeof value.key === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value.key)) return value; }
  } catch {}
  return guestSubmissionMemory.get(id) || null;
}
export function saveGuestSubmission(id: string, submission: SupportSubmission | null) {
  if (submission) guestSubmissionMemory.set(id, submission); else guestSubmissionMemory.delete(id);
  if (guestSubmissionMemory.size > 30) guestSubmissionMemory.delete(guestSubmissionMemory.keys().next().value!);
  try { if (submission) sessionStorage.setItem(`altura-support-submission:${id}`, JSON.stringify(submission)); else sessionStorage.removeItem(`altura-support-submission:${id}`); } catch {}
}
