import { NextResponse } from "next/server";
import { COMMERCE_API_BASE } from "@/lib/commerce-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const liveness = { liveness: "ok", service: "altura-storefront", storefrontMode: "local" };
  if (new URL(request.url).searchParams.get("probe") === "liveness") {
    return NextResponse.json({ ...liveness, status: "ok" });
  }
  async function probe(path: string) {
    try {
      const response = await fetch(`${COMMERCE_API_BASE}${path}`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
      return response.ok ? await response.json() : null;
    } catch { return null; }
  }
  const [backend, catalog] = await Promise.all([probe("/health"), probe("/catalog/products?limit=1")]);
  const backendReady = backend?.status === "ok" && backend?.database === "connected";
  const catalogReady = Array.isArray(catalog?.items) && Number.isInteger(catalog?.total);
  const commerceReady = backendReady && catalogReady;
  return NextResponse.json({
    ...liveness,
    status: commerceReady ? "ok" : "degraded",
    commerceReady,
    backend: backendReady ? "ready" : "unavailable",
    catalog: catalogReady ? "ready" : "unavailable",
    products: catalogReady ? catalog.total : null,
  }, { status: commerceReady ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
