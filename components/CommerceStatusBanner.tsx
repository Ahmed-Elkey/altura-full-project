"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function CommerceStatusBanner({ onStatusChange, onHeightChange }: {
  onStatusChange: (degraded: boolean) => void;
  onHeightChange: (height: number) => void;
}) {
  const pathname = usePathname();
  const [degraded, setDegraded] = useState(false);
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const update = (unavailable: boolean) => {
      if (cancelled) return;
      setDegraded(unavailable);
      onStatusChange(unavailable);
    };
    const check = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(4000) });
        const status = await response.json();
        update(!response.ok || status.commerceReady !== true);
      } catch { update(true); }
    };
    void check();
    const timer = setInterval(() => void check(), 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [pathname, onStatusChange]);
  useLayoutEffect(() => {
    if (!degraded || !banner.current) { onHeightChange(0); return; }
    const element = banner.current;
    const measure = () => onHeightChange(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [degraded, onHeightChange]);
  if (!degraded) return null;
  return <div ref={banner} role="alert" data-commerce-degraded className="commerce-status-banner">
    <strong>Commerce is unavailable.</strong>{" "}Cart and checkout are paused.
  </div>;
}
