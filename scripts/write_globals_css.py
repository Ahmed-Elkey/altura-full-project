import os

css = """@import "tailwindcss";

/* ==========================================================================
   1. FOUNDATIONS & DESIGN TOKENS
   Alpine Editorial Running Design System (Consolidated from Stitch DESIGN.md)
   ========================================================================== */

:root {
  /* Typography System */
  --font-editorial: var(--font-editorial, "EB Garamond", Georgia, serif);
  --font-sans: var(--font-sans, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif);
  --font-mono: "JetBrains Mono", Consolas, Menlo, Monaco, monospace;

  /* Color Palette */
  --altura-forest: #1F2A24;
  --altura-forest-deep: #141D18;
  --altura-stone: #E8E3D9;
  --altura-sage: #8A907F;
  --altura-black: #111111;
  --altura-offwhite: #FBF9F3;
  --altura-offwhite-alt: #F7F5EF;
  --altura-white: #FFFFFF;

  /* Typographic Ink & Tonal Colors */
  --text-primary: #111111;
  --text-secondary: rgba(17, 17, 17, 0.58);
  --text-muted: #686B67;
  --text-inverse: #FBF9F3;
  --text-inverse-muted: rgba(232, 227, 217, 0.82);

  /* Hairlines & Grid Rules */
  --line: rgba(17, 17, 17, 0.12);
  --line-subtle: rgba(17, 17, 17, 0.08);
  --line-light: rgba(255, 255, 255, 0.18);
  --line-light-subtle: rgba(255, 255, 255, 0.08);

  /* Spacing & Proportions */
  --page-gutter: 2.5rem;
  --page-gutter-mobile: 1.25rem;
  --header-height: 64px;
  --header-height-mobile: 52px;
  --announcement-height: 32px;
  --announcement-height-mobile: 28px;
  --max-content-width: 1440px;
  --product-frame-ratio: 0.8;
  --drawer-width: 440px;

  /* Animation Timings (180ms - 320ms) */
  --motion-fast: 180ms ease;
  --motion-standard: 240ms cubic-bezier(0.16, 1, 0.3, 1);
  --motion-slow: 320ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* ==========================================================================
   2. BASE RESETS & GLOBAL SHAPES
   ========================================================================== */

* {
  box-sizing: border-box;
}

html {
  background-color: var(--altura-offwhite);
  color: var(--text-primary);
  font-family: var(--font-sans);
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--altura-offwhite);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.55;
  letter-spacing: -0.005em;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11", "liga", "kern";
  overflow-x: hidden;
}

::selection {
  background-color: var(--altura-forest);
  color: var(--altura-offwhite);
}

button,
input,
select,
textarea {
  font-family: inherit;
  color: inherit;
  border-radius: 0;
}

button {
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

a {
  color: inherit;
  text-decoration: none;
}

img {
  max-width: 100%;
  height: auto;
  display: block;
}

:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 3px;
}

/* Tabular numbers for prices and metrics */
.tnum,
.font-tabular {
  font-variant-numeric: tabular-nums;
}

.skip-link {
  position: fixed;
  left: 16px;
  top: 12px;
  z-index: 500;
  padding: 8px 16px;
  background: var(--altura-black);
  color: var(--altura-offwhite);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.14em;
  transform: translateY(-160%);
  transition: transform var(--motion-fast);
}

.skip-link:focus {
  transform: translateY(0);
}

/* ==========================================================================
   3. TYPOGRAPHY SYSTEM
   ========================================================================== */

.editorial-serif,
.font-editorial {
  font-family: var(--font-editorial);
  font-weight: 400;
  letter-spacing: -0.015em;
}

.tracking-extreme {
  letter-spacing: 0.22em;
}

.tracking-widest-plus {
  letter-spacing: 0.16em;
}

/* ==========================================================================
   4. HEADER & NAVIGATION
   ========================================================================== */

.header-shell {
  width: 100%;
  position: relative;
  z-index: 45;
  transition: background-color var(--motion-standard), color var(--motion-standard);
}

.header-shell--home {
  position: absolute;
  top: 0;
  left: 0;
  color: var(--altura-white);
}

.header-shell--home .announcement-bar {
  background: var(--altura-forest);
  color: var(--text-inverse-muted);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-shell--home .site-header {
  background: transparent;
  color: var(--altura-white);
  border-bottom: 1px solid var(--line-light);
}

.header-shell--home.is-scrolled {
  position: fixed;
  top: 0;
  left: 0;
  color: var(--altura-black);
  background: rgba(251, 249, 243, 0.98);
  backdrop-filter: blur(10px);
  box-shadow: 0 1px 0 var(--line);
}

.header-shell--home.is-scrolled .announcement-bar {
  display: none;
}

.header-shell--home.is-scrolled .site-header {
  color: var(--altura-black);
  background: transparent;
  border-bottom: 0;
}

.header-shell--solid {
  position: sticky;
  top: 0;
  background: var(--altura-offwhite);
  color: var(--altura-black);
  border-bottom: 1px solid var(--line);
}

.header-shell--solid .announcement-bar {
  background: var(--altura-forest);
  color: var(--text-inverse-muted);
  border-bottom: 1px solid var(--line-light-subtle);
}

.header-shell--solid .site-header {
  background: var(--altura-offwhite);
  color: var(--altura-black);
  border-bottom: 0;
}

/* Announcement Bar */
.announcement-bar {
  height: var(--announcement-height);
  padding: 0 var(--page-gutter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-family: var(--font-mono);
}

.announcement-message {
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.announcement-dispatch {
  transition: opacity var(--motion-fast);
}

.announcement-dispatch:hover {
  opacity: 0.75;
}

.announcement-divider {
  opacity: 0.3;
}

/* Site Header Nav */
.site-header {
  height: var(--header-height);
  padding: 0 var(--page-gutter);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
}

.header-left-nav {
  justify-self: start;
  display: flex;
  align-items: center;
  gap: 28px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 500;
}

.header-actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 24px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 500;
}

.header-action {
  position: relative;
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 500;
  padding: 4px 0;
  transition: opacity var(--motion-fast);
}

.header-action::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0%;
  height: 1px;
  background-color: currentColor;
  transition: width var(--motion-standard);
}

.header-action:hover::after {
  width: 100%;
}

.header-action--mobile-menu {
  display: none;
}

.cart-count {
  margin-left: 2px;
  font-family: var(--font-mono);
  font-size: 10px;
  opacity: 0.85;
}

/* Wordmark & Logo */
.wordmark {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: inherit;
  gap: 4px;
}

.wordmark-mark {
  width: 24px;
  height: auto;
  fill: currentColor;
  transition: transform var(--motion-standard);
}

.wordmark:hover .wordmark-mark {
  transform: translateY(-1px);
}

.wordmark span {
  font-size: 13px;
  letter-spacing: 0.32em;
  padding-left: 0.32em;
  font-weight: 500;
  text-transform: uppercase;
}

/* ==========================================================================
   5. OVERLAYS (MENU / SEARCH / CART)
   ========================================================================== */

.page-scrim {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(17, 17, 17, 0.35);
  backdrop-filter: blur(2px);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-standard);
}

.page-scrim.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.screen-panel {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--altura-offwhite);
  color: var(--altura-black);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-8px);
  transition: opacity var(--motion-standard), visibility var(--motion-standard), transform var(--motion-standard);
}

.screen-panel.is-open {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.panel-header {
  height: var(--header-height);
  padding: 0 var(--page-gutter);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  border-bottom: 1px solid var(--line);
}

.panel-spacer {
  min-width: 40px;
}

/* Site Menu Dialog */
.menu-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  max-width: var(--max-content-width);
  margin: 0 auto;
  padding: 64px var(--page-gutter) 48px;
}

.menu-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.menu-title {
  font-family: var(--font-editorial);
  font-size: clamp(32px, 3.5vw, 48px);
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.015em;
  color: var(--altura-black);
  margin-bottom: 8px;
}

.menu-title:hover {
  color: var(--altura-sage);
}

.menu-link {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-secondary);
  transition: color var(--motion-fast);
}

.menu-link:hover {
  color: var(--altura-black);
}

/* Search Panel */
.search-shell {
  height: calc(100vh - var(--header-height));
  max-width: var(--max-content-width);
  margin: 0 auto;
  padding: 48px var(--page-gutter);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.search-shell label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--text-muted);
  margin-bottom: 16px;
  font-family: var(--font-mono);
}

.search-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  border-bottom: 1px solid var(--altura-black);
  padding-bottom: 8px;
}

.search-row input {
  font-family: var(--font-editorial);
  font-size: clamp(36px, 5vw, 72px);
  background: transparent;
  border: 0;
  outline: 0;
  padding: 0;
  color: var(--altura-black);
}

.search-row input::placeholder {
  color: rgba(17, 17, 17, 0.25);
}

.search-row span {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-muted);
  font-family: var(--font-mono);
  padding-bottom: 12px;
}

.search-results {
  margin-top: 36px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  overflow-y: auto;
}

.search-result {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--line);
  background: var(--altura-white);
  transition: border-color var(--motion-fast);
}

.search-result:hover {
  border-color: var(--altura-black);
}

.search-result-art {
  width: 72px;
  aspect-ratio: 0.8;
  position: relative;
  overflow: hidden;
  background: #F0ECE3;
}

.search-result strong {
  display: block;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.search-result small {
  display: block;
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.search-result span {
  font-size: 12px;
  font-family: var(--font-mono);
  white-space: nowrap;
}

.search-no-results {
  margin-top: 36px;
  font-size: 14px;
  color: var(--text-muted);
}

/* Cart Drawer */
.cart-drawer {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 110;
  width: min(var(--drawer-width), 100vw);
  height: 100dvh;
  background: var(--altura-offwhite);
  color: var(--altura-black);
  padding: 0 24px;
  transform: translateX(101%);
  transition: transform var(--motion-slow);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.08);
}

.cart-drawer.is-open {
  transform: translateX(0);
}

.cart-head {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 500;
}

.cart-head button {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10px;
  color: var(--text-muted);
  transition: color var(--motion-fast);
}

.cart-head button:hover {
  color: var(--altura-black);
}

.cart-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 0;
}

.cart-empty p {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0;
}

.cart-empty button {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.cart-filled {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cart-lines {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

.cart-line {
  display: grid;
  grid-template-columns: 78px 1fr;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}

.cart-thumb {
  width: 78px;
  aspect-ratio: 0.8;
  position: relative;
  overflow: hidden;
  background: #F0ECE3;
  border: 1px solid var(--line);
}

.cart-line-copy {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.cart-line-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.cart-line-top a {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.cart-line-top a:hover {
  text-decoration: underline;
}

.cart-line-top span {
  font-size: 12px;
  font-family: var(--font-mono);
  white-space: nowrap;
}

.cart-line-copy p {
  font-size: 10px;
  color: var(--text-muted);
  margin: 4px 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.cart-line-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.quantity-control {
  height: 28px;
  display: grid;
  grid-template-columns: 28px 32px 28px;
  align-items: center;
  text-align: center;
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 11px;
}

.quantity-control button {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--motion-fast);
}

.quantity-control button:hover {
  background: var(--altura-stone);
}

.remove-line {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  text-decoration: underline;
  text-underline-offset: 3px;
  color: var(--text-muted);
  transition: color var(--motion-fast);
}

.remove-line:hover {
  color: var(--altura-black);
}

.cart-suggestions {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.cart-suggestions p {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--text-muted);
  margin: 0 0 12px;
  font-family: var(--font-mono);
}

.cart-suggestion-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.cart-suggestion-grid a {
  display: block;
  padding: 8px;
  border: 1px solid var(--line);
  background: var(--altura-white);
  transition: border-color var(--motion-fast);
}

.cart-suggestion-grid a:hover {
  border-color: var(--altura-black);
}

.cart-suggestion-art {
  aspect-ratio: 0.8;
  position: relative;
  overflow: hidden;
  margin-bottom: 6px;
  background: #F0ECE3;
}

.cart-suggestion-grid span {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cart-footer {
  padding: 20px 0 24px;
  border-top: 1px solid var(--line);
}

.cart-shipping-progress {
  margin-bottom: 16px;
}

.cart-shipping-copy {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-muted);
  margin-bottom: 6px;
  font-family: var(--font-mono);
}

.cart-shipping-track {
  width: 100%;
  height: 2px;
  background: var(--altura-stone);
  position: relative;
  overflow: hidden;
}

.cart-shipping-track span {
  display: block;
  height: 100%;
  background: var(--altura-forest);
  transition: width var(--motion-standard);
}

.cart-subtotal {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 500;
}

.cart-subtotal span:last-child {
  font-family: var(--font-mono);
  font-size: 14px;
}

.cart-footer p {
  font-size: 10px;
  color: var(--text-muted);
  margin: 6px 0 16px;
}

.checkout-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 48px;
  background: var(--altura-black);
  color: var(--altura-offwhite);
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.18em;
  font-weight: 500;
  transition: background var(--motion-fast);
}

.checkout-button:hover {
  background: var(--altura-forest);
}

/* ==========================================================================
   6. HOMEPAGE
   ========================================================================== */

.home-page {
  width: 100%;
  background: var(--altura-offwhite);
}

/* Hero Section */
.home-hero {
  position: relative;
  width: 100%;
  height: 95vh;
  min-height: 700px;
  max-height: 1080px;
  background: #15130E;
  overflow: hidden;
}

.home-hero-image {
  object-fit: cover;
  object-position: center;
  filter: brightness(0.92) contrast(1.03);
}

.home-hero-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.75) 100%);
  pointer-events: none;
}

.home-hero-container {
  position: relative;
  z-index: 10;
  width: 100%;
  height: 100%;
  max-width: var(--max-content-width);
  margin: 0 auto;
  padding: 120px var(--page-gutter) 56px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
}

.home-hero-lockup {
  max-width: 480px;
  color: var(--altura-white);
}

.home-hero-kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--text-inverse-muted);
  margin-bottom: 12px;
}

.home-hero-title {
  font-family: var(--font-editorial);
  font-size: clamp(56px, 7vw, 92px);
  font-weight: 400;
  line-height: 0.95;
  letter-spacing: -0.02em;
  color: var(--altura-offwhite);
  margin: 0 0 20px;
}

.home-hero-deck {
  font-size: 13px;
  font-weight: 400;
  line-height: 1.6;
  color: var(--text-inverse-muted);
  max-width: 340px;
  margin: 0 0 32px;
}

.home-cta-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 28px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(2px);
  color: var(--altura-white);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  font-weight: 500;
  transition: all var(--motion-fast);
}

.home-cta-button:hover {
  background: var(--altura-white);
  color: var(--altura-black);
  border-color: var(--altura-white);
}

.home-hero-marker {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
  color: var(--text-inverse-muted);
}

.home-hero-location {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  margin-bottom: 4px;
}

.home-hero-tagline {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  opacity: 0.75;
}

/* 01 / Foundation Editorial Manifesto */
.home-manifesto {
  width: 100%;
  border-bottom: 1px solid var(--line);
  background: var(--altura-offwhite);
  padding: 96px var(--page-gutter);
}

.home-manifesto-grid {
  max-width: 1360px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(260px, 4fr) minmax(0, 8fr);
  gap: 64px;
}

.home-manifesto-intro {
  display: flex;
  flex-direction: column;
}

.home-section-index {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--altura-sage);
  margin-bottom: 8px;
}

.home-manifesto-heading {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  font-weight: 500;
  color: var(--altura-black);
  margin: 0;
}

.home-manifesto-rule {
  width: 32px;
  height: 1px;
  background: rgba(17, 17, 17, 0.25);
  margin: 24px 0;
}

.home-manifesto-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
  max-width: 300px;
  margin: 0;
}

.home-manifesto-statement {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.home-manifesto-quote {
  font-family: var(--font-editorial);
  font-size: clamp(26px, 3.2vw, 40px);
  font-weight: 400;
  line-height: 1.25;
  color: var(--altura-black);
  margin: 0 0 36px;
}

.home-manifesto-specs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}

.home-spec-kicker {
  display: block;
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #8A9280;
  margin-bottom: 4px;
}

/* Asymmetric Curated Split */
.home-curated-split {
  width: 100%;
  border-bottom: 1px solid var(--line);
  background: var(--altura-offwhite);
}

.home-curated-grid {
  max-width: var(--max-content-width);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(360px, 5fr) minmax(0, 7fr);
}

.home-material-feature {
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: rgba(232, 227, 217, 0.3);
}

.home-material-header {
  padding: 40px 44px 24px;
}

.home-material-kicker {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--text-muted);
}

.home-material-title {
  font-family: var(--font-editorial);
  font-size: 26px;
  font-weight: 400;
  color: var(--altura-forest);
  margin: 4px 0 0;
}

.home-material-viewport {
  position: relative;
  width: 100%;
  height: 560px;
  overflow: hidden;
  background: #E8E3D9;
}

.home-material-image {
  object-fit: cover;
  object-position: center;
  transition: transform var(--motion-slow);
}

.home-material-feature:hover .home-material-image {
  transform: scale(1.02);
}

.home-material-badge {
  position: absolute;
  bottom: 16px;
  left: 16px;
  background: rgba(31, 42, 36, 0.9);
  backdrop-filter: blur(4px);
  color: var(--altura-white);
  padding: 6px 12px;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-family: var(--font-mono);
}

.home-material-footer {
  padding: 28px 44px;
  border-top: 1px solid var(--line);
  background: var(--altura-offwhite);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.home-material-detail-title {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--altura-black);
  margin: 0;
}

.home-material-detail-sub {
  font-size: 10px;
  color: var(--text-muted);
  margin: 2px 0 0;
}

.home-material-link {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  text-decoration: underline;
  text-underline-offset: 4px;
  transition: color var(--motion-fast);
}

.home-material-link:hover {
  color: var(--altura-sage);
}

/* 2x2 Curated Cards */
.home-curated-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  divide-x: 1px solid var(--line);
}

.home-curated-card {
  padding: 36px 32px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
  transition: background-color var(--motion-fast);
}

.home-curated-card:nth-child(2n) {
  border-right: 0;
}

.home-curated-card:hover {
  background: rgba(232, 227, 217, 0.25);
}

.home-card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--text-muted);
  margin-bottom: 20px;
}

.home-card-price {
  font-family: var(--font-sans);
  font-weight: 500;
  color: var(--altura-black);
}

.home-card-art {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  padding: 16px;
  overflow: hidden;
}

.home-card-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  mix-blend-mode: multiply;
  transition: transform var(--motion-standard);
}

.home-curated-card:hover .home-card-image {
  transform: scale(1.05);
}

.home-card-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(17, 17, 17, 0.08);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.home-card-swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(17, 17, 17, 0.2);
  flex-shrink: 0;
}

/* Expedition Landscape Section */
.home-expedition {
  position: relative;
  width: 100%;
  height: 80vh;
  min-height: 580px;
  background: #15130E;
  overflow: hidden;
}

.home-expedition-image {
  object-fit: cover;
  object-position: center;
  filter: brightness(0.92);
}

.home-expedition-shade {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
}

.home-expedition-container {
  position: relative;
  z-index: 10;
  width: 100%;
  height: 100%;
  max-width: var(--max-content-width);
  margin: 0 auto;
  padding: 56px var(--page-gutter);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.home-expedition-top {
  display: flex;
  justify-content: space-between;
  color: var(--text-inverse-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
}

.home-expedition-card {
  max-width: 440px;
  background: rgba(31, 42, 36, 0.92);
  backdrop-filter: blur(8px);
  padding: 36px 32px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--altura-white);
}

.home-expedition-kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #A8B0A5;
}

.home-expedition-title {
  font-family: var(--font-editorial);
  font-size: 30px;
  font-weight: 400;
  color: var(--altura-white);
  margin: 8px 0 12px;
}

.home-expedition-body {
  font-size: 12px;
  font-weight: 300;
  line-height: 1.6;
  color: var(--text-inverse-muted);
  margin: 0 0 24px;
}

.home-expedition-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--altura-stone);
  transition: color var(--motion-fast);
}

.home-expedition-link:hover {
  color: var(--altura-white);
}

/* Essential Equipment Fleet Strip */
.home-fleet {
  width: 100%;
  padding: 80px var(--page-gutter);
  background: var(--altura-offwhite);
  border-bottom: 1px solid var(--line);
}

.home-fleet-container {
  max-width: 1360px;
  margin: 0 auto;
}

.home-fleet-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 40px;
  gap: 20px;
}

.home-fleet-kicker {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--text-muted);
}

.home-fleet-title {
  font-family: var(--font-editorial);
  font-size: 32px;
  font-weight: 400;
  color: var(--altura-black);
  margin: 4px 0 0;
}

.home-fleet-nav {
  display: flex;
  align-items: center;
  gap: 24px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

.home-fleet-tab {
  color: var(--text-muted);
  transition: color var(--motion-fast);
}

.home-fleet-tab:hover,
.home-fleet-tab--active {
  color: var(--altura-black);
  text-decoration: underline;
  text-underline-offset: 4px;
}

.home-fleet-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

/* ==========================================================================
   7. COLLECTIONS & SHOP ALL
   ========================================================================== */

.collection-page {
  width: 100%;
  min-height: 100vh;
  background: var(--altura-offwhite);
}

.collection-heading {
  position: relative;
  width: 100%;
  height: 360px;
  overflow: hidden;
  background: #E8E3D9;
  border-bottom: 1px solid var(--line);
}

.collection-heading-image {
  object-fit: cover;
  object-position: center;
  filter: contrast(1.05) brightness(0.92);
}

.collection-heading-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, var(--altura-offwhite) 0%, transparent 60%, rgba(17, 17, 17, 0.25) 100%);
}

.collection-heading-container {
  position: absolute;
  inset: 0;
  max-width: var(--max-content-width);
  margin: 0 auto;
  padding: 0 var(--page-gutter) 40px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.collection-heading-card {
  max-width: 640px;
  background: rgba(251, 249, 243, 0.92);
  backdrop-filter: blur(8px);
  padding: 28px 36px;
  border: 1px solid var(--line);
  display: inline-block;
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--text-muted);
  margin-bottom: 12px;
  font-family: var(--font-mono);
}

.breadcrumbs a:hover {
  text-decoration: underline;
}

.breadcrumb-current {
  color: var(--altura-forest);
  font-weight: 500;
}

.collection-heading h1 {
  font-family: var(--font-editorial);
  font-size: clamp(40px, 4.5vw, 64px);
  font-weight: 400;
  line-height: 1;
  color: var(--altura-black);
  margin: 0 0 12px;
}

.collection-description {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
  margin: 0;
}

/* Toolbar & Filter Drawer */
.collection-toolbar {
  position: sticky;
  top: var(--header-height);
  z-index: 30;
  background: rgba(251, 249, 243, 0.98);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
  height: 54px;
  padding: 0 var(--page-gutter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
}

.collection-toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.collection-filter-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 500;
  transition: color var(--motion-fast);
}

.collection-filter-toggle:hover {
  color: var(--altura-forest);
}

.filter-toggle-icon {
  font-family: var(--font-mono);
  font-size: 14px;
}

.filter-active-count {
  font-size: 10px;
  color: var(--text-muted);
}

.collection-toolbar-center {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--text-muted);
  user-select: none;
}

.collection-toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.collection-sort {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
}

.collection-sort span {
  font-size: 10px;
  color: var(--text-muted);
}

.collection-sort select {
  background: transparent;
  border: 0;
  outline: 0;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 500;
  cursor: pointer;
}

.filter-panel {
  max-height: 0;
  overflow: hidden;
  background: rgba(245, 243, 237, 0.95);
  border-bottom: 0 solid var(--line);
  transition: max-height var(--motion-standard), padding var(--motion-standard), border-width var(--motion-standard);
  padding: 0 var(--page-gutter);
}

.filter-panel.is-open {
  max-height: 380px;
  padding-top: 32px;
  padding-bottom: 32px;
  border-bottom-width: 1px;
}

.filter-inner {
  max-width: var(--max-content-width);
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 32px;
  font-size: 11px;
}

.filter-column h2 {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 600;
  margin: 0 0 16px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}

.filter-column label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  color: var(--text-muted);
  transition: color var(--motion-fast);
}

.filter-column label:hover {
  color: var(--altura-black);
}

.filter-column input[type="radio"],
.filter-column input[type="checkbox"] {
  appearance: none;
  width: 12px;
  height: 12px;
  border: 1px solid var(--altura-black);
  background: transparent;
  display: inline-block;
  cursor: pointer;
}

.filter-column input[type="radio"]:checked,
.filter-column input[type="checkbox"]:checked {
  background: var(--altura-forest);
  box-shadow: inset 0 0 0 2px var(--altura-offwhite);
}

.size-filter-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.size-filter-grid label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.clear-filters {
  align-self: flex-end;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  text-decoration: underline;
  text-underline-offset: 4px;
  color: var(--text-muted);
  transition: color var(--motion-fast);
}

.clear-filters:hover {
  color: var(--altura-black);
}

/* Product Cards & Grid */
.product-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--line);
  border-bottom: 1px solid var(--line);
}

.product-card {
  background: var(--altura-offwhite);
  padding: 20px 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: background-color var(--motion-fast);
}

.product-card:hover {
  background: rgba(232, 227, 217, 0.2);
}

.product-visual {
  position: relative;
  width: 100%;
  aspect-ratio: 0.8;
  background: #F0ECE3;
  overflow: hidden;
  margin-bottom: 16px;
  display: block;
}

.product-card-visual {
  position: absolute;
  inset: 0;
  transition: opacity var(--motion-standard), transform var(--motion-slow);
}

.product-card-visual--primary {
  opacity: 1;
}

.product-card-visual--secondary {
  opacity: 0;
}

.product-visual:hover .product-card-visual--primary {
  opacity: 0;
}

.product-visual:hover .product-card-visual--secondary {
  opacity: 1;
  transform: scale(1.02);
}

.sold-out {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 3;
  background: rgba(251, 249, 243, 0.9);
  padding: 3px 8px;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-family: var(--font-mono);
  border: 1px solid var(--line);
}

.product-card-view-label {
  display: none;
}

.product-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
}

.product-meta-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.product-meta-name a {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--altura-black);
  transition: color var(--motion-fast);
}

.product-meta-name a:hover {
  color: var(--altura-forest);
}

.product-meta-name small {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.product-meta span {
  font-size: 12px;
  font-family: var(--font-mono);
  white-space: nowrap;
  color: var(--altura-black);
}

.collection-empty {
  padding: 64px var(--page-gutter);
  text-align: center;
  font-size: 14px;
  color: var(--text-muted);
}

/* ==========================================================================
   8. PRODUCT DETAIL PAGE
   ========================================================================== */

.product-page {
  width: 100%;
  background: var(--altura-offwhite);
}

.product-layout {
  max-width: var(--max-content-width);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(380px, 5fr);
  border-bottom: 1px solid var(--line);
}

.product-gallery {
  border-right: 1px solid var(--line);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  background: var(--line);
  gap: 1px;
}

.gallery-cell {
  position: relative;
  background: var(--altura-offwhite);
  aspect-ratio: 0.85;
  overflow: hidden;
}

.gallery-cell--primary {
  grid-column: span 2;
  aspect-ratio: 1;
}

.enlarge-control {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 5;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  padding: 6px 14px;
  border: 1px solid var(--line);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 500;
  transition: background var(--motion-fast);
}

.enlarge-control:hover {
  background: var(--altura-white);
}

.product-buybox {
  position: sticky;
  top: var(--header-height);
  padding: 48px var(--page-gutter);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  background: var(--altura-offwhite);
  overflow-y: auto;
  max-height: calc(100vh - var(--header-height));
}

.breadcrumbs--product {
  margin-bottom: 24px;
}

.product-buybox-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
  gap: 16px;
}

.eyebrow {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--text-muted);
  margin: 0 0 6px;
}

.product-buybox h1 {
  font-family: var(--font-editorial);
  font-size: clamp(32px, 3vw, 42px);
  font-weight: 400;
  line-height: 1.05;
  color: var(--altura-black);
  margin: 0;
}

.product-price {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 500;
  color: var(--altura-black);
  margin: 0;
  white-space: nowrap;
}

.product-description {
  font-size: 13px;
  line-height: 1.65;
  color: #444C45;
  margin: 20px 0 28px;
  max-width: 44ch;
}

.option-block {
  margin-bottom: 24px;
}

.option-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  margin-bottom: 12px;
  font-weight: 500;
}

.option-heading span:first-child {
  color: var(--text-muted);
}

.color-options {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  padding: 2px;
  border: 1px solid rgba(17, 17, 17, 0.2);
  transition: all var(--motion-fast);
}

.color-swatch.is-selected {
  outline: 1px solid var(--altura-black);
  outline-offset: 2px;
}

.size-guide-link {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  text-decoration: underline;
  text-underline-offset: 3px;
  color: var(--altura-black);
}

.size-options {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  border: 1px solid var(--line);
  divide-x: 1px solid var(--line);
}

.size-options button {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  transition: background var(--motion-fast), color var(--motion-fast);
}

.size-options button:hover {
  background: var(--altura-stone);
}

.size-options button.is-selected {
  background: var(--altura-black);
  color: var(--altura-white);
}

.add-to-cart {
  width: 100%;
  height: 50px;
  background: var(--altura-black);
  color: var(--altura-offwhite);
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.2em;
  font-weight: 500;
  margin-top: 8px;
  transition: background var(--motion-fast);
}

.add-to-cart:hover:not(:disabled) {
  background: var(--altura-forest);
}

.add-to-cart:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.product-accordions {
  margin-top: 32px;
  border-top: 1px solid var(--line);
  divide-y: 1px solid var(--line);
}

.product-accordions details {
  padding: 14px 0;
}

.product-accordions summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  list-style: none;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 600;
}

.product-accordions summary::-webkit-details-marker {
  display: none;
}

.product-accordions summary::after {
  content: "+";
  font-size: 14px;
  font-weight: 300;
}

.product-accordions details[open] summary::after {
  content: "−";
}

.product-accordions p,
.product-accordions ul {
  font-size: 12px;
  line-height: 1.6;
  color: #444C45;
  margin: 12px 0 4px;
}

.product-accordions ul {
  padding-left: 18px;
}

.back-to-collection {
  display: inline-flex;
  align-items: center;
  margin-top: 24px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-muted);
  transition: color var(--motion-fast);
}

.back-to-collection:hover {
  color: var(--altura-black);
}

.mobile-purchase-bar {
  display: none;
}

/* Modals (Lightbox & Size Guide) */
.product-modal {
  position: fixed;
  inset: 0;
  z-index: 160;
  background: var(--altura-offwhite);
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-modal-close {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 10;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 500;
  padding: 8px;
}

.lightbox-art {
  position: absolute;
  inset: 5vh 8vw;
}

.product-modal--guide {
  background: rgba(17, 17, 17, 0.45);
  backdrop-filter: blur(4px);
  padding: 24px;
}

.size-guide-card {
  position: relative;
  z-index: 2;
  width: min(640px, 100%);
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  background: var(--altura-offwhite);
  padding: 32px;
  border: 1px solid var(--line);
}

.size-guide-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 600;
}

.size-guide-head button {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.14em;
}

.size-guide-card p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 16px 0;
}

.size-guide-table {
  border: 1px solid var(--line);
  divide-y: 1px solid var(--line);
  margin-bottom: 16px;
}

.size-guide-table > div {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  divide-x: 1px solid var(--line);
  font-size: 11px;
}

.size-guide-table span {
  padding: 10px 14px;
}

.size-guide-table > div:first-child {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 600;
  background: rgba(232, 227, 217, 0.4);
}

.size-guide-fit {
  font-size: 11px;
  color: var(--text-muted);
}

.modal-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
}

/* Recommendations */
.recommendations {
  max-width: var(--max-content-width);
  margin: 0 auto;
  padding: 64px var(--page-gutter);
  border-bottom: 1px solid var(--line);
}

.recommendations-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 32px;
}

.recommendations-heading h2 {
  font-family: var(--font-editorial);
  font-size: 28px;
  font-weight: 400;
  color: var(--altura-black);
  margin: 0;
}

.recommendations-heading a {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.product-grid--recommendations {
  border: 1px solid var(--line);
}

/* ==========================================================================
   9. PRODUCT VISUAL RASTER COMPONENT
   ========================================================================== */

.product-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #F0ECE3;
}

.product-art--asset {
  background: #F0ECE3;
}

.product-asset-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  transition: transform var(--motion-slow), filter var(--motion-fast);
}

.product-visual:hover .product-asset-image {
  transform: scale(1.02);
}

.product-art-color-name {
  display: none;
}

/* ==========================================================================
   10. CHECKOUT PAGE
   ========================================================================== */

.checkout-page {
  min-height: calc(100vh - var(--header-height));
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(360px, 0.75fr);
  border-bottom: 1px solid var(--line);
  background: var(--altura-offwhite);
}

.checkout-main {
  padding: 48px max(var(--page-gutter), 5vw) 80px;
  border-right: 1px solid var(--line);
}

.checkout-steps {
  display: flex;
  align-items: center;
  gap: 24px;
  margin: 16px 0 36px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-muted);
}

.checkout-steps .is-active {
  color: var(--altura-black);
  font-weight: 600;
}

.checkout-main h1 {
  font-family: var(--font-editorial);
  font-size: clamp(36px, 4.5vw, 60px);
  font-weight: 400;
  line-height: 1.05;
  color: var(--altura-black);
  margin: 8px 0 24px;
}

.checkout-intro {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
  max-width: 540px;
  margin: 0 0 32px;
}

.checkout-form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  max-width: 640px;
  margin-bottom: 28px;
}

.checkout-form-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-muted);
}

.checkout-form-grid input,
.checkout-form-grid select {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  border: 1px solid var(--line);
  background: var(--altura-white);
  font-size: 13px;
  outline: 0;
  transition: border-color var(--motion-fast);
}

.checkout-form-grid input:focus,
.checkout-form-grid select:focus {
  border-color: var(--altura-black);
}

.checkout-span-2 {
  grid-column: span 2;
}

.checkout-note {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 12px;
}

.checkout-stage {
  max-width: 640px;
}

.checkout-review-list {
  margin: 0 0 32px;
  border-top: 1px solid var(--line);
}

.checkout-review-list > div {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}

.checkout-review-list dt {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-muted);
}

.checkout-review-list dd {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.checkout-stage-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

.checkout-secondary {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  text-decoration: underline;
  text-underline-offset: 4px;
  color: var(--text-muted);
}

.payment-preview {
  border: 1px solid var(--line);
  background: var(--altura-white);
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 28px;
}

.payment-preview span {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--altura-forest);
}

.payment-preview strong {
  font-family: var(--font-editorial);
  font-size: 24px;
  font-weight: 400;
}

.payment-preview p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.checkout-summary {
  position: sticky;
  top: var(--header-height);
  padding: 48px var(--page-gutter);
}

.checkout-summary-head {
  display: flex;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--text-muted);
}

.checkout-summary-line {
  display: grid;
  grid-template-columns: 64px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}

.checkout-summary-art {
  width: 64px;
  aspect-ratio: 0.8;
  position: relative;
  overflow: hidden;
  background: #F0ECE3;
}

.checkout-summary-line strong {
  display: block;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.checkout-summary-line small {
  display: block;
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.checkout-summary-line span {
  font-size: 12px;
  font-family: var(--font-mono);
}

.checkout-totals {
  padding-top: 20px;
}

.checkout-totals > div {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.checkout-totals .checkout-total {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: 14px;
  font-weight: 600;
}

.checkout-shipping-note {
  margin-top: 16px;
  font-size: 10px;
  color: var(--text-muted);
}

.checkout-empty-state {
  padding-top: 24px;
}

.checkout-empty-state p {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 24px;
}

/* ==========================================================================
   11. SITE FOOTER
   ========================================================================== */

.site-footer {
  width: 100%;
  background: var(--altura-forest);
  color: var(--altura-stone);
  padding: 80px var(--page-gutter) 40px;
  border-top: 1px solid var(--altura-black);
}

.site-footer-inner {
  max-width: 1360px;
  margin: 0 auto;
}

.site-footer-grid {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 2fr) minmax(0, 2fr) minmax(0, 3fr);
  gap: 48px;
  padding-bottom: 56px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.site-footer-col h4 {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: #859289;
  margin: 0 0 20px;
}

.site-footer-col ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.site-footer-col a {
  font-size: 12px;
  font-weight: 300;
  color: #D0D6CE;
  transition: color var(--motion-fast);
}

.site-footer-col a:hover {
  color: var(--altura-white);
}

.site-footer-logo-lockup {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
  color: var(--altura-stone);
}

.site-footer-tagline {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: #859289;
}

.site-footer-mission {
  font-size: 12px;
  font-weight: 300;
  line-height: 1.6;
  color: #D0D6CE;
  max-width: 340px;
  margin: 0 0 24px;
}

.newsletter-form {
  max-width: 360px;
}

.newsletter-input-group {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.35);
  padding-bottom: 6px;
}

.newsletter-input {
  flex: 1;
  background: transparent;
  border: 0;
  outline: 0;
  font-size: 12px;
  font-weight: 300;
  color: var(--altura-white);
}

.newsletter-input::placeholder {
  color: rgba(232, 227, 217, 0.5);
}

.newsletter-button {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #D0D6CE;
  padding-left: 12px;
  transition: color var(--motion-fast);
}

.newsletter-button:hover {
  color: var(--altura-white);
}

.newsletter-status {
  font-size: 10px;
  color: #A8B0A5;
  margin-top: 8px;
}

.site-footer-trace-col p {
  font-size: 12px;
  font-weight: 300;
  line-height: 1.6;
  color: #D0D6CE;
  margin: 0 0 16px;
}

.site-footer-studios {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #859289;
}

.site-footer-bottom {
  padding-top: 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: #859289;
}

.site-footer-bottom-links {
  display: flex;
  align-items: center;
  gap: 20px;
}

.site-footer-bottom-links a {
  color: #859289;
  transition: color var(--motion-fast);
}

.site-footer-bottom-links a:hover {
  color: var(--altura-stone);
}

.site-footer-divider {
  opacity: 0.3;
}

/* ==========================================================================
   12. INFO & NOT FOUND PAGES
   ========================================================================== */

.info-page {
  min-height: calc(100vh - var(--header-height));
  max-width: var(--max-content-width);
  margin: 0 auto;
  padding: 80px var(--page-gutter) 96px;
}

.info-page-kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--altura-sage);
  margin-bottom: 12px;
}

.info-page h1 {
  font-family: var(--font-editorial);
  font-size: clamp(48px, 6vw, 84px);
  font-weight: 400;
  line-height: 1;
  color: var(--altura-black);
  margin: 0 0 32px;
}

.info-page-intro {
  font-size: 18px;
  line-height: 1.5;
  color: var(--altura-black);
  max-width: 680px;
  margin: 0 0 32px;
}

.info-page-body {
  max-width: 640px;
  font-size: 14px;
  line-height: 1.7;
  color: #444C45;
  margin-bottom: 40px;
}

.info-page-body p {
  margin: 0 0 16px;
}

.text-link {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  text-decoration: underline;
  text-underline-offset: 4px;
  color: var(--altura-black);
}

.not-found-page {
  min-height: calc(100vh - var(--header-height));
  max-width: var(--max-content-width);
  margin: 0 auto;
  padding: 120px var(--page-gutter) 96px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.not-found-page .home-section-kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--altura-sage);
  margin-bottom: 8px;
}

.not-found-page h1 {
  font-family: var(--font-editorial);
  font-size: clamp(54px, 7vw, 96px);
  font-weight: 400;
  line-height: 1;
  color: var(--altura-black);
  margin: 0 0 20px;
}

.not-found-page p {
  font-size: 14px;
  color: var(--text-muted);
  max-width: 440px;
  margin: 0 0 36px;
}

.not-found-actions {
  display: flex;
  align-items: center;
  gap: 24px;
}

.home-cta--dark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 28px;
  background: var(--altura-black);
  color: var(--altura-offwhite);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-weight: 500;
  transition: background var(--motion-fast);
}

.home-cta--dark:hover {
  background: var(--altura-forest);
}

/* ==========================================================================
   13. RESPONSIVE BREAKPOINTS (1024px / 768px / 390px)
   ========================================================================== */

@media (max-width: 1024px) {
  :root {
    --page-gutter: 1.75rem;
  }

  .home-manifesto-grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }

  .home-curated-grid {
    grid-template-columns: 1fr;
  }

  .home-material-feature {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .product-layout {
    grid-template-columns: 1fr;
  }

  .product-gallery {
    border-right: 0;
  }

  .product-buybox {
    position: relative;
    top: auto;
    max-height: none;
    padding: 36px var(--page-gutter);
    border-top: 1px solid var(--line);
  }

  .site-footer-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 40px;
  }
}

@media (max-width: 768px) {
  :root {
    --page-gutter: var(--page-gutter-mobile);
    --header-height: var(--header-height-mobile);
    --announcement-height: var(--announcement-height-mobile);
  }

  .announcement-bar {
    padding: 0 var(--page-gutter-mobile);
    font-size: 9px;
  }

  .announcement-right .announcement-dispatch,
  .announcement-right .announcement-divider {
    display: none;
  }

  .site-header {
    padding: 0 var(--page-gutter-mobile);
  }

  .header-left-nav .header-action--nav {
    display: none;
  }

  .header-action--mobile-menu {
    display: inline-flex;
  }

  .header-actions {
    gap: 16px;
  }

  .wordmark span {
    font-size: 12px;
    letter-spacing: 0.26em;
    padding-left: 0.26em;
  }

  .menu-grid {
    grid-template-columns: 1fr;
    padding: 32px var(--page-gutter-mobile);
    overflow-y: auto;
    max-height: calc(100dvh - var(--header-height));
  }

  .search-results {
    grid-template-columns: 1fr;
  }

  .home-hero {
    height: 640px;
    min-height: 560px;
  }

  .home-hero-container {
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
  }

  .collection-heading {
    height: 280px;
  }

  .collection-heading-container {
    padding: 0 var(--page-gutter-mobile) 24px;
  }

  .collection-heading-card {
    padding: 20px 24px;
  }

  .collection-toolbar {
    height: 48px;
    padding: 0 var(--page-gutter-mobile);
  }

  .collection-toolbar-center {
    display: none;
  }

  .product-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .product-card {
    padding: 14px 10px;
  }

  .gallery-cell--primary {
    grid-column: span 2;
  }

  .mobile-purchase-bar {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 55;
    height: 56px;
    padding: 0 var(--page-gutter-mobile);
    background: rgba(251, 249, 243, 0.98);
    backdrop-filter: blur(8px);
    border-top: 1px solid var(--line);
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.05);
  }

  .mobile-purchase-bar > div {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .mobile-purchase-bar strong {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
  }

  .mobile-purchase-bar span {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--text-muted);
  }

  .mobile-purchase-bar button {
    padding: 10px 20px;
    background: var(--altura-black);
    color: var(--altura-white);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-weight: 500;
  }

  .mobile-purchase-bar button:disabled {
    opacity: 0.45;
  }

  .product-buybox {
    padding-bottom: 76px;
  }

  .recommendations {
    padding: 48px var(--page-gutter-mobile);
  }

  .recommendations .product-grid--recommendations {
    grid-template-columns: repeat(2, 1fr);
  }

  .checkout-page {
    grid-template-columns: 1fr;
  }

  .checkout-main {
    border-right: 0;
    border-bottom: 1px solid var(--line);
    padding: 32px var(--page-gutter-mobile) 48px;
  }

  .checkout-summary {
    position: relative;
    top: auto;
    padding: 32px var(--page-gutter-mobile);
  }

  .site-footer {
    padding: 56px var(--page-gutter-mobile) 32px;
  }

  .site-footer-grid {
    grid-template-columns: 1fr;
    gap: 36px;
  }

  .site-footer-bottom {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
}
"""

with open(r"c:\Users\DELL\Downloads\altura-store-step17\altura-store\app\globals.css", "w", encoding="utf-8") as f:
    f.write(css)

print("SUCCESS: globals.css written")
