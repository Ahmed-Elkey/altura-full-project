import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetail } from '@/components/ProductDetail';
import { productAssetPath } from '@/components/ProductVisual';
import { findProduct, listProducts } from '@/lib/storefront';
import { absoluteUrl, breadcrumbJsonLd, pageMetadata, serializeJsonLd } from '@/lib/seo';
import { siteOrigin } from '@/lib/site-origin';

export const dynamic = 'force-dynamic';

function productImages(product: NonNullable<Awaited<ReturnType<typeof findProduct>>>) {
  const paths = product.imageUrls?.length ? product.imageUrls.map(image => image.url) : [productAssetPath(product, product.colors[0])];
  return [...new Set(paths.map(absoluteUrl).filter((url): url is string => Boolean(url)))];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await findProduct(id);
  if (!product) notFound();
  return pageMetadata(product.seoTitle || product.name, product.seoDescription || product.description, `/products/${encodeURIComponent(product.id)}`, { images: productImages(product), noindex: product.catalogSource === 'static-fallback' });
}

export default async function ProductPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ color?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const product = await findProduct(id);
  if (!product) notFound();
  const recommendations = (await listProducts({ limit: 4, inStock: true })).filter(item => item.id !== product.id).slice(0, 3);
  const url = `${siteOrigin}/products/${encodeURIComponent(product.id)}`;
  const productJsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', '@id': `${url}#product`, url,
    name: product.name, description: product.description, image: productImages(product),
    category: product.category, color: product.colors, size: product.sizes,
    brand: { '@type': 'Brand', name: 'ALTURA' },
    // Fallback content is readable but is not a verified live merchant offer.
    ...(product.catalogSource === 'backend' && product.seoVariants?.length ? {
      offers: product.seoVariants.map(variant => ({
        '@type': 'Offer', sku: variant.sku, name: `${product.name} / ${variant.color} / ${variant.size}`,
        url: `${url}?color=${encodeURIComponent(variant.color)}`,
        priceCurrency: product.currency, price: variant.price,
        availability: `https://schema.org/${variant.inStock ? 'InStock' : 'OutOfStock'}`,
        itemCondition: 'https://schema.org/NewCondition', seller: { '@id': `${siteOrigin}/#organization` },
      })),
    } : {}),
  };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(productJsonLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Shop All', path: '/collections/shopall' }, { name: product.name, path: `/products/${encodeURIComponent(product.id)}` }])) }} />
    <ProductDetail product={product} recommendations={recommendations} initialColor={query.color} />
  </>;
}
