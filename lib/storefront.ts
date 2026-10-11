import { cache } from "react";
import { getProduct as getStaticProduct, storefrontProducts, type Product, type ProductTone } from "@/data/products";
import { COMMERCE_API_BASE, type CommerceCatalogProduct } from "@/lib/commerce-api";

export type StorefrontMode = "local";

export type ProductQuery = {
  q?: string;
  category?: string;
  subcategory?: string;
  collection?: string;
  inStock?: boolean;
  sort?: "featured" | "price-asc" | "price-desc" | "name-asc" | "newest";
  limit?: number;
};

export type CatalogCollection = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  heroImageUrl?: string | null;
  position?: number;
  productCount?: number;
};

export const storefrontMode: StorefrontMode = "local";

class CatalogRequestError extends Error {
  constructor(readonly status: number) {
    super(`Catalog request failed (${status})`);
  }
}

function validTone(value: unknown, fallback: ProductTone = "stone"): ProductTone {
  return value === "stone" || value === "forest" || value === "sage" || value === "charcoal" || value === "sand" || value === "ice" ? value : fallback;
}

function featureDetails(value: unknown, fallback: string[]): string[] {
  if (!value || typeof value !== "object") return fallback;
  const features = (value as { features?: unknown }).features;
  return Array.isArray(features) ? features.filter((item): item is string => typeof item === "string") : fallback;
}

function categoryNames(product: CommerceCatalogProduct, fallback?: Product) {
  const parent = product.categories?.find((category) => !category.parent);
  const child = product.categories?.find((category) => Boolean(category.parent));
  return { category: parent?.name ?? fallback?.category ?? "Accessories", subcategory: child?.name ?? fallback?.subcategory ?? "ALTURA" };
}

/** Convert a backend catalog response into the presentation shape shared by existing components. */
export function catalogProductToStorefrontProduct(product: CommerceCatalogProduct, fallback?: Product): Product {
  const staticFallback = fallback ?? getStaticProduct(product.slug);
  const categories = categoryNames(product, staticFallback);
  const details = featureDetails(product.details, staticFallback?.details ?? []);
  return {
    id: product.slug,
    status: "active",
    name: product.name,
    price: product.basePrice,
    currency: product.currency,
    catalogSource: "backend",
    category: categories.category,
    subcategory: categories.subcategory,
    colors: product.colors,
    sizes: product.sizes,
    inStock: product.inStock,
    tone: validTone((product.details as { tone?: unknown } | null)?.tone, staticFallback?.tone),
    description: product.description ?? staticFallback?.description ?? "ALTURA performance apparel.",
    details,
    fit: product.fit ?? staticFallback?.fit ?? "",
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    seoVariants: product.colorways?.flatMap(color => color.variants.map(variant => ({ sku: variant.sku, price: variant.price, inStock: variant.inStock, color: color.name, size: variant.size }))),
    imageUrls: product.images?.map((image) => ({ colorName: image.colorName, view: image.view, url: image.url })),
  };
}

function filterStaticProducts(query: ProductQuery): Product[] {
  const needle = query.q?.trim().toLowerCase();
  const filtered = storefrontProducts.filter((product) => {
    const matchesText = !needle || [product.name, product.category, product.subcategory, ...product.colors].some((value) => value.toLowerCase().includes(needle));
    const matchesCategory = !query.category || product.category.toLowerCase() === query.category.toLowerCase();
    const matchesSubcategory = !query.subcategory || product.subcategory.toLowerCase() === query.subcategory.toLowerCase();
    const matchesStock = query.inStock === undefined || product.inStock === query.inStock;
    return matchesText && matchesCategory && matchesSubcategory && matchesStock;
  });
  const sorted = [...filtered];
  switch (query.sort) {
    case "price-asc":
      sorted.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      sorted.sort((a, b) => b.price - a.price);
      break;
    case "name-asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "newest":
    case "featured":
    default:
      break;
  }
  return query.limit === undefined ? sorted : sorted.slice(0, Math.max(query.limit, 0));
}

async function catalogFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${COMMERCE_API_BASE}${path}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new CatalogRequestError(response.status);
  return response.json() as Promise<T>;
}

export async function listProducts(query: ProductQuery = {}): Promise<Product[]> {
  return (await listProductsWithStatus(query)).products;
}

export async function listProductsWithStatus(query: ProductQuery = {}): Promise<{ products: Product[]; source: "backend" | "static-fallback"; degraded: boolean }> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.subcategory) params.set("subcategory", query.subcategory);
  if (query.collection) params.set("collection", query.collection);
  if (query.inStock !== undefined) params.set("inStock", String(query.inStock));
  if (query.sort) params.set("sort", query.sort);
  params.set("limit", String(query.limit ?? 100));
  try {
    const result = await catalogFetch<{ items: CommerceCatalogProduct[] }>(`/catalog/products?${params.toString()}`);
    return { products: result.items.map((item) => catalogProductToStorefrontProduct(item)), source: "backend", degraded: false };
  } catch {
    return { products: filterStaticProducts(query).map((product) => ({ ...product, catalogSource: "static-fallback" })), source: "static-fallback", degraded: true };
  }
}

export const findProduct = cache(async (id: string): Promise<Product | undefined> => {
  try {
    const result = await catalogFetch<CommerceCatalogProduct>(`/catalog/products/${encodeURIComponent(id)}`);
    return catalogProductToStorefrontProduct(result);
  } catch (error) {
    if (error instanceof CatalogRequestError && error.status === 404) return undefined;
    const fallback = getStaticProduct(id);
    return !fallback || fallback.status === "draft" ? undefined : { ...fallback, catalogSource: "static-fallback" };
  }
});

export async function listCollections(): Promise<CatalogCollection[]> {
  try {
    return await catalogFetch<CatalogCollection[]>("/catalog/collections");
  } catch {
    return [];
  }
}

export async function listCollectionProducts(slug: string): Promise<{ collection: CatalogCollection | null; products: Product[] }> {
  if (slug === "shopall") return { collection: null, products: await listProducts() };
  try {
    const result = await catalogFetch<{ id: string; name: string; slug: string; description?: string | null; heroImageUrl?: string | null; products: { items: CommerceCatalogProduct[] } }>(`/catalog/collections/${encodeURIComponent(slug)}?limit=100`);
    return {
      collection: { id: result.id, name: result.name, slug: result.slug, description: result.description, heroImageUrl: result.heroImageUrl },
      products: result.products.items.map((item) => catalogProductToStorefrontProduct(item)),
    };
  } catch {
    return { collection: null, products: await listProducts({ category: slug }) };
  }
}

/** Crawl the active API catalog completely; do not publish stale fallback products during outages. */
export async function listSitemapProducts(): Promise<Product[]> {
  const products: Product[] = [];
  let page = 1;
  while (true) {
    const result = await catalogFetch<{ items: CommerceCatalogProduct[]; pages: number }>(`/catalog/products?limit=100&page=${page}`);
    products.push(...result.items.map(item => catalogProductToStorefrontProduct(item)));
    if (page >= result.pages) return products;
    page += 1;
  }
}
