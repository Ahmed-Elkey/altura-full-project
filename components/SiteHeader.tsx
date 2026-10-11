"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";
import { BagIcon } from "./BagIcon";
import { useCart } from "./CartProvider";
import { useCustomerAuth } from "./account/CustomerAuthProvider";
import { getProduct, storefrontProducts, type Product } from "@/data/products";
import { ProductVisual } from "./ProductVisual";
import { store } from "@/data/store";
import { formatMoney } from "@/lib/money";

const navLeft = [
  { label: "Collection", href: "/collections/shopall", children: [
    { label: "Fall 26", href: "/collections/fall-26" },
    { label: "Performance", href: "/collections/performance" },
    { label: "Lifestyle", href: "/collections/lifestyle" },
  ]},
  { label: "Tops", href: "/collections/tops", children: [
    { label: "T-Shirts & Longsleeves", href: "/collections/t-shirts" },
    { label: "Tank Tops", href: "/collections/tank-tops" },
    { label: "Pullovers", href: "/collections/pullovers" },
    { label: "Jackets", href: "/collections/jackets" },
  ]},
  { label: "Bottoms", href: "/collections/bottoms", children: [
    { label: "Tights", href: "/collections/tights" },
    { label: "Pants", href: "/collections/pants" },
  ]},
  { label: "Accessories", href: "/collections/accessories", children: [
    { label: "Headwear", href: "/collections/headwear" },
    { label: "Socks", href: "/collections/socks" },
    { label: "Other", href: "/collections/other" },
  ]},
];

const navRight = [
  { label: "The brand", href: "/info/about", children: [
    { label: "About us", href: "/info/about" },
    { label: "Journal", href: "/info/journal" },
    { label: "Shipping", href: "/info/shipping" },
  ]},
];

export function SiteHeader({ commerceDegraded = false }: { commerceDegraded?: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<Product[]>(storefrontProducts);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [suppressHover, setSuppressHover] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const cartButton = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);
  const cartPanel = useRef<HTMLElement>(null);
  const restoreTarget = useRef<HTMLElement | null>(null);
  const wasOverlayOpen = useRef(false);
  const { lines, count, subtotal, currency, loading: cartLoading, error: cartError, issues, recommendationSeed, removeItem, setQuantity, cartOpen, openCart, closeCart } = useCart();
  const overlayOpen = menuOpen || searchOpen;
  const freeShippingThreshold = store.freeShippingThreshold;
  const amountToFreeShipping = Math.max(0, freeShippingThreshold - subtotal);
  const freeShippingProgress = Math.min(100, (subtotal / freeShippingThreshold) * 100);
  const { state: authState } = useCustomerAuth();
  const isHome = pathname === "/";

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/products?limit=100")
      .then((response) => response.ok ? response.json() as Promise<{ products: Product[] }> : null)
      .then((body) => { if (!cancelled && body?.products) setCatalogProducts(body.products); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return catalogProducts.filter((product) =>
      [product.name, product.category, product.subcategory, ...product.colors]
        .some((value) => value.toLowerCase().includes(normalized)),
    ).slice(0, 6);
  }, [catalogProducts, query]);

  // "You may also like" follows the last product the shopper touched (reference
  // behaviour): no rail until a product context exists, and the rail keeps its
  // products while the cart stays on screen.
  const recommendations = useMemo(() => {
    // Seed = last touched product, falling back to the cart's first line so a
    // reloaded cart still shows the rail (reference `data-default-product-id`).
    const seedId = recommendationSeed ?? lines[0]?.product.id ?? null;
    const seed = seedId ? catalogProducts.find((product) => product.id === seedId) ?? getProduct(seedId) : null;
    if (!seed) return [];
    const inCart = new Set(lines.map((line) => line.product.id));
    const pool = catalogProducts.filter((product) => product.inStock && product.id !== seed.id && !inCart.has(product.id));
    const sameSubcategory = pool.filter((product) => product.category === seed.category && product.subcategory === seed.subcategory);
    const sameCategory = pool.filter((product) => product.category === seed.category && !sameSubcategory.includes(product));
    const rest = pool.filter((product) => !sameSubcategory.includes(product) && !sameCategory.includes(product));
    return [...sameSubcategory, ...sameCategory, ...rest].slice(0, 5);
  }, [catalogProducts, lines, recommendationSeed]);

  function closeAllOverlays() {
    setMenuOpen(false);
    setSearchOpen(false);
    closeCart();
  }

  function openMenu() {
    restoreTarget.current = menuButton.current;
    setSearchOpen(false);
    closeCart();
    setMenuOpen((v) => !v);
  }

  function openSearch() {
    restoreTarget.current = searchButton.current;
    setMenuOpen(false);
    closeCart();
    setSearchOpen((v) => !v);
  }

  function handleOpenCart() {
    restoreTarget.current = cartButton.current;
    setMenuOpen(false);
    setSearchOpen(false);
    openCart();
  }

  useLayoutEffect(() => {
    if (!searchOpen) return;
    searchInput.current?.focus({ preventScroll: true });
    const retry = window.setTimeout(() => searchInput.current?.focus({ preventScroll: true }), 320);
    return () => window.clearTimeout(retry);
  }, [searchOpen]);

  useEffect(() => {
    document.body.style.overflow = overlayOpen ? "hidden" : "";
    if (overlayOpen && !wasOverlayOpen.current && !restoreTarget.current) {
      restoreTarget.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    if (!overlayOpen && wasOverlayOpen.current) {
      const target = restoreTarget.current;
      restoreTarget.current = null;
      window.requestAnimationFrame(() => target?.focus());
    }
    wasOverlayOpen.current = overlayOpen;
    return () => {
      document.body.style.overflow = "";
    };
  }, [overlayOpen]);

  useLayoutEffect(() => {
    const html = document.documentElement;
    if (cartOpen) {
      // double rAF ensures the browser paints the initial off-screen state (translate3d 100%)
      // before transitioning to 0 — makes opening as smooth as closing
      let raf1 = 0;
      let raf2 = 0;
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          html.classList.add("--js-site-cart-opened");
        });
      });
      return () => {
        window.cancelAnimationFrame(raf1);
        window.cancelAnimationFrame(raf2);
      };
    } else {
      html.classList.remove("--js-site-cart-opened");
    }
  }, [cartOpen]);

  // Balmoral-like html classes — dark hero pages need white header like home
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("--js-site-nav-opened", menuOpen);
    html.classList.toggle("--js-site-search-opened", searchOpen);
    const isCollection = pathname.startsWith("/collections/");
    const shouldInverted = (isHome || isCollection) && !commerceDegraded && !headerScrolled && !menuOpen && !searchOpen && !cartOpen;
    document.body.classList.toggle("--site-header-inverted", shouldInverted);
    if (headerScrolled) {
      document.body.classList.add("--js-scroll-min");
    } else {
      document.body.classList.remove("--js-scroll-min");
      document.body.classList.remove("--js-scroll-down");
      document.body.classList.remove("--js-scroll-up");
    }
  }, [menuOpen, searchOpen, cartOpen, isHome, pathname, headerScrolled, commerceDegraded]);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    function updateHeader() {
      const y = window.scrollY;
      setHeaderScrolled(y > 10);
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(() => {
          const goingDown = y > lastY && y > 60;
          document.body.classList.toggle("--js-scroll-down", goingDown);
          document.body.classList.toggle("--js-scroll-up", !goingDown && y > 60);
          lastY = y;
          ticking = false;
        });
      }
    }
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeAllOverlays();
      if (event.key !== "Tab" || !overlayOpen) return;
      const activePanel = menuOpen ? menuPanel.current : searchOpen ? document.getElementById("site-header__searchbar") : cartPanel.current;
      const focusable = activePanel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cartOpen, menuOpen, overlayOpen, searchOpen]);

  useEffect(() => {
    if (menuOpen) menuPanel.current?.querySelector<HTMLElement>("button")?.focus();
    if (cartOpen) cartPanel.current?.querySelector<HTMLElement>("button")?.focus();
  }, [cartOpen, menuOpen]);

  // Close dropdown after navigation — like Balmoral (blur + suppress hover)
  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setSuppressHover(true);
    const t = setTimeout(() => setSuppressHover(false), 400);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <>
      <header
        id="site-header"
        className={`site-header ${suppressHover ? "suppress-hover" : ""}`}
        data-ui="site-header"
      >
        <div className="site-header__bg" aria-hidden="true" />

        <div
          id="site-header__searchbar"
          className="site-header__searchbar"
          aria-hidden={!searchOpen}
          role="dialog"
          aria-modal="true"
          aria-label="Search products"
          {...(searchOpen ? {} : { inert: true } as any)}
        >
          <form
            className="search-form site-header__searchForm"
            action="/search"
            method="get"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              const q = query.trim();
              if (q) {
                setSearchOpen(false);
                window.location.href = `/search?q=${encodeURIComponent(q)}`;
              }
            }}
          >
            <fieldset className="search-form__fieldset">
              <input
                ref={searchInput}
                className="search-form__input"
                type="text"
                name="q"
                aria-label="Search by keyword"
                placeholder="Search by keyword"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button className="btn search-form__btn --link" type="submit" aria-label="Search"><span className="btn__label">Search</span></button>
            </fieldset>
          </form>
          <button className="btn site-header__searchClose --ui" aria-label="Close" onClick={() => setSearchOpen(false)}>
            <span className="btn__icon --icon-close"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M10.3535 0.353516L0.353516 10.3535" stroke="currentColor"/><path d="M10.3535 10.3535L0.353516 0.353515" stroke="currentColor"/></svg></span>
          </button>
          {query && (
            <div className="site-header__searchResults">
              {searchResults.length ? searchResults.map((product) => (
                <Link
                  href={`/products/${product.id}?color=${encodeURIComponent(product.colors[0])}`}
                  className="search-result"
                  key={product.id}
                  onClick={() => { setSearchOpen(false); setQuery(""); }}
                >
                  <div className="search-result-art"><ProductVisual product={product} color={product.colors[0]} /></div>
                  <div><strong>{product.name}</strong><small>{product.subcategory}</small></div>
                  <span>{formatMoney(product.price, product.currency)}</span>
                </Link>
              )) : <p className="search-no-results">No results for “{query}”.</p>}
            </div>
          )}
        </div>

        <div className="site-header__wrap container-fluid">
          <nav className="site-header__leftNav">
            <button
              ref={menuButton}
              className="site-header__burger d-xl-none"
              type="button"
              aria-label="Menu"
              aria-controls="site-nav"
              aria-expanded={menuOpen}
              onClick={openMenu}
            />
            <ul className="site-header__leftMenu menu d-none d-xl-flex">
              {navLeft.map((item) => (
                <li className="menu-item" key={item.label}>
                  <Link href={item.href}>{item.label}</Link>
                  {item.children.length > 0 && (
                    <ul>
                      {item.children.map((child, idx) => (
                        <li className="menu-item" style={{ ["--index" as any]: idx } as any} key={child.label}>
                          <Link href={child.href}>{child.label}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <figure className="site-header__logo">
            <Wordmark />
          </figure>

          <nav className="site-header__rightNav">
            <ul className="site-header__rightMenu menu d-none d-xl-flex">
              {navRight.map((item) => (
                <li className="menu-item" key={item.label}>
                  <Link href={item.href}>{item.label}</Link>
                  <ul>
                    {item.children.map((child, idx) => (
                      <li className="menu-item" style={{ ["--index" as any]: idx } as any} key={child.label}>
                        <Link href={child.href}>{child.label}</Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <button
              ref={cartButton}
              className="site-header__cartBtn"
              type="button"
              aria-label="Cart"
              aria-controls="site-cart"
              aria-expanded={cartOpen}
              data-cart-count={count}
              onClick={handleOpenCart}
            >
              <span>Cart</span>
              <BagIcon size={18} />
            </button>

            <button
              ref={searchButton}
              className="site-header__searchBtn"
              aria-label="Search"
              aria-controls="site-header__searchbar"
              aria-expanded={searchOpen}
              onClick={openSearch}
            >
              <span>Search</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M6.93181 0.351318C10.2243 0.51812 12.8429 3.241 12.8429 6.57495L12.8351 6.89526C12.7612 8.35374 12.1845 9.67892 11.2765 10.7039L15.965 15.1873L15.6193 15.5486L15.2746 15.9099L10.5549 11.3972C9.48045 12.2768 8.10822 12.8064 6.6115 12.8064L6.29118 12.7986C3.1047 12.6373 0.549292 10.0817 0.387863 6.89526L0.380051 6.57495C0.380051 3.13352 3.17006 0.343506 6.6115 0.343506L6.93181 0.351318ZM6.6115 1.34351C3.72234 1.34351 1.38005 3.6858 1.38005 6.57495C1.38015 9.46402 3.7224 11.8064 6.6115 11.8064C9.50051 11.8063 11.8428 9.46396 11.8429 6.57495C11.8429 3.68586 9.50057 1.3436 6.6115 1.34351Z" fill="currentColor"/></svg>
            </button>

            <Link href="/account" className="site-header__accountLink">
              {authState === "authenticated" ? "Account" : "Login"}
            </Link>
          </nav>
        </div>
      </header>

      <div className="site-header__spacer" aria-hidden="true" />

      <div ref={menuPanel} id="site-nav" className={`site-nav ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen} {...(menuOpen ? {} : { inert: true } as any)} role="dialog" aria-modal="true" aria-label="Site menu">
        <div className="site-nav__bg" aria-hidden="true" />
        <div className="site-nav__scroller">
            <button type="button" className="site-nav__close" aria-label="Close" onClick={() => setMenuOpen(false)}>
              Close
            </button>
          <nav className="site-nav__wrap container-fluid">
            <ul className="site-nav__menu menu">
              {[...navLeft, ...navRight, { label: "Account", href: "/account", children: [] }].map((group) => (
                <li className="menu-item" key={group.label}>
                  <Link href={group.href} onClick={() => setMenuOpen(false)}>{group.label}</Link>
                  {group.children.length > 0 && (
                    <ul>
                      {group.children.map((item) => (
                        <li className="menu-item" key={item.label}><Link href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link></li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <aside
        ref={cartPanel}
        id="site-cart"
        className={`site-cart ${count ? "" : "--is-empty"}`}
        data-ui="site-cart"
        aria-hidden={!cartOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
      >
        <div className="site-cart__backdrop" onClick={closeCart} aria-hidden="true" />
        <div className="site-cart__container">
          <header className="site-cart__header">
            <span className="site-cart__title">
              <span aria-hidden="true">Cart</span>
              <span className={`site-cart__cartCount ${count ? "" : "--empty"}`} aria-hidden="true">{count}</span>
            </span>
            <button type="button" className="site-cart__close" aria-label="Close cart" onClick={closeCart}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                <path d="M10.3535 0.353516L0.353516 10.3535" stroke="currentColor" />
                <path d="M10.3535 10.3535L0.353516 0.353515" stroke="currentColor" />
              </svg>
            </button>
          </header>

          <div className="site-cart__content">
            <div className="site-cart__items">
              {cartLoading && <p className="site-cart__notice" role="status">Updating your cart…</p>}
          {cartError && <p className="site-cart__notice" role="alert">{cartError}</p>}
              {lines.length === 0 ? (
                <div className="site-cart__empty">
                  <p className="site-cart__emptyTitle">Your cart is empty<br />—</p>
                  <p className="site-cart__emptyText">Start exploring to find your next favorite piece.</p>
                  <Link href="/collections/shopall" className="btn site-cart__emptyLink --link" onClick={closeCart}>
                    <span className="btn__label">Shop All</span>
                  </Link>
                </div>
              ) : (
                lines.map((line) => {
                  const lineIssue = issues.find((issue) => issue.itemId === line.itemId);
                  return (
                    <article className="site-cart__item" key={line.key}>
                      <Link
                        href={`/products/${line.product.id}?color=${encodeURIComponent(line.color)}`}
                        className="site-cart__itemImgBox"
                        onClick={closeCart}
                      >
                        <ProductVisual product={line.product} color={line.color} />
                      </Link>
                      <span className="site-cart__itemContent">
                        <Link
                          href={`/products/${line.product.id}?color=${encodeURIComponent(line.color)}`}
                          className="site-cart__itemTitle"
                          onClick={closeCart}
                        >
                          {line.product.name}
                        </Link>
                        <span className="site-cart__itemOptions">
                          <span className="site-cart__itemOption">Color {line.color}</span>
                          <span className="site-cart__itemOption">Size {line.size}</span>
                        </span>
                      </span>
                      <span className="site-cart__itemPrice">
                        <span>{formatMoney(line.unitPrice * line.quantity, line.currency || currency)}</span>
                      </span>
                      <div className="site-cart__itemIncrement">
                        <button
                          type="button"
                          aria-label={`Decrease ${line.product.name} quantity`}
                          onClick={() => void setQuantity(line.key, line.quantity - 1).catch(() => {})}
                        >
                          <svg width="7" height="7" viewBox="0 0 7 7" fill="none" aria-hidden="true">
                            <path d="M0 3.24597H6.50195" stroke="currentColor" />
                          </svg>
                        </button>{" "}
                        <span>{line.quantity}</span>{" "}
                        <button
                          type="button"
                          aria-label={`Increase ${line.product.name} quantity`}
                          disabled={line.quantity >= line.availableQuantity}
                          onClick={() => void setQuantity(line.key, line.quantity + 1).catch(() => {})}
                        >
                          <svg width="7" height="7" viewBox="0 0 7 7" fill="none" aria-hidden="true">
                            <path d="M0 3.24597H6.50195" stroke="currentColor" />
                            <path d="M3.24609 6.50195L3.24609 3.0006e-08" stroke="currentColor" />
                          </svg>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn site-cart__itemRemove --link"
                        aria-label={`Remove ${line.product.name}`}
                        onClick={() => void removeItem(line.key).catch(() => {})}
                      >
                        <span className="btn__label">Remove</span>
                      </button>
                      {lineIssue && <p className="site-cart__itemError" role="alert">{lineIssue.message}</p>}
                    </article>
                  );
                })
              )}
            </div>
          </div>
          {lines.length > 0 && (
            <footer className="site-cart__footer">
              <div className="site-cart__footerTop">
                <div className="site-cart__subtotal">
                  <span>Subtotal</span>
                  <span>{formatMoney(subtotal, currency)}</span>
                </div>
                <p className="site-cart__taxes">
                  {amountToFreeShipping > 0
                    ? `Add ${formatMoney(amountToFreeShipping)} to qualify for free shipping`
                    : "You qualify for free shipping"}
                </p>
                <p className="site-cart__taxes">(Duties and taxes are included on all international orders)</p>
              </div>
              <Link href="/checkout" className="btn site-cart__checkoutBtn" onClick={closeCart}>
                <span className="btn__bg" aria-hidden="true" />
                <span className="btn__label">Checkout</span>
              </Link>
            </footer>
          )}

          {recommendations.length > 0 && (
            <div className="site-cart__recommendations">
              <span className="site-cart__recommendationsTitle">You may also like</span>
              <div className="site-cart__recommendationsSlider">
                <div className="site-cart__recommendationsTrack">
                  {recommendations.map((product) => (
                    <article className="site-cart__recommendation" key={product.id}>
                      <Link
                        href={`/products/${product.id}`}
                        className="site-cart__recommendationLink"
                        onClick={closeCart}
                      >
                        <span className="site-cart__recommendationImgBox">
                          <ProductVisual product={product} />
                        </span>
                        <span className="site-cart__recommendationTitle">{product.name}</span>
                      </Link>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      <button
        aria-label="Close overlay"
        className={`page-scrim ${menuOpen || searchOpen ? "is-visible" : ""}`}
        onClick={closeAllOverlays}
      />
    </>
  );
}
