import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site-origin";

export default function robots(): MetadataRoute.Robots {
  return {
    // Let crawlers read page-level noindex. Authentication protects private data;
    // robots.txt is a crawl directive, not access control or an indexing ban.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
