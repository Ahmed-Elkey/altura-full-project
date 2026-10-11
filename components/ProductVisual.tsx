import type { Product } from "@/data/products";

type ProductView = "front" | "back" | "detail" | "angled";

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

export function productAssetPath(product: Product, color: string, view: ProductView = "front") {
  const backendImage = product.imageUrls?.find((image) => {
    const matchesColor = !image.colorName || image.colorName.toLowerCase() === color.toLowerCase();
    const matchesView = !image.view || image.view.toLowerCase() === view.toLowerCase();
    return matchesColor && matchesView;
  });
  if (backendImage) return backendImage.url;
  return `/products/${product.id}/${slug(color)}-${view}.jpg`;
}

export function ProductVisual({
  product,
  detail = false,
  color,
  view = "front",
}: {
  product: Product;
  detail?: boolean;
  color?: string;
  view?: ProductView;
}) {
  const selectedColor = color || product.colors[0];
  const src = productAssetPath(product, selectedColor, view);

  return (
    <div
      className={`product-art product-art--asset product-art--${product.tone} product-art--view-${view} ${detail ? "product-art--detail" : ""}`}
      aria-label={`${product.name} in ${selectedColor}, ${view} view`}
    >
      <img
        className="product-asset-image"
        src={src}
        alt={`${product.name} in ${selectedColor}, ${view} view`}
        loading={detail ? "eager" : "lazy"}
        decoding="async"
      />
      <span className="product-art-color-name">{selectedColor}</span>
    </div>
  );
}
