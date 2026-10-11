import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { StoreChrome } from "@/components/StoreChrome";
import { store } from "@/data/store";
import { siteOrigin, siteOpenGraph } from "@/lib/site-origin";
import { serializeJsonLd } from "@/lib/seo";
import "./globals.css";

const InterFont = localFont({
  src: [{ path: "./fonts/inter-latin-variable.woff2", weight: "300 600", style: "normal" }],
  variable: "--font-sans",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: `${store.name} — ${store.tagline}`,
    template: `%s — ${store.name}`,
  },
  description: "Performance running apparel shaped by changing ground.",
  applicationName: store.name,
  keywords: ["running apparel", "performance clothing", "running", "ALTURA"],
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  openGraph: {
    ...siteOpenGraph,
    title: `${store.name} — ${store.tagline}`,
    description: "Performance running apparel shaped by changing ground.",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  twitter: {
    card: "summary_large_image",
    title: `${store.name} — ${store.tagline}`,
    description: "Performance running apparel shaped by changing ground.",
    images: ["/opengraph-image.jpg"],
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${siteOrigin}/#organization`,
  name: store.name,
  slogan: store.tagline,
  url: siteOrigin,
  email: store.supportEmail,
  logo: `${siteOrigin}/icon.svg`,
  areaServed: { "@type": "Country", name: store.countryName },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: store.name,
  url: siteOrigin,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={InterFont.variable}>
      <head></head>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <StoreChrome>{children}</StoreChrome>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }} />
      </body>
    </html>
  );
}
