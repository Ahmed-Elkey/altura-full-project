"use client";

import { useRef } from "react";

const lookbookImages = [
  "083026_BALMORAL-LOOKBOOK1387_1.jpg",
  "083026_BALMORAL-LOOKBOOK1675_1.jpg",
  "083026_BALMORAL-LOOKBOOK1361_1.jpg",
  "083026_BALMORAL-LOOKBOOK1424_1.jpg",
  "083026_BALMORAL-LOOKBOOK1630_1.jpg",
  "083026_BALMORAL-LOOKBOOK1492_1.jpg",
  "083026_BALMORAL-LOOKBOOK1357_1.jpg",
  "083026_BALMORAL-LOOKBOOK1448_1.jpg",
  "083026_BALMORAL-LOOKBOOK1427_1.jpg",
  "083026_BALMORAL-LOOKBOOK1406_1.jpg",
  "083026_BALMORAL-LOOKBOOK1593_1.jpg",
  "083026_BALMORAL-LOOKBOOK1373_1.jpg",
  "083026_BALMORAL-LOOKBOOK1473_1.jpg",
  "083026_BALMORAL-LOOKBOOK1616_1.jpg",
  "083026_BALMORAL-LOOKBOOK1414_1.jpg",
  "083026_BALMORAL-LOOKBOOK1538_1.jpg",
  "083026_BALMORAL-LOOKBOOK1519_1.jpg",
  "083026_BALMORAL-LOOKBOOK1563_1.jpg",
  "083026_BALMORAL-LOOKBOOK1712_1.jpg",
];

export function LookbookSlider() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(direction: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    // scroll by ~ 90% of visible width (≈ one slide on desktop, ~1 slide on mobile)
    const amount = el.clientWidth * 0.9;
    el.scrollBy({ left: direction * amount, behavior: "smooth" });
  }

  return (
    <div
      id="pb-row-press-lookbook"
      className="pb-row pb-row-press container-fluid d-flex flex-column row-gap-10"
      data-module="pb-row-press"
    >
      <header className="pb-row-press__header d-flex align-items-center justify-content-between">
        <h1 className="pb-row-press__title ff-heading fz-20 fz-md-32 fz-xl-40 fw-400 lh-normal m-0">Lookbook</h1>
        <div className="pb-row-press__nav d-none d-xl-flex align-items-center grid-gap-20">
          <button
            className="btn pb-row-press__prev --ui"
            aria-label="Previous"
            type="button"
            onClick={() => scrollBy(-1)}
          >
            <span className="btn__icon --icon-chevron-left d-inline-block" aria-hidden="true">
              <svg width="9" height="14" viewBox="0 0 9 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7.78739 0.393939L0.999512 6.69697L7.78739 13" stroke="currentColor" />
              </svg>
            </span>
          </button>
          <button
            className="btn pb-row-press__next --ui"
            aria-label="Next"
            type="button"
            onClick={() => scrollBy(1)}
          >
            <span className="btn__icon --icon-chevron-right d-inline-block" aria-hidden="true">
              <svg width="9" height="14" viewBox="0 0 9 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1.21261 13.6061L8.00049 7.30303L1.21261 0.999999" stroke="currentColor" />
              </svg>
            </span>
          </button>
        </div>
      </header>

      <div className="pb-row-press__slider swiper w-100">
        <div className="swiper-wrapper" ref={scrollerRef}>
          {lookbookImages.map((filename, index) => (
            <div key={filename} className="shopify-block pb-row-press__article swiper-slide">
              <div className="pb-row-press__articleWrap d-flex flex-column row-gap-10 td-none">
                <figure className="pb-row-press__articleImgBox box box-portrait position-relative overflow-clip">
                  <img
                    src={`/lookbook/${filename}`}
                    alt={`ALTURA Fall–Winter 26 lookbook look ${index + 1}`}
                    width={3000}
                    height={4000}
                    loading="lazy"
                    decoding="async"
                    className="pb-row-press__articleImg image-as-background"
                  />
                </figure>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
