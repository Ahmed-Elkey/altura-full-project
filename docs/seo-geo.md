# ALTURA SEO and generative search readiness

Implemented 2026-10-09. This is technical and content-discovery preparation, not a guarantee of indexing, ranking or AI citations.

## Implemented

- Shared metadata builder supplies page-specific titles, descriptions, canonical URLs, Open Graph and Twitter cards. Legacy information pages point to their actual, successful `/info/...` canonical destination; the brand suffix appears once.
- Product metadata uses saved SEO overrides or the real product name/description. Product images replace the generic brand share image. Server-rendered Product JSON-LD uses actual active variant SKUs, prices, currency and available-stock state; it does not invent ratings, GTINs, delivery guarantees or refund rules. Breadcrumbs identify product and collection navigation. Organization/WebSite describe the store without claiming a physical storefront address.
- Merchant text is escaped inside JSON-LD script tags. Invalid, credential-bearing and non-HTTP(S) image URLs are omitted without crashing metadata. API fallback product content declares noindex and omits unverifiable merchant offers.
- Sitemap is generated dynamically from the active catalog, paginating beyond 100 products. Only unique canonical public URLs are included. Journal/social/press demo pages and return forms are excluded. Legacy campaign routes that show the whole catalog point to Shop All; real backend collections use their own content and canonical URL, including newly created collections.
- Account/admin/cart/checkout/wishlist/search/tracking/confirmation/newsletter/return flows carry noindex. Private workflow routes also send X-Robots-Tag. Robots.txt permits crawlers to read page noindex and disallows `/api/`; authenticated APIs remain the actual data-access protection. A robots crawl block by itself is not an indexing or security guarantee.
- Unknown inherited alias keys now reach the normal noindex not-found boundary rather than a runtime error. Next's loading/streaming boundary can send HTTP200 before an asynchronous notFound decision; no universal HTTP404 claim is made. Product and collection decisions are checked in metadata as well as rendering.

## Admin usage

Open **Admin → Products → a product**. Fill **SEO title** and **SEO description**, then **Save product**. Leave either field empty to use the product name/description for that field. The suggested short lengths are editorial guidance; existing API limits are 180 and 320 characters. Image or variant saves preserve an unsaved SEO draft. Product and image content should accurately describe the visible merchandise.

## GEO approach

Visible server-rendered product descriptions, features/fit, clear information pages, internal product/collection links and factual structured data support discovery and understanding. The existing English content is labelled `lang=en`; no nonexistent translated pages or hreflang variants are advertised. No fabricated press/FAQ/review claims or hidden keyword text were added for AI systems. `llms.txt` is not claimed to be a requirement or ranking mechanism.

Google's guidance says normal SEO fundamentals apply to AI Overviews/AI Mode and no special AI text files or schema are required. References:

- [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Merchant listing structured data](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing)
- [Noindex and crawling](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

## Public launch requirements

The current localhost preview cannot establish public search visibility. When a public domain is available:

1. Set `NEXT_PUBLIC_SITE_URL` to the actual HTTPS site origin before building; rebuild after changes. Do not invent a domain or use someone else's brand domain. Local preview scripts intentionally pin localhost.
2. Publish frontend and API with their production origins and HTTPS. Keep account/admin/API authentication protections enabled.
3. Confirm business contact addresses, shipping promises, returns/legal policies and any press claims before publishing production copy. Demo press/journal/social content stays noindex until genuine content is available. No unverified shipping/returns terms were added to merchant markup.
4. Verify the domain in Search Console, submit `/sitemap.xml`, inspect live canonical/indexing status and use Rich Results Test/PageSpeed Insights on the deployed URL. Search Console credentials and domain ownership are not configured by this local code change.
5. Monitor indexed pages, rich-result validation, search traffic and actual customer conversions; visibility cannot be promised by technical checks alone.

Final local verification results are recorded in `QA_REPORT.md`.
