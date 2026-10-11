import type { Metadata } from "next";
import { SearchResultsClient } from "@/components/SearchResultsClient";
import { listProducts } from "@/lib/storefront";
export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const products = await listProducts({ q: q || undefined });
  return <SearchResultsClient source={products} initialQuery={q} />;
}
