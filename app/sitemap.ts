import type { MetadataRoute } from 'next';
import { listCollections, listSitemapProducts } from '@/lib/storefront';
import { siteOrigin } from '@/lib/site-origin';
import { infoSeo } from '@/lib/seo';
import { collectionAliases, collectionCanonical } from '@/lib/collection-routes';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [collections, products] = await Promise.all([listCollections(), listSitemapProducts()]);
  const paths = new Set([
    '/', '/collections/shopall',
    ...Object.values(infoSeo).filter(page => !page.noindex).map(page => page.path),
    ...[...Object.keys(collectionAliases).filter(slug => collectionAliases[slug].collection || collectionAliases[slug].category), ...collections.map(item => item.slug)].map(slug => `/collections/${encodeURIComponent(collectionCanonical(slug))}`),
    ...products.map(product => `/products/${encodeURIComponent(product.id)}`),
  ]);
  return [...paths].map(path => ({ url: path === '/' ? siteOrigin : `${siteOrigin}${path}` }));
}
