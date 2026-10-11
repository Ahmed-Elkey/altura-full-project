"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { colorHex, type Product } from "@/data/products";

/**
 * Card-level color switcher. Mirrors the product-detail design exactly:
 * 48x14 rectangular bars + uppercase "COLOR: X" label + sliding 20x2 marker.
 */
export function ProductColorSwatches({
  product,
  color,
  onChange,
  className = "",
  max = 4,
  showLabel = false,
}: {
  product: Product;
  color: string;
  onChange: (color: string) => void;
  className?: string;
  max?: number;
  showLabel?: boolean;
}) {
  const colors = product.colors;
  const wrap = useRef<HTMLDivElement>(null);
  const [markerPosition, setMarkerPosition] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const measure = () => {
      const active = element.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      const next = active ? { x: active.offsetLeft + (active.offsetWidth - 16) / 2, y: active.offsetTop + active.offsetHeight + 6 } : null;
      setMarkerPosition(previous => previous?.x === next?.x && previous?.y === next?.y ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [color, max, colors]);

  if (colors.length < 2) return null;

  return (
    <div className={`pcsw pcsw--inline ${className}`.trim()}>
      {showLabel && <span className="pcsw__label">COLOR: {color.toUpperCase()}</span>}
      <div className="pcsw__wrap" ref={wrap}>
        {colors.slice(0, max).map((c) => {
          const isActive = c === color;
          return (
          <button
              key={c}
              type="button"
              className="pcsw__bar"
              aria-label={c}
              aria-pressed={isActive}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(c);
              }}
              style={{ background: colorHex[c] || "#ddd" }}
            >
              <span className="pcsw__fill" aria-hidden="true" style={{ background: colorHex[c] || "#ddd" }} />
            </button>
          );
        })}
        <span className="pcsw__marker" aria-hidden="true" style={{ visibility: markerPosition ? "visible" : "hidden", transform: `translate3d(${markerPosition?.x ?? 0}px, ${markerPosition?.y ?? 0}px, 0)` }} />
      </div>
    </div>
  );
}
