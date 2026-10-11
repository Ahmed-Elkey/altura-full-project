import { readFileSync, writeFileSync } from "node:fs";

const FILE = "app/globals.css";
let css = readFileSync(FILE, "utf8");
const EOL = css.includes("\r\n") ? "\r\n" : "\n";
const n = (s) => s.split("\n").join(EOL);

// ---- 1. Replace the main homepage block (section 6) -----------------------
const homeMarker = css.indexOf("   6. HOMEPAGE");
if (homeMarker === -1) throw new Error("homepage marker not found");
const blockStart = css.lastIndexOf("/*", homeMarker);
const colMarker = css.indexOf("   7. COLLECTIONS");
if (colMarker === -1) throw new Error("collections marker not found");
const blockEnd = css.lastIndexOf("/*", colMarker);

const newBlock = n(`/* ==========================================================================
   6. HOMEPAGE — Balmoral-style section stack
   ========================================================================== */

.home-page {
  width: 100%;
  background: var(--altura-offwhite);
}

/* Full-viewport video hero — wordmark centered, season text bottom-left */
.home-hero {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100svh;
  min-height: 700px;
  max-height: 1080px;
  background: #0a0a0a;
  overflow: hidden;
  margin-top: calc(var(--site-header-spacer-height) * -1);
  display: grid;
}

.home-hero-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.home-hero-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  filter: brightness(0.88) contrast(1.05);
}

.home-hero-image--fallback {
  object-fit: cover;
  object-position: center center;
}

.home-hero-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.08) 38%, rgba(0,0,0,0.45) 100%);
  pointer-events: none;
  z-index: 1;
}

.home-hero-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  pointer-events: none;
  width: 100%;
  text-align: center;
  padding: 0 var(--container-fluid-margin);
}

.home-hero-brand {
  font-family: var(--font-editorial, var(--font-editorial-fallback));
  font-size: clamp(56px, 14vw, 180px);
  font-weight: 400;
  line-height: 0.9;
  letter-spacing: 0.06em;
  color: var(--altura-white);
  margin: 0;
  text-transform: uppercase;
  opacity: 0.98;
}

/* Season block — bottom-left: title, copy, link (reference order) */
.home-hero-season {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 5;
  padding: 0 var(--container-fluid-margin) 44px;
}

.home-hero-season-title {
  font-family: var(--font-editorial, var(--font-editorial-fallback));
  font-size: clamp(28px, 3.4vw, 42px);
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.01em;
  color: var(--altura-white);
  margin: 0 0 14px;
}

.home-hero-season-text {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.92);
  margin: 0 0 20px;
  max-width: 640px;
}

.home-hero-season-link {
  display: inline-block;
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--altura-white);
  text-decoration: underline;
  text-underline-offset: 4px;
  transition: opacity var(--motion-fast);
}

.home-hero-season-link:hover { opacity: 0.65; }

/* Full-width editorial story — image with overlaid title, copy and link */
.home-story {
  position: relative;
  width: 100%;
  height: min(160vw, 950px);
  overflow: hidden;
  background: var(--altura-forest);
}

.home-story-image {
  object-fit: cover;
  object-position: center;
}

.home-story-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0) 42%, rgba(0,0,0,0.55) 100%);
  pointer-events: none;
}

.home-story-content {
  position: absolute;
  left: var(--container-fluid-margin);
  right: var(--container-fluid-margin);
  bottom: 48px;
  z-index: 2;
  color: var(--altura-white);
  max-width: 800px;
}

.home-story-title {
  font-family: var(--font-editorial, var(--font-editorial-fallback));
  font-size: clamp(26px, 2.6vw, 34px);
  font-weight: 400;
  line-height: 1.1;
  margin: 0 0 18px;
}

.home-story-text {
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 400;
  line-height: 1.55;
  margin: 0 0 24px;
  max-width: 720px;
}

.home-story-link {
  font-family: var(--font-sans);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--altura-white);
  text-decoration: underline;
  text-underline-offset: 4px;
  transition: opacity var(--motion-fast);
}

.home-story-link:hover { opacity: 0.65; }

/* Editorial picks grid — 2-up under story sections */
.home-editorial-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 10px var(--container-fluid-margin) 0;
}

/* Category row — heading left, Shop link right, 2-up product grid */
.home-row {
  padding: 64px var(--container-fluid-margin) 8px;
}

.home-row-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.home-row-title {
  font-family: var(--font-editorial, var(--font-editorial-fallback));
  font-size: clamp(22px, 2vw, 28px);
  font-weight: 400;
  line-height: 1.1;
  margin: 0;
}

.home-row-link {
  font-family: var(--font-sans);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 4px;
  transition: opacity var(--motion-fast);
}

.home-row-link:hover { opacity: 0.65; }

.home-row-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

/* About — full-width image with top-left copy */
.home-about {
  position: relative;
  width: 100%;
  height: min(150vw, 880px);
  overflow: hidden;
  margin-top: 72px;
  background: var(--altura-forest);
}

.home-about-image {
  object-fit: cover;
  object-position: center;
}

.home-about-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.12) 40%, rgba(0,0,0,0) 70%);
  pointer-events: none;
}

.home-about-content {
  position: absolute;
  top: 40px;
  left: var(--container-fluid-margin);
  right: var(--container-fluid-margin);
  z-index: 2;
  color: var(--altura-white);
  max-width: 620px;
}

.home-about-title {
  font-family: var(--font-editorial, var(--font-editorial-fallback));
  font-size: clamp(26px, 2.6vw, 32px);
  font-weight: 400;
  margin: 0 0 16px;
}

.home-about-text {
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
  margin: 0 0 22px;
}

.home-about-link {
  font-family: var(--font-sans);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--altura-white);
  text-decoration: underline;
  text-underline-offset: 4px;
  transition: opacity var(--motion-fast);
}

.home-about-link:hover { opacity: 0.65; }

/* Info tiles above the footer */
.home-info-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 56px var(--container-fluid-margin) 72px;
}

.home-info-tile {
  border-top: 1px solid var(--line);
  padding-top: 16px;
  transition: opacity var(--motion-fast);
}

.home-info-tile:hover { opacity: 0.65; }

.home-info-tile h3 {
  font-family: var(--font-editorial, var(--font-editorial-fallback));
  font-size: 17px;
  font-weight: 400;
  line-height: 1.2;
  margin: 0 0 8px;
  color: inherit;
}

.home-info-tile p {
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  color: var(--altura-gray, #6b6b66);
}

`);

css = css.slice(0, blockStart) + newBlock + css.slice(blockEnd);

// ---- 2. Replace stale fragments inside media queries ----------------------
const fragAOld = n(`  .home-manifesto-grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }

  .home-curated-grid {
    grid-template-columns: 1fr;
  }

  .home-material-feature {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }`);
const fragANew = n(`  .home-info-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 28px;
  }`);
if (!css.includes(fragAOld)) throw new Error("fragment A not found");
css = css.replace(fragAOld, fragANew);

const fragBOld = n(`  .home-hero-container {
    padding: 90px var(--page-gutter-mobile) 36px;
  }

  .home-hero-marker {
    display: none;
  }

  .home-manifesto {
    padding: 56px var(--page-gutter-mobile);
  }

  .home-manifesto-specs {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .home-curated-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .home-curated-card {
    padding: 20px 14px;
  }

  .home-fleet {
    padding: 56px var(--page-gutter-mobile);
  }

  .home-fleet-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .home-fleet-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }`);
const fragBNew = n(`  .home-hero-season {
    padding-bottom: 32px;
  }

  .home-hero-season-text {
    font-size: 13px;
  }

  .home-story {
    height: 145vw;
    min-height: 520px;
  }

  .home-story-content {
    bottom: 28px;
  }

  .home-story-text {
    font-size: 14px;
  }

  .home-editorial-grid {
    gap: 8px;
    padding: 8px var(--page-gutter-mobile) 0;
  }

  .home-row {
    padding: 48px var(--page-gutter-mobile) 4px;
  }

  .home-row-grid {
    gap: 8px;
  }

  .home-about {
    height: 150vw;
    min-height: 460px;
    margin-top: 48px;
  }

  .home-about-content {
    top: 24px;
  }

  .home-info-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 24px;
    padding: 40px var(--page-gutter-mobile) 48px;
  }`);
if (!css.includes(fragBOld)) throw new Error("fragment B not found");
css = css.replace(fragBOld, fragBNew);

writeFileSync(FILE, css);
console.log("done: block", blockStart, "->", blockEnd, "| frags replaced | new length", css.length);
