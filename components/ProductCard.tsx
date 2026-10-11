import Link from "next/link";
import type { Product } from "@/data/products";
import { ProductVisual } from "./ProductVisual";
import { formatMoney } from "@/lib/money";

export function ProductCard({ product, color }: { product: Product; color?: string }) {
  const selectedColor = color || product.colors[0];
  const href = `/products/${product.id}?color=${encodeURIComponent(selectedColor)}`;
  const primaryView = product.id === "trail-cap" || product.id === "trail-shorts" || product.id === "range-tee" ? "angled" : "front";
  const secondaryView = primaryView === "front" ? (product.subcategory === "Other" ? "angled" : "back") : "front";

  return (
    <article className="product-card" data-reveal="up">
      <Link href={href} className="product-visual" aria-label={`${product.name}, ${selectedColor}`}>
        <div className="product-card-visual product-card-visual--primary">
          <ProductVisual product={product} color={selectedColor} view={primaryView} />
        </div>
        <div className="product-card-visual product-card-visual--secondary" aria-hidden="true">
          <ProductVisual product={product} color={selectedColor} view={secondaryView} />
        </div>
        {!product.inStock && <span className="sold-out">Sold out</span>}
        <span className="product-card-view-label">View product</span>
      </Link>
      <div className="product-meta">
        <div className="product-meta-name">
          <Link href={href}>{product.name}</Link>
          <small>{selectedColor}</small>
        </div>
        <span>{formatMoney(product.price, product.currency)}</span>
      </div>
    </article>
  );
}
