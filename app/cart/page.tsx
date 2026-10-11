import type { Metadata } from "next";
import { CartPage } from "@/components/CartPage";

export const metadata: Metadata = { title: "Cart", robots: { index: false, follow: false } };

export default function CartRoute() {
  return <CartPage />;
}
