"use client";

import { LoadingState } from "@/components/LoadingState";
import { getUserErrorMessage } from "@/lib/api-errors";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCustomerAuth } from "@/components/account/CustomerAuthProvider";
import { commerceFetch } from "@/lib/commerce-api";
import { formatMoney } from "@/lib/money";

type WishlistItem = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  status: string;
  available: boolean;
  priceFrom: number;
  currency: string;
  image: string | null;
  colors: string[];
  addedAt: string;
};
type Wishlist = { itemCount: number; items: WishlistItem[] };

export function WishlistClient() {
  const { state: authState, apiFetch } = useCustomerAuth();
  const [data, setData] = useState<Wishlist | null>(null);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const request = useCallback(<T,>(path: string, init?: RequestInit) => {
    return authState === "authenticated"
      ? apiFetch<T>(path, init)
      : commerceFetch<T>(path, init);
  }, [apiFetch, authState]);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await request<Wishlist>("/wishlist"));
    } catch (caught) {
      setError(getUserErrorMessage(caught, "wishlist"));
    }
  }, [request]);

  useEffect(() => {
    if (authState !== "loading") void load();
  }, [authState, load]);

  async function remove(productId: string) {
    setRemoving(productId);
    setError("");
    try {
      await request(`/wishlist/items/${encodeURIComponent(productId)}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(getUserErrorMessage(caught, "wishlist"));
    } finally {
      setRemoving(null);
    }
  }

  if (error && !data) {
    return (
      <main className="wishlist-page">
        <div className="wishlist-empty">
          <span>Saved / Wishlist</span>
          <h1>Your saved pieces.</h1>
          <p role="alert">{error}</p>
          <button type="button" className="home-cta home-cta--dark" onClick={() => void load()}>Try again</button>
          <Link href="/account/login?next=%2Fwishlist" className="account-underlink">Sign in to view your account wishlist →</Link>
        </div>
      </main>
    );
  }

  if (!data) return <main className="loading-page"><LoadingState message="Loading saved pieces…" /></main>;

  return (
    <main className="wishlist-page">
      <header className="wishlist-header">
        <div><span>Saved / Wishlist</span><h1>Your saved pieces.</h1></div>
        <p>{data.itemCount} saved {data.itemCount === 1 ? "piece" : "pieces"}</p>
      </header>
      {error ? <p className="account-form-error" role="alert">{error}</p> : null}
      {data.items.length ? (
        <div className="wishlist-grid">
          {data.items.map((item) => (
            <article className="wishlist-card" key={item.id}>
              <Link href={`/products/${item.slug}`} className="wishlist-card-image">
                {item.image ? <img src={item.image} alt={item.name} /> : <span>ALTURA</span>}
                <span className="wishlist-card-status">{item.available ? "Available" : "Unavailable"}</span>
              </Link>
              <div className="wishlist-card-meta">
                <div><Link href={`/products/${item.slug}`}>{item.name}</Link><small>{item.colors.join(" · ")}</small></div>
                <span>{formatMoney(item.priceFrom, item.currency)}</span>
              </div>
              <button type="button" disabled={removing === item.productId} onClick={() => void remove(item.productId)}>
                {removing === item.productId ? "Removing…" : "Remove from saved →"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="wishlist-empty">
          <span>Nothing saved yet.</span>
          <h2>Keep a few pieces close.</h2>
          <p>Use the wishlist to return to equipment you are considering.</p>
          <Link href="/collections/shopall" className="home-cta home-cta--dark">Explore the collection</Link>
        </div>
      )}
    </main>
  );
}
