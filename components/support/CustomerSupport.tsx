"use client";
import { useCustomerAuth } from '@/components/account/CustomerAuthProvider';
import { SupportList } from './SupportList';
import { SupportThread } from './SupportThread';
export function CustomerSupport({ id }: { id?: string }) { const { apiFetch } = useCustomerAuth(); return id ? <SupportThread key={id} id={id} apiFetch={apiFetch} base="/support/me" /> : <SupportList apiFetch={apiFetch} />; }
