"use client";

import { cartIssueMessage, getUserErrorMessage } from "@/lib/api-errors";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/data/products";
import { commerceFetch } from "@/lib/commerce-api";
import { useCustomerAuth } from "./account/CustomerAuthProvider";

type CartApiItem = {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  currency: string;
  availableQuantity: number;
  product: { id: string; slug: string; name: string; image: string | null };
  option: { colorName: string; colorHex: string | null; size: string; title: string };
};

type CartApiResponse = {
  id: string;
  ownerType: "guest" | "customer";
  currency: string;
  itemCount: number;
  subtotal: number;
  items: CartApiItem[];
  issues: Array<{ itemId: string; code: string; message: string; availableQuantity: number }>;
  expiresAt: string | null;
  updatedAt: string;
};

export type CartLine = {
  key: string;
  itemId: string;
  variantId: string;
  product: Product;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  availableQuantity: number;
  image: string | null;
};

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  currency: string;
  cartOpen: boolean;
  loading: boolean;
  error: string | null;
  issues: CartApiResponse["issues"];
  recommendationSeed: string | null;
  addItem: (product: Product, color: string, size: string, variantId: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  setQuantity: (key: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
  openCart: () => void;
  closeCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function fallbackProduct(item: CartApiItem): Product {
  return {
    id: item.product.slug,
    status: "active",
    name: item.product.name,
    price: item.unitPrice,
    currency: item.currency,
    category: "Accessories",
    subcategory: "ALTURA",
    colors: [item.option.colorName],
    sizes: [item.option.size],
    inStock: item.availableQuantity > 0,
    tone: "stone",
    description: "ALTURA performance apparel.",
    details: [],
    fit: "",
  };
}

function mapCartLines(items: CartApiItem[]): CartLine[] {
  return items.map((item) => ({
    key: item.id,
    itemId: item.id,
    variantId: item.variantId,
    product: fallbackProduct(item),
    color: item.option.colorName,
    size: item.option.size,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    currency: item.currency,
    availableQuantity: item.availableQuantity,
    image: item.product.image,
  }));
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { state: authState, apiFetch } = useCustomerAuth();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [currency, setCurrency] = useState("EGP");
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<CartApiResponse["issues"]>([]);
  // Last product the shopper touched — drives the drawer's "You may also like" rail.
  const [recommendationSeed, setRecommendationSeed] = useState<string | null>(null);
  const refreshSequence = useRef(0);

  const request = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    if (authState === "authenticated") return apiFetch<T>(path, init);
    return commerceFetch<T>(path, init);
  }, [apiFetch, authState]);

  const applyCart = useCallback((cart: CartApiResponse) => {
    setLines(mapCartLines(cart.items));
    setSubtotal(cart.subtotal);
    setCurrency(cart.currency);
    const safeIssues = cart.issues.map((issue) => ({ ...issue, message: cartIssueMessage(issue.code) }));
    setIssues(safeIssues);
    setError(safeIssues.length ? safeIssues.map((issue) => issue.message).join(" · ") : null);
  }, []);

  const refreshCart = useCallback(async () => {
    if (authState === "loading") return;
    const sequence = ++refreshSequence.current;
    setLoading(true);
    try {
      const cart = await request<CartApiResponse>("/cart");
      if (sequence !== refreshSequence.current) return;
      applyCart(cart);
    } catch (caught) {
      if (sequence !== refreshSequence.current) return;
      setError(getUserErrorMessage(caught, "cart"));
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, [applyCart, authState, request]);

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  const mutateCart = useCallback(async (path: string, init: RequestInit) => {
    setLoading(true);
    setError(null);
    try {
      const cart = await request<CartApiResponse>(path, init);
      applyCart(cart);
    } catch (caught) {
      const message = getUserErrorMessage(caught, "cart");
      setError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, [applyCart, request]);

  const addItem = useCallback(async (product: Product, _color: string, _size: string, variantId: string) => {
    setRecommendationSeed(product.id);
    await mutateCart("/cart/items", {
      method: "POST",
      body: JSON.stringify({ variantId, quantity: 1 }),
    });
  }, [mutateCart]);

  const removeItem = useCallback(async (key: string) => {
    const removed = lines.find((line) => line.key === key);
    if (removed) setRecommendationSeed(removed.product.id);
    await mutateCart(`/cart/items/${encodeURIComponent(key)}`, { method: "DELETE" });
  }, [lines, mutateCart]);

  const setQuantity = useCallback(async (key: string, quantity: number) => {
    const line = lines.find((entry) => entry.key === key);
    if (line) setRecommendationSeed(line.product.id);
    if (quantity <= 0) {
      await removeItem(key);
      return;
    }
    await mutateCart(`/cart/items/${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    });
  }, [lines, mutateCart, removeItem]);

  const clearCart = useCallback(async () => {
    await mutateCart("/cart", { method: "DELETE" });
  }, [mutateCart]);

  const value = useMemo<CartContextValue>(() => ({
    lines,
    count: lines.reduce((total, line) => total + line.quantity, 0),
    subtotal,
    currency,
    cartOpen,
    loading,
    error,
    issues,
    recommendationSeed,
    addItem,
    removeItem,
    setQuantity,
    clearCart,
    refreshCart,
    openCart: () => setCartOpen(true),
    closeCart: () => setCartOpen(false),
  }), [addItem, cartOpen, clearCart, currency, error, issues, lines, loading, recommendationSeed, refreshCart, removeItem, setQuantity, subtotal]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
