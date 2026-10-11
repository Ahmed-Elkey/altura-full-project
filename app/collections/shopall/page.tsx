import type { Metadata } from "next";
import { ShopCollection } from "@/components/ShopCollection";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("Shop All", "Shop ALTURA running apparel and accessories. Explore available products, colors, sizes and prices.", "/collections/shopall");

export default function ShopAllPage() {
  return <ShopCollection />;
}
