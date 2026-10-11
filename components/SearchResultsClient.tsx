"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { Product } from "@/data/products";
import { ProductVisual } from "./ProductVisual";
import { formatMoney } from "@/lib/money";
import { CatalogFallbackNotice } from "./CatalogFallbackNotice";

export function SearchResultsClient({ source, initialQuery = "" }: { source: Product[]; initialQuery?: string }) {
  const params = useSearchParams();
  const query = (params.get("q") || initialQuery).trim();
  const results = useMemo(() => source, [source]);

  return (
    <main className="search-page">
      <CatalogFallbackNotice visible={source.some((product) => product.catalogSource === "static-fallback")} />
      <header className="search-page-header">
        <span>Search / ALTURA catalogue</span>
        <h1>{query ? <>Results for <em>“{query}”</em></> : "Find your equipment."}</h1>
        <p>{query ? `${results.length} result${results.length === 1 ? "" : "s"}.` : "Search products, categories and colours."}</p>
      </header>
      {results.length ? (
        <div className="search-grid">
          {results.map((product) => (
            <article className="search-card" key={product.id}>
              <Link href={`/products/${product.id}`}>
                <div className="search-card-art"><ProductVisual product={product} /></div>
                <div><strong>{product.name}</strong><span>{product.subcategory}</span><span>{formatMoney(product.price, product.currency)}</span></div>
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="search-empty"><p>No products matched that search.</p><Link href="/collections/shopall" className="home-cta home-cta--dark">Browse all equipment</Link></div>
      )}
    </main>
  );
}
