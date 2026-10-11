import type { Metadata } from "next";
import { OrderConfirmationClient } from "@/components/OrderConfirmationClient";
export const metadata: Metadata = { title: "Order confirmation", robots: { index: false, follow: false } };
export default async function ConfirmationPage({params,searchParams}:{params:Promise<{orderNumber:string}>;searchParams:Promise<{email?:string}>}){const {orderNumber}=await params;const query=await searchParams;return <OrderConfirmationClient orderNumber={orderNumber} email={query.email}/>}
