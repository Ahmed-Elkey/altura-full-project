"use client";

import { getUserErrorMessage } from "@/lib/api-errors";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { colorHex, type Product } from "@/data/products";
import { useCart } from "./CartProvider";
import { productAssetPath } from "./ProductVisual";
import { formatMoney } from "@/lib/money";
import { commerceFetch, type CommerceCatalogProduct, type CommerceCatalogVariant } from "@/lib/commerce-api";
import { catalogProductToStorefrontProduct } from "@/lib/storefront";
import { useCustomerAuth } from "@/components/account/CustomerAuthProvider";
import { CatalogFallbackNotice } from "./CatalogFallbackNotice";
import { ProductImageViewer } from "./ProductImageViewer";

export function ProductDetail({ product, recommendations = [], initialColor }: { product: Product; recommendations?: Product[]; initialColor?: string }) {
  const firstColor = initialColor && product.colors.includes(initialColor) ? initialColor : product.colors[0];
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => setClientReady(true), []);
  const [color, setColor] = useState(firstColor);
  const [size, setSize] = useState(product.sizes[0]);
  const [descOpen, setDescOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [commerceProduct, setCommerceProduct] = useState<CommerceCatalogProduct | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [addError, setAddError] = useState("");
  const [wishlistMessage, setWishlistMessage] = useState("");
  const [wishlistError, setWishlistError] = useState("");
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const sizeWrapRef = useRef<HTMLDivElement>(null);
  const [sizeLine, setSizeLine] = useState({ left: 0, width: 0 });
  const { addItem, openCart } = useCart();
  const { state: customerState, apiFetch } = useCustomerAuth();
  const mediaViews = ["front", "back", "detail", "angled"] as const;

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    void commerceFetch<CommerceCatalogProduct>(`/catalog/products/${encodeURIComponent(product.id)}`)
      .then((r) => { if (!cancelled) setCommerceProduct(r); })
      .catch(() => { if (!cancelled) setCommerceProduct(null); })
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [product.id]);

  const selectedColorway = commerceProduct?.colorways.find((c) => c.name.toLowerCase() === color.toLowerCase());
  const availableSizes = selectedColorway?.variants.map((v) => v.size) ?? product.sizes;
  const selectedVariant: CommerceCatalogVariant | undefined = selectedColorway?.variants.find((v) => v.size === size);
  const displayedPrice = selectedVariant?.price ?? commerceProduct?.basePrice ?? product.price;
  const displayProduct = commerceProduct ? catalogProductToStorefrontProduct(commerceProduct, product) : product;

  useEffect(() => {
    if (commerceProduct?.colors.length && !commerceProduct.colors.some((item) => item.toLowerCase() === color.toLowerCase())) {
      setColor(commerceProduct.colors[0]);
    }
  }, [commerceProduct, color]);

  useEffect(() => {
    if (availableSizes.length && !availableSizes.includes(size)) setSize(availableSizes[0]);
  }, [availableSizes, size]);

  useEffect(() => {
    const measure = () => {
      const wrap = sizeWrapRef.current;
      if (!wrap) return;
      const selected = wrap.querySelector<HTMLElement>('.product-form-option__input:checked + .product-form-option__btn');
      if (selected) {
        const wrapRect = wrap.getBoundingClientRect();
        const btnRect = selected.getBoundingClientRect();
        setSizeLine({ left: btnRect.left - wrapRect.left, width: btnRect.width });
      }
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [size, displayProduct.sizes, commerceProduct]);

  useEffect(() => {
    let cancelled = false;
    try {
      const stored = JSON.parse(window.localStorage.getItem("altura:recently-viewed") || "[]");
      const previous = Array.isArray(stored) ? stored.filter((slug): slug is string => typeof slug === "string" && slug !== product.id) : [];
      const next = [product.id, ...previous].slice(0, 5);
      window.localStorage.setItem("altura:recently-viewed", JSON.stringify(next));
      void Promise.all(next.slice(1, 4).map(async (slug) => {
        try {
          const item = await commerceFetch<CommerceCatalogProduct>(`/catalog/products/${encodeURIComponent(slug)}`);
          return catalogProductToStorefrontProduct(item);
        } catch {
          return null;
        }
      })).then((items) => {
        if (!cancelled) setRecentProducts(items.filter((item): item is Product => item !== null));
      });
    } catch {
      if (!cancelled) setRecentProducts([]);
    }
    return () => { cancelled = true; };
  }, [product.id]);

  async function handleAdd() {
    setAddError("");
    if (catalogLoading || !commerceProduct) {
      setAddError("Live inventory is unavailable. Please try again when commerce is connected.");
      return;
    }
    if (!selectedVariant?.inStock) {
      setAddError("This colour and size is currently unavailable.");
      return;
    }
    try {
      await addItem(product, color, size, selectedVariant.id);
      setAdded(true);
      setTimeout(() => openCart(), 200);
      setTimeout(() => setAdded(false), 1400);
    } catch (caught) {
      setAddError(getUserErrorMessage(caught, "cart"));
    }
  }

  async function handleSaveToWishlist() {
    if (!commerceProduct) return;
    setWishlistBusy(true);
    setWishlistError("");
    setWishlistMessage("");
    try {
      const init = { method: "POST", body: JSON.stringify({ productId: commerceProduct.id }) };
      if (customerState === "authenticated") await apiFetch("/wishlist/items", init);
      else await commerceFetch("/wishlist/items", init);
      setWishlistMessage("Saved to your wishlist.");
    } catch (caught) {
      setWishlistError(getUserErrorMessage(caught, "wishlist"));
    } finally {
      setWishlistBusy(false);
    }
  }

  function openLightbox(index: number) {
    setLightboxIndex(index);
  }

  return (
    <main className="customer-product">
      <nav className="customer-product__breadcrumb" aria-label="Breadcrumb"><Link href="/collections/shopall">Collection</Link><span aria-hidden="true">/</span><span>{displayProduct.name}</span></nav>
      <CatalogFallbackNotice visible={product.catalogSource === "static-fallback"} />
      <div className="product-single" id="product-single" data-module="product-single">
        {/* Medias — desktop 4 stacked */}
        <div className="product-single__medias">
          {mediaViews.map((view, index) => (
            <figure key={view} className="product-single__media" style={{ ["--ratio" as any]: 0.8 } as any}>
              <button className="product-single__mediaButton" type="button" aria-label={`Enlarge ${displayProduct.name} ${color} ${view} image`} onClick={() => openLightbox(index)}>
                <img
                  src={productAssetPath(displayProduct, color, view)}
                  alt={`${displayProduct.name} ${color} ${view}`}
                  width={800}
                  height={1000}
                  loading={index === 0 ? "eager" : "lazy"}
                  className="product-single__img"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </button>
            </figure>
          ))}
        </div>

        {/* Content sticky */}
        <div className="product-single__content">
          <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 className="product-single__title">{displayProduct.name}</h1>
            <span className="product-single__price" data-product-form-price>
              <span>{formatMoney(displayedPrice, commerceProduct?.currency ?? product.currency)}</span>
            </span>
          </header>


          <form className="product-form product-single__form" onSubmit={(e) => { e.preventDefault(); void handleAdd(); }}>
            <select name="id" className="d-none" style={{ display: "none" }} defaultValue={`${color}-${size}`}>
              {displayProduct.colors.flatMap((c) =>
                displayProduct.sizes.map((s) => (
                  <option key={`${c}-${s}`} value={`${c}-${s}`} data-option-1={c} data-option-2={s}>
                    {c} / {s}
                  </option>
                ))
              )}
            </select>

            <div className="product-form__options">
              <aside className="product-form__option product-form__option--color" style={{ ["--index" as any]: 1 } as any}>
                <label className="product-form__optionLabel product-form__optionLabel--color">
                  Color: {color}
                </label>
                <div className="product-form__radioOptionWrap product-form__radioOptionWrap--color">
                  {displayProduct.colors.map((c, idx) => (
                    <div key={c} className="product-form-option --with-color" style={{ ["--swatch-color" as any]: colorHex[c] || "#ddd" } as any}>
                      <input
                        className="product-form-option__input product-form__radioOption"
                        type="radio"
                        id={`option-1-${idx + 1}`}
                        name="option-1"
                        value={c}
                        checked={color === c}
                        onChange={() => setColor(c)}
                      />
                      <label
                        htmlFor={`option-1-${idx + 1}`}
                        aria-label={c}
                        className={`product-form-option__btn product-form-option__btn--color`}
                        style={{ width: 48, height: 14, minHeight: 14, borderRadius: 0, padding: 0, border: 0, background: "transparent", overflow: "visible" } as any}
                      >
                        <span className="product-form-option__btn__bg" style={{ background: colorHex[c] || "#ddd", position: "absolute", inset: 0, display: "block" } as any} />
                      </label>
                    </div>
                  ))}
                  <span
                    className="product-form__colorLine"
                    aria-hidden="true"
                    style={{ left: `${displayProduct.colors.indexOf(color) * 56 + 14}px` } as any}
                  />
                </div>
              </aside>

              <aside className="product-form__option product-form__option--size" style={{ ["--index" as any]: 2 } as any}>
                <label className="product-form__optionLabel product-form__optionLabel--size">Size</label>
                {displayProduct.sizes.length === 1 ? (
                  <span className="product-form__singleSize">{displayProduct.sizes[0].toUpperCase()}</span>
                ) : (
                  <div className="product-form__radioOptionWrap" ref={sizeWrapRef}>
                    {displayProduct.sizes.map((s, idx) => {
                      const inStock = !commerceProduct || availableSizes.includes(s);
                      return (
                        <div key={s} className="product-form-option">
                          <input
                            className="product-form-option__input product-form__radioOption"
                            type="radio"
                            id={`option-2-${idx + 1}`}
                            name="option-2"
                            value={s}
                            checked={size === s}
                            disabled={!inStock}
                            onChange={() => setSize(s)}
                          />
                          <label
                            htmlFor={`option-2-${idx + 1}`}
                            aria-label={s}
                            className="product-form-option__btn"
                            style={{ ["--radio-index" as any]: idx + 1 } as any}
                          >
                            <span className="product-form-option__btn__bg" />
                            <span className="product-form-option__btn__label">{s}</span>
                          </label>
                        </div>
                      );
                    })}
                    <span
                      className="product-form__sizeLine"
                      aria-hidden="true"
                      style={{ left: `${sizeLine.left}px`, width: `${sizeLine.width}px` } as any}
                    />
                  </div>
                )}
              </aside>
            </div>

            <div className="product-form__btnWrap d-grid">
              <button
                className="btn product-form__btn --checkout"
                aria-label="Add to cart"
                type="submit"
                disabled={catalogLoading || !commerceProduct || !selectedVariant?.inStock}
              >
                <span className="btn__bg" aria-hidden="true" />
                <span className="btn__label" aria-hidden="true">
                  {catalogLoading ? "Checking…" : !commerceProduct ? "Commerce unavailable" : added ? "Added to cart" : "Add to cart"}
                </span>
              </button>
              <button className="btn product-form__btn --soldout" disabled aria-label="Sold out" style={{ display: "none" }}>
                <span className="btn__bg" aria-hidden="true" />
                <span className="btn__label" aria-hidden="true">Sold out</span>
              </button>
            </div>
            <div className="product-form__cartError" role={addError ? "alert" : undefined}>
              {addError ? <span style={{ fontSize: 12, color: "var(--status-error)" }}>{addError}</span> : null}
            </div>
          </form>

          <div className="product-single__wishlist">
            <button type="button" className="product-single__wishlistBtn" disabled={catalogLoading || !commerceProduct || customerState === "loading" || wishlistBusy} onClick={() => void handleSaveToWishlist()}>
              {wishlistBusy ? "Saving…" : wishlistMessage ? "Saved to wishlist" : "Save to wishlist"}
            </button>
            {wishlistError ? <p role="alert">{wishlistError}</p> : null}
            {wishlistMessage ? <p role="status" aria-live="polite">{wishlistMessage} <Link href="/wishlist">View wishlist →</Link></p> : null}
          </div>

          <div className="product-single__descWrap">
            <div className="product-single__desc">
              <p>{displayProduct.description}</p>
            </div>
            <div className={`product-single__descMoreWrapper ${descOpen ? "is-open" : ""}`}>
              <button
                className="product-single__descMoreBtn"
                aria-expanded={descOpen}
                aria-label={descOpen ? "- Close" : "+ More"}
                type="button"
                onClick={() => setDescOpen((v) => !v)}
              >
                <span className="product-single__descMoreBtnLabel">+ More</span>
                <span className="product-single__descMoreBtnLabel">- Close</span>
              </button>
              <div className="product-single__descMore" aria-hidden={!descOpen}>
                {displayProduct.details.map((d) => (
                  <span key={d} style={{ display: "block" }}>
                    - {d}
                  </span>
                ))}
                <span style={{ display: "block", marginTop: 8 }}>{displayProduct.fit}</span>
                <span style={{ display: "block" }}>Made in Egypt</span>
              </div>
            </div>
          </div>
        </div>

        <div className="product-single__tools">
          <button className="product-single__zoomBtn" type="button" onClick={() => openLightbox(0)}>
            View images full screen
          </button>
        </div>
      </div>

      {lightboxIndex !== null ? (
        <ProductImageViewer name={displayProduct.name} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} images={mediaViews.map(view => ({ src: productAssetPath(displayProduct, color, view), alt: `${displayProduct.name} ${color} ${view}`, view }))} />
      ) : null}

      <div className="product-recommendations">
        <header className="product-recommendations__header">
          <h2 className="product-recommendations__title">You might also like</h2>
        </header>
        <div className="product-recommendations__wrap">
          {recommendations
            .filter((p) => p.id !== product.id)
            .slice(0, 3)
            .map((p) => (
              <Link key={p.id} href={`/products/${p.id}`} className="product-recently-viewed__item">
                <img src={productAssetPath(p, p.colors[0], "front")} alt={p.name} loading="lazy" />
                <span>{p.name}</span>
                <small>{formatMoney(p.price, p.currency)}</small>
              </Link>
            ))}
        </div>
      </div>

      {recentProducts.length > 0 ? (
        <section className="product-recommendations product-recently-viewed" aria-label="Recently viewed">
          <header className="product-recommendations__header"><h2 className="product-recommendations__title">Recently viewed</h2></header>
          <div className="product-recommendations__wrap">
            {recentProducts.map((recent) => (
              <Link key={recent.id} href={`/products/${recent.id}`} className="product-recently-viewed__item">
                <img src={productAssetPath(recent, recent.colors[0], "front")} alt={recent.name} loading="lazy" />
                <span>{recent.name}</span>
                <small>{formatMoney(recent.price, recent.currency)}</small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {clientReady ? createPortal(<aside className="mobile-purchase-bar customer-product__purchase-bar" aria-label="Quick add selected product">
        <div><strong>{displayProduct.name}</strong><span>{color} / {size} · {formatMoney(displayedPrice, commerceProduct?.currency ?? product.currency)}</span></div>
        <button type="button" disabled={catalogLoading || !commerceProduct || !selectedVariant?.inStock} onClick={() => void handleAdd()}>
          {added ? "Added" : "Add to cart"}
        </button>
      </aside>, document.body) : null}
    </main>
  );
}
