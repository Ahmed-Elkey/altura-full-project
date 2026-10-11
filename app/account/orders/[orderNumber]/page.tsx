import { AccountShell } from "@/components/account/AccountShell";
import { OrderDetailClient } from "@/components/account/OrderDetailClient";
export default async function OrderPage({ params }: { params: Promise<{ orderNumber: string }> }) { const { orderNumber } = await params; return <AccountShell><OrderDetailClient orderNumber={orderNumber} /></AccountShell>; }
