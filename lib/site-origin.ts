// NEXT_PUBLIC values are embedded during build. Rebuild after changing this URL.
const configured = process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3100";
const parsed = new URL(configured);
if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
  throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTP(S) site origin without credentials or a path.");
}
export const siteOrigin = parsed.origin;
export const siteOpenGraph = {
  type: "website" as const,
  images: [{ url: `${siteOrigin}/opengraph-image.jpg`, width: 1200, height: 630, alt: "ALTURA performance running apparel" }],
};
