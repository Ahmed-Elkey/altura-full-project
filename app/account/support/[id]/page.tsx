import { AccountShell } from '@/components/account/AccountShell';
import { CustomerSupport } from '@/components/support/CustomerSupport';
export default async function SupportPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AccountShell><CustomerSupport id={id} /></AccountShell>; }
