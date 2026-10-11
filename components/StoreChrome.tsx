"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { CartProvider } from "@/components/CartProvider";
import { CustomerAuthProvider } from "@/components/account/CustomerAuthProvider";
import { CommerceStatusBanner } from "@/components/CommerceStatusBanner";

export function StoreChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [commerceDegraded, setCommerceDegraded] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);
  const isAdmin = pathname?.startsWith("/admin");
  const isAccountAuth = pathname?.startsWith("/support") || pathname?.startsWith("/newsletter") || pathname?.startsWith("/account") || pathname?.startsWith("/checkout") || pathname?.startsWith("/order-confirmation") || pathname === "/track-order" || pathname === "/cart";

  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      root.classList.remove("motion-ready");
      return;
    }

    root.classList.add("motion-ready");
    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    revealNodes.forEach((node, index) => {
      node.style.setProperty("--reveal-delay", `${Math.min(index % 8, 5) * 55}ms`);
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8%" });

    revealNodes.forEach((node) => observer.observe(node));

    const parallaxNodes = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    let frame = 0;
    const updateParallax = () => {
      frame = 0;
      parallaxNodes.forEach((node) => {
        const rect = node.getBoundingClientRect();
        const speed = Number(node.dataset.parallax || 0.08);
        const distance = (window.innerHeight / 2 - (rect.top + rect.height / 2)) * speed;
        const offset = Math.max(-34, Math.min(34, distance));
        node.style.setProperty("--parallax-y", `${offset.toFixed(2)}px`);
      });
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateParallax);
    };
    updateParallax();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  if (isAdmin) {
    return <div id="main-content">{children}</div>;
  }

  return (
    <div className="store-chrome" data-commerce-state={commerceDegraded ? "degraded" : "healthy"}
      style={{ "--commerce-banner-height": `${bannerHeight}px` } as React.CSSProperties}>
    <CustomerAuthProvider>
      <CartProvider>
        <CommerceStatusBanner onStatusChange={setCommerceDegraded} onHeightChange={setBannerHeight} />
        {isAccountAuth ? (
          <div id="main-content" className="route-stage" key={pathname}>{children}</div>
        ) : (
          <>
            <SiteHeader commerceDegraded={commerceDegraded} />
            <div id="main-content" className="route-stage" key={pathname}>{children}</div>
            <SiteFooter />
          </>
        )}
      </CartProvider>
    </CustomerAuthProvider>
    </div>
  );
}
