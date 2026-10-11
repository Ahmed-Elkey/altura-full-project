export const COMMERCE_API_BASE = (
  (typeof window === "undefined" ? process.env.COMMERCE_INTERNAL_API_URL : undefined) || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000/api/v1"
).replace(/\/$/, "");

import { apiErrorContext, CommerceApiError, logApiError } from "./api-errors";
export { CommerceApiError } from "./api-errors";

export async function commerceFetch<T>(path: string, init: RequestInit = {}, options: { timeoutMs?: number } = {}): Promise<T> {
  const requestPath = path.startsWith("/") ? path : `/${path}`;
  const context = apiErrorContext(requestPath);
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 15000);
  try {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${COMMERCE_API_BASE}${requestPath}`, { ...init, headers, credentials: "include", signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; }
    catch (cause) {
      if (response.ok) throw new CommerceApiError(response.status, context, "unexpected", cause);
      body = text;
    }
    if (!response.ok) throw new CommerceApiError(response.status, context, "http", body);
    return body as T;
  } catch (cause) {
    const error = cause instanceof CommerceApiError ? cause : new CommerceApiError(0, context, timedOut ? "timeout" : init.signal?.aborted ? "cancelled" : "network", cause);
    logApiError(error, requestPath);
    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abort);
  }
}

export type CommerceCatalogVariant = {
  id: string;
  sku: string;
  size: string;
  price: number;
  compareAtPrice: number | null;
  availableQuantity: number;
  inStock: boolean;
};

export type CommerceCatalogColorway = {
  name: string;
  hex: string | null;
  inStock: boolean;
  variants: CommerceCatalogVariant[];
  images: Array<{
    id: string;
    url: string;
    altText: string | null;
    view: string;
    colorName: string | null;
    isPrimary: boolean;
    position: number;
  }>;
};

export type CommerceCatalogProduct = {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string | null;
  description?: string;
  basePrice: number;
  compareAtPrice?: number | null;
  currency: string;
  fit?: string | null;
  details?: unknown;
  materials?: unknown;
  careInstructions?: unknown;
  seoTitle?: string | null;
  seoDescription?: string | null;
  featured?: boolean;
  position?: number;
  categories?: Array<{ id: string; name: string; slug: string; parent?: { id: string; name: string; slug: string } | null }>;
  collections?: Array<{ id: string; name: string; slug: string }>;
  colors: string[];
  sizes: string[];
  inStock: boolean;
  images?: Array<{
    id: string;
    url: string;
    altText: string | null;
    view: string | null;
    colorName: string | null;
    isPrimary: boolean;
    position: number;
  }>;
  colorways: CommerceCatalogColorway[];
};
