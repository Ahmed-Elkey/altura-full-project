"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Image = { src: string; alt: string; view: string };

/** Portal keeps the fixed viewer outside the animated route's containing block. */
export function ProductImageViewer({ name, images, initialIndex, onClose }: {
  name: string; images: Image[]; initialIndex: number; onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const image = images[index];

  useEffect(() => {
    setZoomed(false);
    setFailed(false);
    stage.current?.scrollTo(0, 0);
  }, [index, image.src]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = stage.current;
      if (element) element.scrollTo(zoomed ? (element.scrollWidth - element.clientWidth) / 2 : 0, zoomed ? (element.scrollHeight - element.clientHeight) / 2 : 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [zoomed, index]);

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const buttons = () => Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
    buttons()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex(current => (current + (event.key === "ArrowRight" ? 1 : images.length - 1)) % images.length);
      }
      if (event.key === "Tab") {
        const first = buttons()[0];
        const last = buttons().at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    function onFocus(event: FocusEvent) {
      if (event.target instanceof Node && !dialog.current?.contains(event.target)) buttons()[0]?.focus();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [images.length]);

  return createPortal(
    <div ref={dialog} className="product-image-viewer" role="dialog" aria-modal="true" aria-label={`${name} image viewer`}>
      <header className="product-image-viewer__header">
        <div><strong>{name}</strong><span>Image {index + 1} of {images.length} · {image.view}</span></div>
        <button type="button" aria-label="Close image viewer" onClick={onClose}>Close ×</button>
        <button type="button" aria-label={zoomed ? "Zoom out" : "Zoom in"} aria-pressed={zoomed} disabled={failed} onClick={() => setZoomed(value => !value)}>{zoomed ? "− Zoom out" : "+ Zoom in"}</button>
      </header>
      <div ref={stage} className={`product-image-viewer__stage${zoomed ? " is-zoomed" : ""}`}>
        {failed ? (
          <div className="product-image-viewer__error" role="alert"><p>This image could not load.</p><button type="button" onClick={() => { setFailed(false); setRetry(value => value + 1); }}>Retry image</button></div>
        ) : (
          <button type="button" className="product-image-viewer__image" aria-label={zoomed ? "Reset image zoom" : "Magnify image"} onClick={() => setZoomed(value => !value)}>
            <img key={`${image.src}-${retry}`} src={image.src} alt={image.alt} onError={() => setFailed(true)} draggable={false} />
          </button>
        )}
      </div>
      <footer className="product-image-viewer__footer">
        <button type="button" aria-label="Previous image" onClick={() => setIndex(current => (current + images.length - 1) % images.length)}>←</button>
        <div className="product-image-viewer__views">
          {images.map((item, position) => <button key={item.view} type="button" aria-label={`View ${item.view} image`} aria-pressed={index === position} onClick={() => setIndex(position)}>{item.view}</button>)}
        </div>
        <button type="button" aria-label="Next image" onClick={() => setIndex(current => (current + 1) % images.length)}>→</button>
      </footer>
    </div>, document.body,
  );
}
