import type { Metadata } from "next";
import { WishlistClient } from "@/components/WishlistClient";
export const metadata: Metadata = { title: "Wishlist", robots: { index: false, follow: false } };
export default function WishlistPage(){return <WishlistClient/>}
