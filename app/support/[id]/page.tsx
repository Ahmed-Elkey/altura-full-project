import { AccountShell } from '@/components/account/AccountShell';
import { GuestSupport } from '@/components/support/GuestSupport';
export default async function SupportPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AccountShell publicView><GuestSupport key={id} id={id} /></AccountShell>; }
