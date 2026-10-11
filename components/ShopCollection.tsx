import { CollectionPage } from "./CollectionPage";
import { listProducts } from "@/lib/storefront";

export async function ShopCollection() {
  const products = await listProducts();
  return <CollectionPage title="Shop All" source={products} />;
}
