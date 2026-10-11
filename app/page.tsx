import Image from "next/image";
import { HomeFilm } from "@/components/HomeFilm";
import Link from "next/link";
import { storefrontProducts } from "@/data/products";
import { formatMoney } from "@/lib/money";
import { BalmoralProductCard } from "@/components/BalmoralProductCard";
import { listProducts } from "@/lib/storefront";
import { CatalogFallbackNotice } from "@/components/CatalogFallbackNotice";
import { siteOrigin, siteOpenGraph } from "@/lib/site-origin";

export const metadata = { alternates: { canonical: `${siteOrigin}/` }, openGraph: { ...siteOpenGraph, url: siteOrigin } };

function product(id: string) {
  const item = storefrontProducts.find((entry) => entry.id === id);
  if (!item) throw new Error(`Missing homepage product: ${id}`);
  return item;
}

export default async function HomePage() {
  const backendProducts = await listProducts({ limit: 100 });
  // Keep homepage feature rows tied to products that exist in the live catalog.
  const catalogProduct = (id: string) => backendProducts.find((entry) => entry.id === id) ?? { ...product(id), catalogSource: "static-fallback" as const };
  const headwearA = catalogProduct("trail-cap");
  const raceA = catalogProduct("summit-shorts");
  const raceB = catalogProduct("half-tights");
  const teeProducts = ["meridian-tee", "northline-tee", "range-tee", "clubhouse-tee"].map(catalogProduct);
  const bottomProducts = ["trail-shorts", "winter-tights", "summit-shorts", "half-tights"].map(catalogProduct);

  return (
    <main>
      {/* 1. HERO — ALTURA seasonal film */}
      <section className="shopify-section section--pb-row-hero">
        <div className="pb-row-wrapper --has-text-color --has-bg-color" style={{ ["--text-color" as any]: "#ffffff", ["--bg-color" as any]: "#000000", ["--zindex" as any]: 0 } as React.CSSProperties}>
          <div
            id="pb-row-hero-home"
            className="pb-row pb-row-hero container-fluid position-relative d-grid row-gap-20 pb-30 pb-md-12 pb-xl-10"
          >
            {/* hero video */}
            <div className="pb-row-hero__media position-absolute t-0 l-0 w-100 h-100 pointer-events-none" style={{ background: "#000000" }}>
              <HomeFilm src="/video/altura-hero-home.mp4" label="New arrivals" variant="hero" />
            </div>

            <header className="pb-row-hero__header position-relative col-start-1 col-span-4 col-span-xl-9 row-start-md-1 align-self-end d-flex align-items-start">
              <h1 className="pb-row-hero__title ff-heading fz-20 fz-md-32 fz-xl-40 fw-400 lh-normal m-0">New Arrivals</h1>

              <div className="shopify-block block-buttons parent-shopify-block">
                <nav className="links-nav d-flex pb-row-hero__buttons --layout-horizontal --layout-mobile-horizontal --layout-tablet-horizontal">
                  <div className="shopify-block block-button">
                    <Link href="/collections/fall-26" className="btn links-nav__link --link" aria-label="Shop Fall 26">
                      <span className="btn__label" aria-hidden="true">Shop Fall 26</span>
                    </Link>
                  </div>
                </nav>
              </div>
            </header>

            <div className="pb-row-hero__content position-relative col-start-1 col-start-md-5 col-start-xl-10 col-span-4 col-span-xl-3 row-start-md-1 align-self-end d-flex flex-column grid-gap-24 pb-md-5 pb-xl-12">
              <div className="pb-row-hero__text fz-14 fz-xl-15 fw-400 lh-17 lh-md-normal wysiwyg">
                <p>
                  Built for the changing rhythm of the season. Fall–Winter 26 introduces a considered balance of warmth, texture, and movement, bringing
                  together familiar ALTURA silhouettes with new materials and layers designed to carry you through cooler days.
                </p>
              </div>

              <div className="shopify-block block-buttons parent-shopify-block">
                <nav className="links-nav d-flex pb-row-hero__buttons --layout-horizontal --layout-mobile-horizontal --layout-tablet-horizontal">
                  <div className="shopify-block block-button">
                    <Link href="/collections/fall-26" className="btn links-nav__link --link" aria-label="Shop Fall 26">
                      <span className="btn__label" aria-hidden="true">Shop Fall 26</span>
                    </Link>
                  </div>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CatalogFallbackNotice visible={[headwearA, raceA, raceB, ...teeProducts, ...bottomProducts].some((item) => item.catalogSource === "static-fallback")} />
      {/* 2. HEADWEAR promo + one product with selectable colorways */}
      <section className="shopify-section section--pb-row-promo-products">
        <div className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-10 mb-0 mt-md-10 mb-md-0 mt-xl-10 mb-xl-0" style={{ ["--zindex" as any]: 0 } as React.CSSProperties}>
          <div
            id="pb-row-promo-headwear"
            className="pb-row pb-row-promo-products container-fluid d-grid grid-column-md-2 grid-gap-10 --halign-promo_products"
          >
            <div className="pb-row-promo-products__promo col-start-1 row-start-md-1 w-100 d-grid" style={{ color: "#ffffff" }}>
              <figure className="pb-row-promo-products__promoMedia col-start-1 row-start-1 w-100 position-relative overflow-clip pointer-events-none">
                <Image
                  src="/editorial/accessories.jpg"
                  alt="ALTURA Fall 26 headwear collection"
                  width={3000}
                  height={4000}
                  className="pb-row-promo-products__promoImg image-as-background"
                  priority
                />
              </figure>
              <div className="pb-row-promo-products__promoContent col-start-1 row-start-1 align-self-end position-relative d-grid grid-column-xl-2 col-gap-10 row-gap-20 row-gap-md-15 row-gap-xl-0">
                <h2 className="pb-row-promo-products__promoTitle ff-heading col-start-1 row-start-1 fz-20 fz-md-32 fz-xl-40 fw-400 lh-normal m-0">
                  Headwear
                </h2>
                <div className="pb-row-promo-products__promoText col-start-xl-2 fz-14 row-start-2 fz-xl-15 fw-400 lh-17 lh-xl-normal wysiwyg">
                  <p>
                    Fall 26 Collection
                    <br />-<br />
                    For Fall–Winter 26, ALTURA presents a range of headwear made to meet the shift in season, insulating where it counts, refined in
                    every detail. From crisp mornings to colder nights, each piece balances warmth and structure with a quiet sense of purpose, shaped
                    equally by performance and daily wear.
                  </p>
                </div>
                <Link
                  href="/collections/headwear"
                  className="btn pb-row-promo-products__promoCTA col-start-xl-2 mt-md-5 mt-xl-25 row-start-3 --link"
                  aria-label="shop headwear"
                >
                  <span className="btn__label" aria-hidden="true">shop headwear</span>
                </Link>
              </div>
            </div>

            <div className="pb-row-promo-products__products pb-row-promo-products__products--single col-start-md-2 row-start-md-1 align-self-start d-grid grid-column-2 col-gap-10 row-gap-24 row-gap-md-10 row-gap-xl-12">
              <BalmoralProductCard product={headwearA} color="Sage" className="pb-row-promo-products__product align-self-start --variation-rollover-specs" />
            </div>
          </div>
        </div>
      </section>

      {/* 3. RACE DAY promo + 2 products */}
      <section className="shopify-section section--pb-row-promo-products">
        <div className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-10 mb-0 mt-md-10 mb-md-0 mt-xl-10 mb-xl-0" style={{ ["--zindex" as any]: 0 } as React.CSSProperties}>
          <div
            id="pb-row-promo-raceday"
            className="pb-row pb-row-promo-products container-fluid d-grid grid-column-md-2 grid-gap-10 --halign-products_promo"
          >
            <div className="pb-row-promo-products__promo col-start-1 row-start-md-1 w-100 d-grid" style={{ color: "#ffffff" }}>
              <figure className="pb-row-promo-products__promoMedia col-start-1 row-start-1 w-100 position-relative overflow-clip pointer-events-none">
                <Image
                  src="/editorial/race-day.jpg"
                  alt="ALTURA Race Day performance collection"
                  width={4383}
                  height={5844}
                  className="pb-row-promo-products__promoImg image-as-background"
                />
              </figure>
              <div className="pb-row-promo-products__promoContent col-start-1 row-start-1 align-self-end position-relative d-grid grid-column-xl-2 col-gap-10 row-gap-20 row-gap-md-15 row-gap-xl-0">
                <h2 className="pb-row-promo-products__promoTitle ff-heading col-start-1 row-start-1 fz-20 fz-md-32 fz-xl-40 fw-400 lh-normal m-0">Race Day</h2>
                <div className="pb-row-promo-products__promoText col-start-xl-2 fz-14 row-start-2 fz-xl-15 fw-400 lh-17 lh-xl-normal wysiwyg">
                  <p>
                    The Race Day collection brings together performance-driven essentials designed for the moments that count. Featuring the Summit
                    collection and Ridgeline Half Tights, each piece is lightweight, streamlined, and refined for unrestricted movement from the
                    starting line to the finish.
                  </p>
                </div>
                <Link
                  href="/collections/performance"
                  className="btn pb-row-promo-products__promoCTA col-start-xl-2 mt-md-5 mt-xl-25 row-start-3 --link"
                  aria-label="Discover"
                >
                  <span className="btn__label" aria-hidden="true">Discover</span>
                </Link>
              </div>
            </div>

            <div className="pb-row-promo-products__products col-start-md-2 row-start-md-1 align-self-start d-grid grid-column-2 col-gap-10 row-gap-24 row-gap-md-10 row-gap-xl-12">
              <BalmoralProductCard product={raceA} className="pb-row-promo-products__product align-self-start --variation-rollover-specs" />
              <BalmoralProductCard product={raceB} className="pb-row-promo-products__product align-self-start --variation-rollover-specs" />
            </div>
          </div>
        </div>
      </section>

      {/* 4. Cotton T-shirts — 4 products */}
      <section className="shopify-section section--pb-row-featured-products">
        <div className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-30 mb-0 mt-md-70 mb-md-0 mt-xl-70 mb-xl-0" style={{ ["--zindex" as any]: 0 } as React.CSSProperties}>
          <div id="pb-row-featured-tees" className="pb-row pb-row-featured-products container-fluid d-flex flex-column grid-gap-5">
            <header className="pb-row-featured-products__header d-flex justify-content-between grid-gap-10">
              <h2 className="pb-row-featured-products__title ff-heading fz-16 fz-xl-18 fw-400 lh-normal m-0">Cotton T-shirts</h2>
              <Link href="/collections/t-shirts" className="btn pb-row-featured-products__cta ml-auto --link" aria-label="Shop">
                <span className="btn__label" aria-hidden="true">Shop</span>
              </Link>
            </header>
            <ul className="pb-row-featured-products__list d-grid grid-column-2 grid-column-md-4 col-gap-10 row-gap-20 list-none m-0 p-0">
              {teeProducts.map((p) => (
                <li key={p.id}>
                  <BalmoralProductCard product={p} className="pb-row-featured-products__product align-self-start --variation-rollover-specs" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 5. Bottoms — 4 products */}
      <section className="shopify-section section--pb-row-featured-products">
        <div className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-30 mb-0 mt-md-30 mb-md-0 mt-xl-10 mb-xl-0" style={{ ["--zindex" as any]: 0 } as React.CSSProperties}>
          <div id="pb-row-featured-bottoms" className="pb-row pb-row-featured-products container-fluid d-flex flex-column grid-gap-5">
            <header className="pb-row-featured-products__header d-flex justify-content-between grid-gap-10">
              <h2 className="pb-row-featured-products__title ff-heading fz-16 fz-xl-18 fw-400 lh-normal m-0">Bottoms</h2>
              <Link href="/collections/bottoms" className="btn pb-row-featured-products__cta ml-auto --link" aria-label="Shop">
                <span className="btn__label" aria-hidden="true">Shop</span>
              </Link>
            </header>
            <ul className="pb-row-featured-products__list d-grid grid-column-2 grid-column-md-4 col-gap-10 row-gap-20 list-none m-0 p-0">
              {bottomProducts.map((p) => (
                <li key={`${p.id}-bottom`}>
                  <BalmoralProductCard product={p} className="pb-row-featured-products__product align-self-start --variation-rollover-specs" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 6. About Us — text-media with left image + right black */}
      <section className="shopify-section section--pb-row-text-media">
        <div className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-30 mb-0 mt-md-30 mb-md-0 mt-xl-30 mb-xl-0 --has-text-color" style={{ ["--text-color" as any]: "#ffffff", ["--zindex" as any]: 0 } as React.CSSProperties}>
          <div id="pb-row-text-media-about" className="pb-row pb-row-text-media container-fluid d-grid grid-column-md-8 grid-column-xl-12">
            <header className="pb-row-text-media__header col-start-1 col-span-md-8 col-span-xl-12 row-start-1 align-self-start position-relative z-2 d-grid align-items-start row-gap-15 row-gap-md-10 pt-30 pt-md-20 pt-xl-30 pb-30 pb-md-20 pb-xl-30">
              <h2 className="pb-row-text-media__title col-start-md-1 col-span-md-4 row-start-md-1 ff-heading fz-16 fz-xl-18 fw-400 lh-normal m-0">About Us</h2>
              <div className="pb-row-text-media__text col-start-md-1 col-start-xl-4 col-span-md-4 col-span-xl-3 row-start-xl-1 fz-14 fz-xl-15 fw-400 lh-normal mr-10 mr-md-20 mr-xl-30 wysiwyg">
                <p>ALTURA is built around movement, restraint and changing weather — performance apparel with a quieter point of view.</p>
              </div>
              <Link
                href="/info/about"
                className="btn pb-row-text-media__cta col-start-md-5 col-start-xl-7 col-span-md-4 col-span-xl-6 row-start-md-1 align-self-md-start justify-self-md-end mt-5 mt-md-0 --link"
                aria-label="DISCOVER"
              >
                <span className="btn__label" aria-hidden="true">DISCOVER</span>
              </Link>
            </header>
            <figure className="pb-row-text-media__leftMedia col-start-1 col-span-md-4 col-span-xl-6 row-start-1 w-100 position-relative z-1 overflow-clip pointer-events-none">
              <Image
                src="/editorial/story.jpg"
                alt="ALTURA brand story editorial"
                width={2250}
                height={3000}
                className="pb-row-text-media__leftImg image-as-background"
              />
            </figure>
            <figure className="pb-row-text-media__rightMedia col-start-1 col-start-md-5 col-start-xl-7 col-span-md-4 col-span-xl-6 row-start-2 row-start-md-1 w-100 position-relative z-1 overflow-clip pointer-events-none" style={{ background: "#000000" }}>
              <HomeFilm src="/video/altura-about.mp4" label="About ALTURA" variant="about" />
            </figure>
          </div>
        </div>
      </section>

      {/* 7. Text columns — 4 tiles with images */}
      <section className="shopify-section section--pb-row-text-columns">
        <div className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-30 mb-20 mt-md-50 mb-md-40 mt-xl-40 mb-xl-70" style={{ ["--zindex" as any]: 0 } as React.CSSProperties}>
          <div id="pb-row-text-columns-info" className="pb-row pb-row-text-columns container-fluid swiper" data-module="pb-row-text-columns">
            <div className="swiper-wrapper">
              <div className="shopify-block block-text-column">
                <Link href="/info/shipping" className="text-column d-flex flex-column td-none">
                  <h2 className="text-column__title fz-16 ff-heading fz-xl-18 fw-400 lh-normal m-0">Shipping & returns</h2>
                  <figure className="text-column__media w-100 position-relative overflow-clip mb-10 mb-5 mb-xl-0">
                    <Image
                      src="/balmoral-text-columns/shipping.jpg"
                      alt="ALTURA shipping and returns information"
                      width={1200}
                      height={1500}
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      loading="lazy"
                      className="text-column__img image-as-background"
                    />
                  </figure>
                  <div className="text-column__text fz-12 fz-md-13 fz-xl-14 fw-400 lh-15 lh-md-normal mr-15 wysiwyg">
                    <p>Review our shipping and returns information</p>
                  </div>
                </Link>
              </div>
              <div className="shopify-block block-text-column">
                <Link href="/info/contact" className="text-column d-flex flex-column td-none">
                  <h2 className="text-column__title fz-16 ff-heading fz-xl-18 fw-400 lh-normal m-0">Contact</h2>
                  <figure className="text-column__media w-100 position-relative overflow-clip mb-10 mb-5 mb-xl-0">
                    <Image
                      src="/balmoral-text-columns/contact.jpg"
                      alt="Contact the ALTURA team"
                      width={1200}
                      height={1500}
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      loading="lazy"
                      className="text-column__img image-as-background"
                    />
                  </figure>
                  <div className="text-column__text fz-12 fz-md-13 fz-xl-14 fw-400 lh-15 lh-md-normal mr-15 wysiwyg">
                    <p>Email our team for all inquiries</p>
                  </div>
                </Link>
              </div>
              <div className="shopify-block block-text-column">
                <Link href="/info/lookbook" className="text-column d-flex flex-column td-none">
                  <h2 className="text-column__title fz-16 ff-heading fz-xl-18 fw-400 lh-normal m-0">Lookbook</h2>
                  <figure className="text-column__media w-100 position-relative overflow-clip mb-10 mb-5 mb-xl-0">
                    <Image
                      src="/balmoral-text-columns/lookbook.jpg"
                      alt="ALTURA Fall–Winter 26 lookbook"
                      width={1200}
                      height={1600}
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      loading="lazy"
                      className="text-column__img image-as-background"
                    />
                  </figure>
                  <div className="text-column__text fz-12 fz-md-13 fz-xl-14 fw-400 lh-15 lh-md-normal mr-15 wysiwyg">
                    <p>Explore the Fall–Winter 26 Lookbook</p>
                  </div>
                </Link>
              </div>
              <div className="shopify-block block-text-column">
                <Link href="/info/press" className="text-column d-flex flex-column td-none">
                  <h2 className="text-column__title fz-16 ff-heading fz-xl-18 fw-400 lh-normal m-0">Press</h2>
                  <figure className="text-column__media w-100 position-relative overflow-clip mb-10 mb-5 mb-xl-0">
                    <Image
                      src="/balmoral-text-columns/press.jpg"
                      alt="ALTURA press features and mentions"
                      width={1200}
                      height={1600}
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      loading="lazy"
                      className="text-column__img image-as-background"
                    />
                  </figure>
                  <div className="text-column__text fz-12 fz-md-13 fz-xl-14 fw-400 lh-15 lh-md-normal mr-15 wysiwyg">
                    <p>Discover our selected features and mentions</p>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
