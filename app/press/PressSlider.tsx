"use client";

import { useRef } from "react";

type PressItem = {
  image: string;
  title: string;
  text: string;
  href: string;
};

const pressItems: PressItem[] = [
  {
    image: "Nuvo_Press_64622c42-d160-4248-adea-fdb469d76698.jpg",
    title: "NUVO Magazine",
    text: "Issue 105",
    href: "https://nuvomagazine.com/magazine/issue-105-summer-2025/montreals-balmoral-is-a-canadian-made-running-brand-thats-just-hitting-its-stride?srsltid=AfmBOorRv8I6wFBB5PPWDm3fZWC8Rp5zIEgJsJI1RHykE_N8qJd4oVOt",
  },
  {
    image: "GQ_Press_0ad4a56a-d636-410e-a43f-84d98be21193.jpg",
    title: "GQ",
    text: "Online article",
    href: "https://www.gq.com/story/best-running-brands#:~:text=Here%2C%20we%20rounded%20up%20some,out%20the%20GQ%20Gym%20Shop.",
  },
  {
    image: "Hypebeast_Press.jpg",
    title: "HYPEBEAST",
    text: "Online article",
    href: "https://hypebeast.com/2024/1/best-winter-running-gear-2024",
  },
  {
    image: "Runlovers_Press.jpg",
    title: "Run Lovers",
    text: "Online article",
    href: "https://runlovers.it/en/2023/the-best-brands-of-running-apparel/",
  },
];

export function PressSlider() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(direction: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.9;
    el.scrollBy({ left: direction * amount, behavior: "smooth" });
  }

  return (
    <div
      id="pb-row-press-press"
      className="pb-row pb-row-press container-fluid d-flex flex-column row-gap-10"
      data-module="pb-row-press"
    >
      <header className="pb-row-press__header d-flex align-items-center justify-content-between">
        <h1 className="pb-row-press__title ff-heading fz-20 fz-md-32 fz-xl-40 fw-400 lh-normal m-0">Press</h1>
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
          {pressItems.map((item) => (
            <div key={item.image} className="shopify-block pb-row-press__article swiper-slide">
              <a
                className="pb-row-press__articleWrap d-flex flex-column row-gap-10 td-none"
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <figure className="pb-row-press__articleImgBox box box-portrait position-relative overflow-clip">
                  <img
                    src={`/press/${item.image}`}
                    alt={item.title}
                    width={1080}
                    height={1350}
                    loading="lazy"
                    className="pb-row-press__articleImg image-as-background"
                  />
                </figure>
                <div>
                  <h3 className="pb-row-press__articleTitle fz-12 lh-24 fw-400 tt-uppercase m-0">{item.title}</h3>
                  <p className="pb-row-press__articleText ff-heading fw-400 fz-16 lh-24 m-0 mt-5">{item.text}</p>
                </div>
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
