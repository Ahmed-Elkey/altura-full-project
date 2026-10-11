import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CollectionPage } from "@/components/CollectionPage";
import { listCollectionProducts, listProducts } from "@/lib/storefront";
import { collectionAliases as aliases, collectionCanonical } from "@/lib/collection-routes";
import { listCollections } from "@/lib/storefront";
import { pageMetadata, breadcrumbJsonLd, serializeJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";


const collectionInfo = cache(async (slug: string) => {
  const alias = Object.hasOwn(aliases, slug) ? aliases[slug] : undefined;
  const collection = (await listCollections()).find(item => item.slug === (alias?.collection ?? slug));
  if (!alias && !collection) notFound();
  const canonical = !collection && alias && !alias.collection && !alias.category ? 'shopall' : collectionCanonical(slug);
  return { alias, collection, title: collection?.name ?? alias!.title, canonical };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const info = await collectionInfo(slug);
  return pageMetadata(info.title, info.collection?.description || `Shop ALTURA ${info.title.toLowerCase()}: explore available apparel, colors, sizes and product details.`, `/collections/${encodeURIComponent(info.canonical)}`);
}

export default async function DynamicCollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { alias, collection, title, canonical } = await collectionInfo(slug);
  const data = collection
    ? await listCollectionProducts(collection.slug)
    : alias?.collection
    ? await listCollectionProducts(alias.collection)
    : alias?.category
      ? { collection: null, products: await listProducts({ category: alias?.category }) }
      : { collection: null, products: await listProducts() };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: title, path: `/collections/${encodeURIComponent(canonical)}` }])) }} />
    <CollectionPage title={title} source={data.products} />
  </>;
}
