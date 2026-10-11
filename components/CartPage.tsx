"use client";

import { LoadingState } from "@/components/LoadingState";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { ProductVisual } from "@/components/ProductVisual";
import { AccountShell } from "@/components/account/AccountShell";
import { formatMoney } from "@/lib/money";
import { store } from "@/data/store";

export function CartPage() {
  const {
    lines,
    count,
    subtotal,
    currency,
    loading,
    error,
    refreshCart,
    removeItem,
    setQuantity,
  } = useCart();
  const remaining = Math.max(0, store.freeShippingThreshold - subtotal);
  const qualified = lines.length > 0 && remaining <= 0;

  return (
    <AccountShell publicView>
      <section className="customer-cart" aria-labelledby="customer-cart-title">
        <div className="customer-cart__heading">
          <div>
            <h1 id="customer-cart-title">Cart</h1>
            <p>Review your items before checkout.</p>
          </div>
          <Link href="/collections/shopall" className="customer-cart__continue">
            Continue shopping →
          </Link>
        </div>

        {!lines.length ? (
          <div className="balmoral-profile__card customer-order__card customer-cart__empty">
            {loading ? (
              <LoadingState message="Loading your cart…" compact />
            ) : error ? (
              <>
                <h2>We couldn&apos;t load your cart</h2>
                <p className="cart-error" role="alert">
                  {error}
                </p>
                <button
                  type="button"
                  className="cart-checkoutBtn"
                  onClick={() => void refreshCart()}
                >
                  Try again
                </button>
              </>
            ) : (
              <>
                <h2>Your cart is empty</h2>
                <p>Explore the collection to find your next favorite piece.</p>
                <Link href="/collections/shopall" className="cart-checkoutBtn">
                  Shop all
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="customer-cart__layout">
            <section
              className="cart-items"
              aria-labelledby="customer-cart-items"
            >
              <div className="customer-cart__sectionHeading">
                <h2 id="customer-cart-items">Items</h2>
                <span>
                  {count} {count === 1 ? "item" : "items"}
                </span>
              </div>
              <div
                className="balmoral-profile__card customer-order__card customer-cart__itemsCard"
                aria-busy={loading}
              >
                {error ? (
                  <p className="cart-error" role="alert">
                    {error}
                  </p>
                ) : null}
                {lines.map((line) => (
                  <article className="cart-item" key={line.key}>
                    <Link
                      href={`/products/${line.product.id}?color=${encodeURIComponent(line.color)}`}
                      className="cart-itemImg"
                      aria-label={line.product.name}
                    >
                      {line.image ? (
                        <img src={line.image} alt={line.product.name} />
                      ) : (
                        <ProductVisual
                          product={line.product}
                          color={line.color}
                        />
                      )}
                    </Link>
                    <div className="cart-itemMeta">
                      <strong>{line.product.name}</strong>
                      <span>
                        {line.color} / {line.size}
                      </span>
                    </div>
                    <div className="cart-itemPrice">
                      {formatMoney(
                        line.unitPrice * line.quantity,
                        line.currency || currency,
                      )}
                    </div>
                    <div
                      className="cart-qty"
                      role="group"
                      aria-label={`${line.product.name} quantity`}
                    >
                      <button
                        type="button"
                        aria-label={`Decrease ${line.product.name} quantity`}
                        disabled={loading}
                        onClick={() =>
                          void setQuantity(line.key, line.quantity - 1).catch(
                            () => {},
                          )
                        }
                      >
                        −
                      </button>
                      <span aria-live="polite">{line.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Increase ${line.product.name} quantity`}
                        disabled={
                          loading || line.quantity >= line.availableQuantity
                        }
                        onClick={() =>
                          void setQuantity(line.key, line.quantity + 1).catch(
                            () => {},
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="cart-remove"
                      aria-label={`Remove ${line.product.name}`}
                      disabled={loading}
                      onClick={() => void removeItem(line.key).catch(() => {})}
                    >
                      Remove
                    </button>
                  </article>
                ))}
                {loading ? (
                  <p className="cart-note" role="status">
                    Updating your cart…
                  </p>
                ) : null}
              </div>
            </section>

            <aside
              className="customer-cart__summary"
              aria-labelledby="customer-cart-summary"
            >
              <h2 id="customer-cart-summary">Order summary</h2>
              <div className="balmoral-profile__card customer-order__card">
                <div className="cart-subtotal">
                  <span>Subtotal</span>
                  <strong>{formatMoney(subtotal, currency)}</strong>
                </div>
                {currency === store.currencyCode ? (
                  <p className="cart-note">
                    {qualified
                      ? "You've unlocked free shipping!"
                      : `Add ${formatMoney(remaining, currency)} to qualify for free shipping.`}
                  </p>
                ) : null}
                <p className="cart-note">
                  Shipping, taxes and discounts are calculated at checkout.
                </p>
                <p className="cart-note">
                  Using a buy/get code? Add both your paid items and gift items
                  to the bag. Checkout confirms eligible units and savings.
                </p>
                {loading ? (
                  <button type="button" className="cart-checkoutBtn" disabled>
                    Updating your cart…
                  </button>
                ) : (
                  <Link href="/checkout" className="cart-checkoutBtn">
                    Checkout ({count})
                  </Link>
                )}
              </div>
            </aside>
          </div>
        )}
      </section>
    </AccountShell>
  );
}
