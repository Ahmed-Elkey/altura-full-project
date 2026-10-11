import type { Metadata } from "next";
import { CheckoutPreview } from "@/components/CheckoutPreview";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return <CheckoutPreview />;
}
