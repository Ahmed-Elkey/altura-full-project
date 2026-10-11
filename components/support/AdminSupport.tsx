"use client";
import { useAdminAuth } from '@/components/admin/AdminAuthProvider';
import { SupportList } from './SupportList';
import { SupportThread } from './SupportThread';
export function AdminSupport({ id }: { id?: string }) { const { apiFetch } = useAdminAuth(); return id ? <SupportThread key={id} id={id} apiFetch={apiFetch} base="/admin/support" admin /> : <SupportList apiFetch={apiFetch} admin />; }
