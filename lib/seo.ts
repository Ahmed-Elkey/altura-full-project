import type { Metadata } from 'next';
import { siteOrigin, siteOpenGraph } from './site-origin';

export function absoluteUrl(path: string) {
  try {
    const url = new URL(path, `${siteOrigin}/`);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function pageMetadata(title: string, description: string, path: string, options: { noindex?: boolean; images?: string[] } = {}): Metadata {
  const cleanTitle = title.replace(/\s*[—–-]\s*ALTURA\s*$/i, '').trim();
  const url = `${siteOrigin}${path}`;
  const images = options.images?.length ? options.images : siteOpenGraph.images;
  return {
    title: cleanTitle, description,
    alternates: { canonical: url },
    robots: options.noindex ? { index: false, follow: true } : { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
    openGraph: { ...siteOpenGraph, title: `${cleanTitle} — ALTURA`, description, url, images },
    twitter: { card: 'summary_large_image', title: `${cleanTitle} — ALTURA`, description, images },
  };
}

// Escape HTML delimiters even for merchant-supplied strings inside a script tag.
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export const infoSeo: Record<string, { title: string; description: string; path: string; noindex?: boolean }> = {
  'about-us': { title: 'About Us', description: 'Discover ALTURA, an Egyptian apparel brand inspired by movement, desert climate and urban life.', path: '/info/about-us' },
  'f-a-q': { title: 'FAQs', description: 'Find answers to ALTURA questions about orders, Egypt delivery, garment care and returns.', path: '/info/f-a-q' },
  shipping: { title: 'Shipping & Returns', description: 'Read ALTURA delivery information for Egypt and the store’s return eligibility and request process.', path: '/info/shipping' },
  contact: { title: 'Contact', description: 'Contact ALTURA about products, orders and customer support using the store contact form.', path: '/info/contact' },
  lookbook: { title: 'Lookbook', description: 'Explore ALTURA’s Fall–Winter 26 lookbook: running apparel, layers and changing weather.', path: '/info/lookbook' },
  press: { title: 'Press', description: 'Explore the ALTURA press page and brand imagery.', path: '/info/press', noindex: true },
  journal: { title: 'Journal', description: 'ALTURA journal: a space for future brand notes, field stories and collection insights.', path: '/info/journal', noindex: true },
  'terms-policies': { title: 'Terms & Policies', description: 'Read ALTURA store terms, privacy information, shipping and return policies.', path: '/info/terms-policies' },
  'start-a-return': { title: 'Start a Return', description: 'Request a return for a delivered ALTURA order using your account or order number and checkout email.', path: '/start-a-return', noindex: true },
  instagram: { title: 'Instagram', description: 'ALTURA social links are being prepared.', path: '/info/instagram', noindex: true },
};
export const infoAliases: Record<string, string> = { about: 'about-us', faqs: 'f-a-q', terms: 'terms-policies', 'shipping-returns': 'shipping', 'contact-us': 'contact' };
export function infoMetadata(slug: string) {
  const key = Object.hasOwn(infoAliases, slug) ? infoAliases[slug] : slug;
  const info = Object.hasOwn(infoSeo, key) ? infoSeo[key] : undefined;
  return info ? pageMetadata(info.title, info.description, info.path, info) : { title: 'Not found', robots: { index: false, follow: false } };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: `${siteOrigin}${item.path}` })) };
}
