import { NextResponse } from "next/server";
import { listProductsWithStatus } from "@/lib/storefront";

function parseBoolean(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseLimit(value: string | null) {
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : undefined;
}

function parseSort(value: string | null) {
  return value === "featured" || value === "price-asc" || value === "price-desc" || value === "name-asc" || value === "newest"
    ? value
    : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await listProductsWithStatus({
    q: url.searchParams.get("q") || undefined,
    category: url.searchParams.get("category") || undefined,
    subcategory: url.searchParams.get("subcategory") || undefined,
    inStock: parseBoolean(url.searchParams.get("inStock")),
    sort: parseSort(url.searchParams.get("sort")),
    limit: parseLimit(url.searchParams.get("limit")),
  });

  return NextResponse.json({
    count: result.products.length,
    ...result,
  });
}
