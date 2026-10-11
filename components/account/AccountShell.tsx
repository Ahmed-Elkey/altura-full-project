"use client";

import { LoadingState } from "@/components/LoadingState";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { InfoModal, type InfoKey } from "@/components/InfoModal";
import { COUNTRIES, countryName, storeCountryCode, storedCountryCode } from "@/components/regions";
import { useCustomerAuth } from "./CustomerAuthProvider";
import { store } from "@/data/store";

export function AccountShell({ children, publicView = false }: { children: React.ReactNode; publicView?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, user, logout } = useCustomerAuth();
  const [infoModal, setInfoModal] = useState<InfoKey | null>(null);
  const [country, setCountry] = useState<string>(() => storedCountryCode(store.countryCode));
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const authPage = pathname === "/account/login" || pathname === "/account/register";

  useEffect(() => {
    // Unified entry: ADMIN users land on /admin, CUSTOMER users on /account.
    if (!publicView && !authPage && state === "unauthenticated") router.replace(`/account/login?next=${encodeURIComponent(pathname ?? "/account")}`);
    if (authPage && state === "authenticated") router.replace(user?.role === "ADMIN" ? "/admin" : "/account");
  }, [authPage, pathname, router, state, user?.role, publicView]);

  if (authPage) return <>{children}</>;
  if (!publicView && state === "loading") return <main className="loading-page loading-page--session"><LoadingState message="Restoring your ALTURA session…" /></main>;
  if (!publicView && (state !== "authenticated" || !user)) return null;

  const isOrders = pathname === "/account" || pathname?.startsWith("/account/orders") || pathname?.startsWith("/order-confirmation") || pathname === "/track-order";
  const isProfile = pathname?.startsWith("/account/profile");

  return (
    <main className="balmoral-account">
      {/* Header — ALTURA left, avatar right */}
      <header className="balmoral-account__header">
        <Link href="/" className="balmoral-account__brand" aria-label="ALTURA home">
          ALTURA
        </Link>
        <Link href="/account/profile" className="balmoral-account__avatar" aria-label="Profile">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <circle cx="14" cy="14" r="13" stroke="currentColor" strokeOpacity="0.14" fill="none" />
            <circle cx="14" cy="14" r="10.2" stroke="currentColor" strokeOpacity="0.18" fill="none" />
            <circle cx="14" cy="11.2" r="3.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M8.8 18.2C9.6 16.6 11.5 15.4 14 15.4C16.5 15.4 18.4 16.6 19.2 18.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          </svg>
        </Link>
      </header>

      <div className="balmoral-account__body">
        <nav className="balmoral-account__nav" aria-label="Account">
          <Link href="/account/orders" className={isOrders ? "is-active" : ""}>
            Orders
          </Link>
          <Link href="/account/profile" className={isProfile ? "is-active" : ""}>
            Profile
          </Link>
          <Link href="/account/security" className={pathname === "/account/security" ? "is-active" : ""}>
            Security
          </Link>
          <Link href="/account/rewards" className={pathname === "/account/rewards" ? "is-active" : ""}>Rewards & newsletter</Link>
          <Link href="/account/returns" className={pathname?.startsWith("/account/returns") ? "is-active" : ""}>Returns</Link>
          <Link href="/account/support" className={pathname?.startsWith("/account/support") ? "is-active" : ""}>Support</Link>
          {user?.role === "ADMIN" ? (
            <Link href="/admin">
              Dashboard
            </Link>
          ) : null}
        </nav>

        <section className="balmoral-account__main">{children}</section>
      </div>

      <footer className="balmoral-account__footer">
        <span className="balmoral-account__countryWrap">
          <button type="button" className="balmoral-account__country" aria-haspopup="menu" aria-expanded={countryMenuOpen} onClick={() => setCountryMenuOpen((v) => !v)}>
            {countryName(country)} <span aria-hidden="true">▾</span>
          </button>
          {countryMenuOpen ? (
            <span className="balmoral-account__countryMenu" role="menu" aria-label="Country">
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={c.code === country}
                  className={c.code === country ? "is-active" : ""}
                  onClick={() => {
                    setCountry(c.code);
                    storeCountryCode(c.code);
                    setCountryMenuOpen(false);
                  }}
                >
                  <span className="balmoral-account__countryFlag" aria-hidden="true">{c.flag}</span>
                  {c.name}
                  {c.code === country ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 6 5 8.5 9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              ))}
            </span>
          ) : null}
        </span>
        <button type="button" onClick={() => setInfoModal("cookies")}>Cookie preferences</button>
        <button type="button" onClick={() => setInfoModal("refund")}>Refund policy</button>
        <button type="button" onClick={() => setInfoModal("shipping")}>Shipping</button>
        <button type="button" onClick={() => setInfoModal("privacy")}>Privacy policy</button>
        <button type="button" onClick={() => setInfoModal("terms")}>Terms of service</button>
      </footer>
      {countryMenuOpen ? (
        <button type="button" aria-hidden="true" tabIndex={-1} className="balmoral-account__countryScrim" onClick={() => setCountryMenuOpen(false)} />
      ) : null}
      <InfoModal modalKey={infoModal} onClose={() => setInfoModal(null)} />
    </main>
  );
}
