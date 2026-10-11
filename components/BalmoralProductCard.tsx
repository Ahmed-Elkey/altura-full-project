"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/data/products";
import { formatMoney } from "@/lib/money";
import { ProductColorSwatches } from "./ProductColorSwatches";
import { productAssetPath } from "./ProductVisual";

export function BalmoralProductCard({
  product,
  color,
  className = "",
}: {
  product: Product;
  color?: string;
  className?: string;
}) {
  const fallbackColor = color || product.colors[0] || "";
  const [selectedColor, setSelectedColor] = useState(fallbackColor);
  const href = `/products/${product.id}?color=${encodeURIComponent(selectedColor)}`;
  const src = productAssetPath(product, selectedColor, "front");
  const alt = `${product.name} in ${selectedColor}`.trim();
  // Local public/ assets go through the Next.js optimizer (responsive sizes);
  // remote backend URLs stay on a plain <img> (no remotePatterns configured).
  const isLocalAsset = src.startsWith("/");

  return (
    <div className={`product-preview ${className}`.trim()}>
      <Link href={href} className="product-preview__link td-none">
        <figure className="product-preview__thumbnail w-100 position-relative overflow-clip">
          {isLocalAsset ? (
            <Image
              key={src}
              src={src}
              alt={alt}
              width={1800}
              height={2250}
              loading="lazy"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              className="product-preview__img image-as-background"
            />
          ) : (
            <img
              key={src}
              src={src}
              alt={alt}
              width={1800}
              height={2250}
              loading="lazy"
              decoding="async"
              className="product-preview__img image-as-background"
            />
          )}
        </figure>

        <div className="product-preview__content d-flex flex-column">
          <h3 className="product-preview__title fz-13 fz-xl-14 fw-400 lh-normal m-0">{product.name}</h3>
          <div className="product-preview__meta d-flex">
            <p className="product-preview__price d-flex fz-13 fz-xl-14 fw-400 lh-normal m-0">
              <span>{formatMoney(product.price, product.currency)}</span>
            </p>
            <ProductColorSwatches product={product} color={selectedColor} onChange={setSelectedColor} />
          </div>
        </div>
      </Link>
    </div>
  );
}
