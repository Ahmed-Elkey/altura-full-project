"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/data/products";
import { colorHex } from "@/data/products";
import { formatMoney } from "@/lib/money";
import { ProductColorSwatches } from "./ProductColorSwatches";
import { productAssetPath } from "./ProductVisual";
import { CatalogFallbackNotice } from "./CatalogFallbackNotice";

const sizes = ["XS", "S", "M", "L", "XL", "L-XL", "OS", "S-M"];

type DisplayVariant = { product: Product; color: string };
type SortMode = "featured" | "price-asc" | "price-desc" | "name-asc";

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

function BalmoralCollectionCard({
  product,
  color,
}: {
  product: Product;
  color: string;
}) {
  const [selectedColor, setSelectedColor] = useState(color);
  const href = `/products/${product.id}?color=${encodeURIComponent(selectedColor)}`;
  const src = productAssetPath(product, selectedColor, "front");

  return (
    <div className="product-preview d-grid product-archives__product">
      <Link href={href} className="product-preview__link col-start-1 row-start-1 row-span-2 d-grid td-none">
        <figure className="product-preview__thumbnail col-start-1 row-start-1 w-100 position-relative overflow-clip">
          <img
            key={src}
            src={src}
            alt={product.name}
            width={1800}
            height={2250}
            loading="lazy"
            className="product-preview__img image-as-background"
          />
        </figure>
        <div className="product-preview__content col-start-1 row-start-2 position-relative d-flex flex-column">
          <h3 className="product-preview__title fz-13 fz-xl-14 fw-400 lh-normal m-0">{product.name}</h3>
          <div className="product-preview__meta d-flex">
            <p className="product-preview__price d-flex fz-13 fz-xl-14 fw-400 lh-normal m-0">
              <span>{formatMoney(product.price, product.currency)}</span>
            </p>
            <ProductColorSwatches product={product} color={selectedColor} onChange={setSelectedColor} />
          </div>
        </div>
      </Link>
    </div>
  );
}

export function CollectionPage({ title, source }: { title: string; source: Product[] }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [stock, setStock] = useState<"all" | "in" | "out">("all");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [sort, setSort] = useState<SortMode>("featured");
  const filterButton = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(
    () =>
      source.filter((product) => {
        const stockMatch = stock === "all" || (stock === "in" ? product.inStock : !product.inStock);
        const sizeMatch = selectedSizes.length === 0 || selectedSizes.some((size) => product.sizes.includes(size));
        return stockMatch && sizeMatch;
      }),
    [source, stock, selectedSizes],
  );

  const ordered = useMemo(() => {
    const items = [...filtered];
    const featuredRank: Record<string, number> = {
      "meridian-tee": 1,
      "northline-tee": 2,
      "range-tee": 3,
      "clubhouse-tee": 4,
      "trail-cap": 5,
      "half-tights": 6,
      "winter-tights": 7,
    };
    switch (sort) {
      case "price-asc":
        items.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        items.sort((a, b) => b.price - a.price);
        break;
      case "name-asc":
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        items.sort((a, b) => (featuredRank[a.id] ?? 99) - (featuredRank[b.id] ?? 99));
        break;
    }
    return items;
  }, [filtered, sort]);

  const displayVariants = useMemo<DisplayVariant[]>(
    () => ordered.flatMap((product) => product.colors.map((color) => ({ product, color }))),
    [ordered],
  );

  function toggleSize(size: string) {
    setSelectedSizes((current) => (current.includes(size) ? current.filter((item) => item !== size) : [...current, size]));
  }

  const hasFilters = stock !== "all" || selectedSizes.length > 0;
  const collectionImage =
    title === "Shop All" || title === "Fall 26"
      ? "/editorial/new-arrivals.jpg"
      : title === "Accessories" || title === "Headwear"
        ? "/editorial/accessories.jpg"
        : title === "Bottoms" || title === "Shorts"
          ? "/editorial/bottoms.jpg"
          : title === "Tights"
            ? "/editorial/race-day.jpg"
            : "/editorial/tops.jpg";

  // Same Balmoral B&W runner hero for Accessories/Bottoms/Tops/Collection and all their sub-pages — requested to be identical
  const balmoralHero = "/editorial/accessories-hero-balmoral.jpg";
  const isAccessoriesFamily = ["Accessories", "Headwear", "Socks", "Other"].includes(title);
  const isBottomsFamily = ["Bottoms", "Shorts", "Tights", "Pants"].includes(title);
  const isTopsFamily = ["Tops", "T-Shirts", "Tank Tops", "Pullovers", "Jackets"].includes(title);
  const isCollectionFamily = ["Shop All", "Fall 26", "Performance", "Lifestyle", "Collection", "Complete Fleet"].includes(title);
  const heroImage = isAccessoriesFamily || isBottomsFamily || isTopsFamily || isCollectionFamily ? balmoralHero : collectionImage;

  useEffect(() => {
    if (!filtersOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        window.requestAnimationFrame(() => filterButton.current?.focus());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtersOpen]);

  return (
    <main className="collection-page" data-purpose="collection-page">
      {/* Balmoral-style hero — pb-row-page-header */}
      <section className="shopify-section section--pb-row-page-header" aria-labelledby="collection-heading">
        <div
          className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-0 mb-10 mt-md-0 mb-md-10 mt-xl-0 mb-xl-10 --has-text-color --has-bg-color"
          style={{ ["--zindex" as any]: 0, ["--text-color" as any]: "#ffffff", ["--bg-color" as any]: "#000000" } as React.CSSProperties}
        >
          <div
            id={`pb-row-page-header-${slug(title)}`}
            className="pb-row pb-row-page-header container-fluid position-relative d-grid row-gap-20 pb-30 pb-md-12 pb-xl-10"
          >
            <div className="pb-row-page-header__media position-absolute t-0 l-0 w-100 h-100 pointer-events-none" aria-hidden="true">
              <picture className="pb-row-page-header__picture position-absolute t-0 l-0 w-100 h-100">
                {/* Use Next Image for optimization but keep picture structure like Balmoral */}
                <Image
                  src={heroImage}
                  alt=""
                  fill
                  sizes="100vw"
                  priority
                  className="pb-row-page-header__img image-as-background"
                  style={{ objectFit: "cover" }}
                />
              </picture>
            </div>
            <header className="pb-row-page-header__header position-relative col-start-1 col-span-4 col-span-xl-9 row-start-md-1 align-self-end d-flex align-items-start">
              <h1 id="collection-heading" className="pb-row-page-header__title ff-heading fz-20 fz-md-32 fz-xl-40 fw-400 lh-normal m-0">
                {title}
              </h1>
            </header>
          </div>
        </div>
      </section>
      <CatalogFallbackNotice visible={source.some((product) => product.catalogSource === "static-fallback")} />

      {/* Balmoral-style product archives */}
      <div className="shopify-section">
        <div
          className="product-archives position-relative container-fluid d-flex flex-column grid-gap-10 grid-gap-xl-5 mb-20 mb-xl-30"
          data-module="product-archives"
        >
          <header className="product-archives__header d-flex align-items-center justify-content-between" style={{ minHeight: "24px" }}>
            <h2 className="product-archives__title ff-heading fz-13 fz-md-14 fz-xl-15 fw-400 lh-normal m-0" style={{ lineHeight: 1.2 }}>
              Collection
            </h2>
            <button
              ref={filterButton}
              className="btn product-archives__filterBtn fz-13 fz-md-14 fz-xl-15 tt-none --link --link-no-underline --link-icon-left"
              aria-controls="product-archives__filters"
              aria-expanded={filtersOpen}
              aria-label="Filter by"
              onClick={() => setFiltersOpen((open) => !open)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
                fontWeight: 400,
                lineHeight: 1,
                letterSpacing: "0",
                textTransform: "none",
              }}
            >
              <span
                className="btn__icon --icon-filter d-inline-flex align-items-center justify-content-center"
                aria-hidden="true"
                style={{ opacity: 0.7, display: "inline-flex", flexShrink: 0, width: "12px", height: "10px", lineHeight: 0 }}
              >
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ display: "block" }}>
                  <line x1="12" y1="8" x2="0" y2="8" stroke="currentColor" strokeWidth="1" />
                  <line x1="9" y1="6" x2="9" y2="10" stroke="currentColor" strokeWidth="1" />
                  <line x1="12" y1="2" x2="0" y2="2" stroke="currentColor" strokeWidth="1" />
                  <line x1="3" y1="0" x2="3" y2="4" stroke="currentColor" strokeWidth="1" />
                </svg>
              </span>
              <span className="btn__label" aria-hidden="true" style={{ display: "inline-block", lineHeight: 1 }}>
                Filter by
              </span>
            </button>
          </header>

          {/* Filters drawer — Balmoral replica — exact sizes from screenshot */}
          <div
            id="product-archives__filters"
            className="product-archives__filters position-absolute z-1000 d-grid col-gap-10 row-gap-10 bg-color-white color-black"
            aria-hidden={!filtersOpen}
            inert={!filtersOpen ? (true as any) : undefined}
            style={
              filtersOpen
                ? {
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    top: 0,
                    // left/right handled by CSS: mobile = full, desktop = right-aligned narrow
                    padding: "10px 12px 14px",
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--line)",
                    zIndex: 10,
                    maxWidth: "380px",
                    width: "calc(100vw - var(--container-fluid-margin) * 2)",
                    right: "var(--container-fluid-margin)",
                    left: "auto" as any,
                    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
                  }
                : { display: "none" }
            }
          >
            <p
              className="btn product-archives__filters__title fz-13 tt-none m-0 pointer-events-none --link --link-no-underline --link-icon-left d-flex align-items-center"
              style={{ gap: "8px", fontSize: "13px", fontWeight: 400, lineHeight: 1 }}
            >
              <span
                className="btn__icon --icon-filter d-inline-flex align-items-center justify-content-center"
                aria-hidden="true"
                style={{ opacity: 0.7, display: "inline-flex", flexShrink: 0, width: "12px", height: "10px", lineHeight: 0 }}
              >
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
                  <line x1="12" y1="8" x2="0" y2="8" stroke="currentColor" strokeWidth="1" />
                  <line x1="9" y1="6" x2="9" y2="10" stroke="currentColor" strokeWidth="1" />
                  <line x1="12" y1="2" x2="0" y2="2" stroke="currentColor" strokeWidth="1" />
                  <line x1="3" y1="0" x2="3" y2="4" stroke="currentColor" strokeWidth="1" />
                </svg>
              </span>
              <span className="btn__label" aria-hidden="true" style={{ lineHeight: 1 }}>
                Filter by
              </span>
            </p>

            <button
              className="btn product-archives__filters__closeBtn --ui d-inline-flex align-items-center justify-content-center"
              aria-label="Close"
              onClick={() => {
                setFiltersOpen(false);
                window.requestAnimationFrame(() => filterButton.current?.focus());
              }}
              style={{
                width: "28px",
                height: "28px",
                border: "1px solid currentColor",
                borderRadius: "50%",
                background: "transparent",
                flexShrink: 0,
              }}
            >
              <span className="btn__icon --icon-close d-inline-flex align-items-center justify-content-center" aria-hidden="true" style={{ lineHeight: 0 }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
                  <path d="M10.3535 0.353516L0.353516 10.3535" stroke="currentColor" />
                  <path d="M10.3535 10.3535L0.353516 0.353515" stroke="currentColor" />
                </svg>
              </span>
            </button>

            <form className="facets d-grid product-archives__filters__facets col-span-2" style={{ display: "grid", gap: "0", marginTop: "6px" } as React.CSSProperties}>
              <div
                className="facet d-grid align-items-center m-0 p-0 --type-list --filter-availability"
                data-facet-slug="availability"
                aria-label="Availability"
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 1fr",
                  alignItems: "center",
                  borderTop: "1px solid rgba(3,5,4,0.1)",
                  borderBottom: "1px solid rgba(3,5,4,0.1)",
                  padding: "8px 0",
                  columnGap: "16px",
                } as React.CSSProperties}
              >
                <p className="facet__label fz-12 fw-500 lh-normal m-0 p-0" aria-hidden="true" style={{ fontSize: "12px", fontWeight: 600, lineHeight: 1.2 }}>
                  Availability
                </p>
                <ul className="facet__filters d-flex align-items-center list-none m-0 p-0" role="list" style={{ gap: "16px", flexWrap: "wrap" }}>
                  <li>
                    <label
                      className="facet__filter d-block tt-uppercase"
                      style={{ fontSize: "11px", fontWeight: 500, textTransform: "uppercase", cursor: "pointer", lineHeight: 1.2, letterSpacing: "0.02em" }}
                    >
                      <input
                        id={`filter-${title}-availability-1`}
                        name={`${title}-availability`}
                        type="radio"
                        checked={stock === "in"}
                        onChange={() => setStock("in")}
                        className="facet__filter__input d-none"
                        style={{ display: "none" }}
                      />
                      <span style={{ borderBottom: stock === "in" ? "1px solid currentColor" : "1px solid transparent", paddingBottom: "1px" }}>IN STOCK</span>
                    </label>
                  </li>
                  <li>
                    <label
                      className="facet__filter d-block tt-uppercase"
                      style={{ fontSize: "11px", fontWeight: 500, textTransform: "uppercase", cursor: "pointer", lineHeight: 1.2, letterSpacing: "0.02em" }}
                    >
                      <input
                        id={`filter-${title}-availability-2`}
                        name={`${title}-availability`}
                        type="radio"
                        checked={stock === "out"}
                        onChange={() => setStock("out")}
                        className="facet__filter__input d-none"
                        style={{ display: "none" }}
                      />
                      <span style={{ borderBottom: stock === "out" ? "1px solid currentColor" : "1px solid transparent", paddingBottom: "1px" }}>OUT OF STOCK</span>
                    </label>
                  </li>
                </ul>
              </div>

              <div
                className="facet d-grid align-items-center m-0 p-0 --type-list --filter-size"
                data-facet-slug="size"
                aria-label="Size"
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 1fr",
                  alignItems: "center",
                  borderBottom: "1px solid rgba(3,5,4,0.1)",
                  padding: "8px 0",
                  columnGap: "16px",
                } as React.CSSProperties}
              >
                <p className="facet__label fz-12 fw-500 lh-normal m-0 p-0" aria-hidden="true" style={{ fontSize: "12px", fontWeight: 600, lineHeight: 1.2 }}>
                  Size
                </p>
                <ul className="facet__filters d-flex align-items-center list-none m-0 p-0" role="list" style={{ gap: "14px", flexWrap: "wrap" }}>
                  {(title === "Accessories" ? ["L-XL", "OS", "S-M"] : sizes).map((size) => (
                    <li key={size}>
                      <label
                        className="facet__filter d-block tt-uppercase"
                        style={{ fontSize: "11px", fontWeight: 500, textTransform: "uppercase", cursor: "pointer", lineHeight: 1.2, letterSpacing: "0.02em" }}
                      >
                        <input
                          id={`filter-${title}-size-${size}`}
                          name={`filter-${title}-size`}
                          type="checkbox"
                          value={size}
                          checked={selectedSizes.includes(size)}
                          onChange={() => toggleSize(size)}
                          className="facet__filter__input d-none"
                          style={{ display: "none" }}
                        />
                        <span style={{ borderBottom: selectedSizes.includes(size) ? "1px solid currentColor" : "1px solid transparent", paddingBottom: "1px" }}>{size}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </form>

            <button
              className="btn product-archives__filters__clearBtn col-span-2 justify-self-start"
              aria-label="Remove all filters"
              onClick={() => {
                setStock("all");
                setSelectedSizes([]);
              }}
              disabled={!hasFilters}
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                opacity: hasFilters ? 1 : 0.35,
                pointerEvents: hasFilters ? "auto" : "none",
                gridColumn: "1 / span 2",
                justifySelf: "start",
                marginTop: "2px",
                lineHeight: 1.2,
                fontWeight: 500,
              }}
            >
              <span className="btn__label" aria-hidden="true">
                REMOVE ALL FILTERS
              </span>
            </button>

            {/* Sort — keep tiny, Balmoral style */}
            <div
              style={{
                gridColumn: "1 / span 2",
                borderTop: "1px solid rgba(3,5,4,0.07)",
                paddingTop: "8px",
                marginTop: "2px",
                display: "flex",
                gap: "12px",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Sort</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                style={{ background: "transparent", border: "0", fontSize: "11px", fontWeight: 500, textTransform: "uppercase", cursor: "pointer", letterSpacing: "0.02em" }}
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price, low to high</option>
                <option value="price-desc">Price, high to low</option>
                <option value="name-asc">Alphabetically</option>
              </select>
              <span style={{ marginLeft: "auto", fontSize: "11px", opacity: 0.5 }}>{displayVariants.length} products</span>
            </div>
          </div>

          <div className="product-archives__productsWrap d-flex flex-column row-gap-40" style={{ opacity: 1, transition: "opacity 0.25s linear" } as React.CSSProperties}>
            <ol
              className="product-archives__products d-grid grid-column-2 grid-column-md-4 col-gap-10 row-gap-20 row-gap-md-10 row-gap-xl-30 list-none m-0 p-0"
              style={{ display: "grid" } as React.CSSProperties}
            >
              {displayVariants.map(({ product, color }, index) => (
                <li key={`${product.id}-${color}`} style={{ ["--index" as any]: index + 1 } as React.CSSProperties}>
                  <BalmoralCollectionCard product={product} color={color} />
                </li>
              ))}
            </ol>
            {displayVariants.length === 0 && <div className="collection-empty" style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>No products match the selected filters.</div>}
          </div>
        </div>
      </div>
    </main>
  );
}
