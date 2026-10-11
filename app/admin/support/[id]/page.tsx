import { AdminSupport } from '@/components/support/AdminSupport';
export default async function SupportPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AdminSupport id={id} />; }
