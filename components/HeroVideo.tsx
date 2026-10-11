"use client";

import { useEffect, useState } from "react";

/**
 * ALTURA brand hero film — fully original, procedurally rendered
 * (see scripts/render-altura-hero.mjs). Replaces the generic stock
 * clip previously referenced here.
 */
export function HeroVideo() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <video
      className="home-hero-video"
      autoPlay={!reduceMotion}
      muted
      loop
      playsInline
      preload="metadata"
     
      aria-hidden="true"
    >
      <source src="/video/altura-hero.mp4" type="video/mp4" />
    </video>
  );
}
