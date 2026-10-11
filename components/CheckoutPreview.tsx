"use client";

import { PromotionBreakdown } from "./PromotionBreakdown";
import type { PromotionLine, PromotionSummary } from "@/lib/promotion-types";
import { LoadingState } from "@/components/LoadingState";
import { getUserErrorMessage, UserActionError } from "@/lib/api-errors";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "./CartProvider";
import { ProductVisual } from "./ProductVisual";
import { BagIcon } from "./BagIcon";
import { INFO_LINKS, InfoModal, type InfoKey } from "./InfoModal";
import { commerceFetch } from "@/lib/commerce-api";
import { useCustomerAuth } from "./account/CustomerAuthProvider";
import { store } from "@/data/store";
import { REGIONS, storedCountryCode } from "./regions";
import { formatMoney } from "@/lib/money";

function fmt(amount: number, currency: string) {
  return formatMoney(Number(amount.toFixed(2)), currency);
}

function CheckoutHeader() {
  return (
    <header className="bchk-topbar">
      <Link href="/" className="bchk-brand">
        ALTURA
      </Link>
      <Link href="/cart" className="bchk-bag" aria-label="Cart">
        <BagIcon size={22} />
      </Link>
    </header>
  );
}

function ChevronDown() {
  return (
    <svg
      className="bchk-chevron"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 5.5 7 9.5 11 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="bchk-lock"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function Hint({
  text,
  align = "right",
}: {
  text: string;
  align?: "left" | "right";
}) {
  return (
    <span className="bchk-hintWrap" tabIndex={0}>
      <span className="bchk-help" aria-hidden="true">
        ?
      </span>
      <span
        className={`bchk-hintBubble${align === "left" ? " bchk-hintBubble--left" : ""}`}
        role="tooltip"
      >
        {text}
      </span>
    </span>
  );
}

function Field({
  error,
  className = "",
  children,
}: {
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bchk-cell">
      <div
        className={`bchk-field ${className}${error ? " is-error" : ""}`.trim()}
      >
        {children}
      </div>
      {error ? <p className="bchk-fieldErr">{error}</p> : null}
    </div>
  );
}

type ShippingMethod = {
  id: string;
  code: string;
  name: string;
  currency: string;
  price: number;
  free: boolean;
  estimatedMinDays: number | null;
  estimatedMaxDays: number | null;
};
type Quote = {
  currency: string;
  itemCount: number;
  items: Array<{
    variantId: string;
    productName: string;
    colorName: string;
    size: string;
    unitPrice: number;
    lineTotal: number;
    quantity: number;
    promotion?: PromotionLine | null;
  }>;
  shipping: ShippingMethod;
  discount: {
    code: string | null;
    type?: string | null;
    promotion?: PromotionSummary | null;
    itemDiscount: number;
    shippingDiscount: number;
  };
  totals: {
    subtotal: number;
    discountTotal: number;
    shippingTotal: number;
    taxTotal: number;
    grandTotal: number;
  };
};

export function CheckoutPreview() {
  const router = useRouter();
  const { state: authState, user, apiFetch, logout } = useCustomerAuth();
  const {
    lines,
    subtotal,
    currency,
    loading: cartLoading,
    refreshCart,
  } = useCart();

  const [email, setEmail] = useState("");
  const [country, setCountry] = useState(
    () => storedCountryCode(store.countryCode) as typeof store.countryCode,
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");
  const [region, setRegion] = useState("");
  const [phone, setPhone] = useState("");
  const [discount, setDiscount] = useState("");
  const [quoted, setQuoted] = useState<{ key: string; data: Quote } | null>(
    null,
  );
  const [quoteFailure, setQuoteFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingMethodId, setShippingMethodId] = useState("");
  const [shippingError, setShippingError] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "CARD" | "CASH_ON_DELIVERY"
  >("CARD");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [cardName, setCardName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [discountApplied, setDiscountApplied] = useState(false);
  const [discountError, setDiscountError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [infoModal, setInfoModal] = useState<InfoKey | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const checkoutKeys = useRef<{ order: string; payment: string } | null>(null);

  function newIdempotencyKey(prefix: string) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    setKebabOpen(false);
    try {
      await logout();
      setEmail("");
    } catch (caught) {
      setError(getUserErrorMessage(caught, "session"));
    } finally {
      setSigningOut(false);
    }
  }

  function clearErr(key: string) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      if (authState === "authenticated") return apiFetch<T>(path, init);
      return commerceFetch<T>(path, init);
    },
    [authState, apiFetch],
  );

  const isSignedIn = authState === "authenticated";

  useEffect(() => {
    if (authState === "authenticated" && user?.email) setEmail(user.email);
  }, [authState, user?.email]);

  const cartSignature = JSON.stringify(
    lines.map((line) => [
      line.variantId,
      line.quantity,
      line.unitPrice,
      currency,
    ]),
  );
  const hasAddress = Boolean(
    firstName.trim() && lastName.trim() && address.trim() && city.trim(),
  );
  const quoteBody = JSON.stringify({
    email: email.trim().toLowerCase() || undefined,
    phone: phone.trim() || undefined,
    shippingAddress: {
      recipientName: `${firstName} ${lastName}`.trim(),
      phone: phone.trim() || undefined,
      line1: address.trim(),
      city: city.trim(),
      region: region || undefined,
      postalCode: postal.trim() || undefined,
      countryCode: country,
    },
    shippingMethodId,
    discountCode: discountApplied ? discount.trim().toUpperCase() : undefined,
  });
  // A quote is current only for the exact cart, owner and inputs that produced it.
  // Derive validity during render so stale totals cannot flash before an effect runs.
  const quoteKey = JSON.stringify([
    cartSignature,
    quoteBody,
    discount,
    authState,
    user?.id,
    cartLoading,
  ]);
  const currentQuoteKey = useRef(quoteKey);
  currentQuoteKey.current = quoteKey;
  const quote = quoted?.key === quoteKey ? quoted.data : null;
  const quoteError = quoteFailure?.key === quoteKey ? quoteFailure.message : "";
  const canQuote =
    hasAddress &&
    Boolean(email.trim() && shippingMethodId && lines.length) &&
    authState !== "loading" &&
    !cartLoading;

  useEffect(() => {
    let cancelled = false;
    setShippingMethods([]);
    if (!lines.length || authState === "loading" || cartLoading) return;
    void request<{ methods: ShippingMethod[] }>("/checkout/shipping-methods", {
      method: "POST",
      body: JSON.stringify({ countryCode: country }),
    })
      .then((r) => {
        if (cancelled) return;
        setShippingError("");
        setShippingMethods(r.methods);
        setShippingMethodId((current) =>
          r.methods.some((method) => method.id === current)
            ? current
            : (r.methods[0]?.id ?? ""),
        );
      })
      .catch((caught) => {
        if (cancelled) return;
        setShippingMethodId("");
        setShippingError(getUserErrorMessage(caught, "checkout"));
      });
    return () => {
      cancelled = true;
    };
  }, [authState, country, cartSignature, cartLoading, request, lines.length]);

  useEffect(() => {
    if (!canQuote) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void request<Quote>("/checkout/quote", {
        method: "POST",
        body: quoteBody,
      })
        .then((data) => {
          if (cancelled) return;
          setQuoted({ key: quoteKey, data });
          setQuoteFailure(null);
        })
        .catch((caught) => {
          if (cancelled) return;
          const message = getUserErrorMessage(caught, "checkout");
          setQuoteFailure({ key: quoteKey, message });
          if (discountApplied) {
            setDiscountError(message);
            setDiscountApplied(false);
          }
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canQuote, quoteKey, quoteBody, request, discountApplied]);

  useEffect(() => {
    setCartCount(lines.reduce((s, l) => s + l.quantity, 0));
  }, [lines]);

  const displayItems =
    quote?.items ??
    lines.map((l) => ({
      variantId: l.variantId,
      productName: l.product.name,
      colorName: l.color,
      size: l.size,
      unitPrice: l.unitPrice,
      lineTotal: l.unitPrice * l.quantity,
      quantity: l.quantity,
      promotion: null as PromotionLine | null,
    }));
  const totals = quote?.totals;
  const itemCount =
    quote?.itemCount ?? displayItems.reduce((s, i) => s + i.quantity, 0);
  const displayCurrency = quote?.currency ?? currency;

  async function handleApplyDiscount() {
    if (!discount.trim() || discountApplied) return;
    if (!email.trim()) {
      setFieldErrors((prev) => ({
        ...prev,
        email: "Enter your email address first",
      }));
      setError("");
      requestAnimationFrame(() => {
        document
          .querySelector(".bchk-emailField input")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    if (!hasAddress || !shippingMethodId) {
      setDiscountError(
        "Enter your delivery address and select shipping first.",
      );
      return;
    }
    setDiscountError("");
    setDiscountApplied(true);
  }

  async function handlePay(e: FormEvent) {
    e.preventDefault();
    if (!lines.length) return;
    const fe: Record<string, string> = {};
    if (!email.trim()) fe.email = "Enter an email address";
    if (!firstName.trim()) fe.firstName = "Enter a first name";
    if (!lastName.trim()) fe.lastName = "Enter a last name";
    if (!address.trim()) fe.address = "Enter an address";
    if (!city.trim()) fe.city = "Enter a city";
    if (!region) fe.region = "Select a state / province";
    if (!phone.trim()) fe.phone = "Enter a phone number";
    if (paymentMethod === "CARD") {
      if (!cardNumber.trim()) fe.cardNumber = "Enter a card number";
      if (!exp.trim()) fe.exp = "Enter an expiry date";
      if (!cvc.trim()) fe.cvc = "Enter a security code";
      if (!cardName.trim()) fe.cardName = "Enter the name on the card";
    }
    setFieldErrors(fe);
    if (Object.keys(fe).length) {
      setError("");
      requestAnimationFrame(() => {
        document
          .querySelector(".bchk-field.is-error")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const keys = checkoutKeys.current ?? {
        order: newIdempotencyKey("altura-order"),
        payment: newIdempotencyKey("altura-payment"),
      };
      checkoutKeys.current = keys;
      const shipId = shippingMethodId || shippingMethods[0]?.id;
      if (!shipId) throw new UserActionError("shipping-required");
      const submittedKey = quoteKey;
      const q = await request<Quote>("/checkout/quote", {
        method: "POST",
        body: quoteBody,
      });
      if (currentQuoteKey.current !== submittedKey) {
        setError(
          "Your checkout details changed. Review the updated quote before paying.",
        );
        return;
      }
      setQuoted({ key: submittedKey, data: q });
      if (
        !quote ||
        JSON.stringify(q.totals) !== JSON.stringify(quote.totals) ||
        q.currency !== quote.currency ||
        JSON.stringify(q.items) !== JSON.stringify(quote.items)
      ) {
        setError("Your quote changed. Review the updated total and pay again.");
        return;
      }
      const ord = await request<{
        order: {
          orderNumber: string;
          email: string;
          currency: string;
          totals: Quote["totals"];
        };
      }>("/checkout/place-order", {
        method: "POST",
        headers: { "Idempotency-Key": keys.order },
        body: JSON.stringify({
          email: email.trim().toLowerCase() || undefined,
          shippingAddress: {
            recipientName: `${firstName} ${lastName}`.trim(),
            phone: phone || undefined,
            line1: address,
            city,
            region: region || undefined,
            postalCode: postal || undefined,
            countryCode: country,
          },
          shippingMethodId: shipId,
          discountCode: discountApplied
            ? discount.trim().toUpperCase()
            : undefined,
          paymentMethod,
        }),
      });
      if (
        ord.order.currency !== q.currency ||
        JSON.stringify(ord.order.totals) !== JSON.stringify(q.totals)
      ) {
        setQuoted(null);
        setQuoteFailure({
          key: submittedKey,
          message: `Order ${ord.order.orderNumber} has a different server total. Payment was not started. Review the pending order before retrying.`,
        });
        throw new UserActionError("quote-changed");
      }
      if (paymentMethod === "CARD") {
        const pay = await request<{
          payment: { id: string };
          checkout: { mode: string };
        }>("/payments/initialize", {
          method: "POST",
          headers: { "Idempotency-Key": keys.payment },
          body: JSON.stringify({
            orderNumber: ord.order.orderNumber,
            email: email.trim() || undefined,
          }),
        });
        if (pay.checkout.mode !== "mock")
          throw new UserActionError("mock-only");
        const done = await request<{ status: string }>(
          `/payments/mock/${encodeURIComponent(pay.payment.id)}/complete`,
          {
            method: "POST",
            body: JSON.stringify({
              outcome: "paid",
              email: email.trim().toLowerCase() || undefined,
            }),
          },
        );
        if (done.status !== "PAID")
          throw new UserActionError("payment-unconfirmed");
      }
      checkoutKeys.current = null;
      await refreshCart();
      router.push(
        `/order-confirmation/${encodeURIComponent(ord.order.orderNumber)}?email=${encodeURIComponent(email.trim())}`,
      );
    } catch (caught) {
      setError(getUserErrorMessage(caught, "checkout"));
    } finally {
      setBusy(false);
    }
  }

  if (!lines.length && !quote) {
    return (
      <main className="bchk customer-checkout">
        <CheckoutHeader />
        <div className="customer-checkout__intro">
          <h1>Checkout</h1>
        </div>
        <div className="customer-checkout__empty">
          <div className="balmoral-profile__card customer-order__card">
            {cartLoading ? (
              <LoadingState message="Loading checkout…" compact />
            ) : (
              <>
                <h2>Your bag is empty.</h2>
                <p className="customer-order__muted">
                  Add something to your bag to continue to checkout.
                </p>
                <Link
                  href="/collections/shopall"
                  className="balmoral-orders__shopNow"
                >
                  Shop all
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  const subtotalVal = totals?.subtotal ?? subtotal;

  return (
    <main className="bchk customer-checkout">
      <CheckoutHeader />

      <div className="customer-checkout__intro">
        <Link href="/cart" className="customer-order__link">
          ← Back to bag
        </Link>
        <h1>Checkout</h1>
        <p className="customer-order__muted">
          Complete your delivery details and choose how you would like to pay.
        </p>
      </div>
      <div className="bchk-layout">
        {/* LEFT */}
        <section className="bchk-left">
          {/* Contact / Email */}
          {isSignedIn ? (
            <div className="bchk-emailRow balmoral-profile__card">
              <span className="bchk-avatar">
                {email.charAt(0).toUpperCase()}
              </span>
              <span className="bchk-email">{email}</span>
              <span className="bchk-kebabWrap">
                <button
                  type="button"
                  className="bchk-kebab"
                  aria-label="Email options"
                  disabled={signingOut}
                  aria-expanded={kebabOpen}
                  onClick={() => setKebabOpen((v) => !v)}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="5" r="2" fill="currentColor" />
                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                    <circle cx="12" cy="19" r="2" fill="currentColor" />
                  </svg>
                </button>
                {kebabOpen ? (
                  <span className="bchk-kebabMenu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleSignOut()}
                    >
                      Sign out
                    </button>
                  </span>
                ) : null}
              </span>
            </div>
          ) : (
            <div className="bchk-contact balmoral-profile__card customer-order__card">
              <div className="bchk-contactHead">
                <h2 className="bchk-h2">Contact</h2>
                <Link
                  className="bchk-signIn"
                  href="/account/login?next=/checkout"
                >
                  Sign in
                </Link>
              </div>
              <Field error={fieldErrors.email} className="bchk-emailField">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearErr("email");
                  }}
                  autoComplete="email"
                />
                <Hint text="Use the same email to view and track your order." />
              </Field>
            </div>
          )}
          {kebabOpen ? (
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className="bchk-kebabScrim"
              onClick={() => setKebabOpen(false)}
            />
          ) : null}

          <form onSubmit={handlePay} noValidate>
            <section
              className="customer-checkout__section"
              aria-labelledby="checkout-delivery-title"
            >
              <h2 className="bchk-h2" id="checkout-delivery-title">
                Delivery
              </h2>
              <div className="balmoral-profile__card customer-order__card customer-checkout__address">
                <Field className="bchk-field--select">
                  <label>Country/Region</label>
                  <select
                    value={country}
                    onChange={(e) => {
                      setCountry(e.target.value as typeof country);
                      setRegion("");
                      clearErr("region");
                    }}
                  >
                    <option value="EG">Egypt</option>
                    <option value="SV">El Salvador</option>
                    <option value="US">United States</option>
                    <option value="CA">Canada</option>
                  </select>
                  <ChevronDown />
                </Field>

                <div className="bchk-row2">
                  <Field error={fieldErrors.firstName}>
                    <input
                      placeholder="First name"
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        clearErr("firstName");
                      }}
                      autoComplete="given-name"
                    />
                  </Field>
                  <Field error={fieldErrors.lastName}>
                    <input
                      placeholder="Last name"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        clearErr("lastName");
                      }}
                      autoComplete="family-name"
                    />
                  </Field>
                </div>

                <Field error={fieldErrors.address}>
                  <input
                    placeholder="Address"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      clearErr("address");
                    }}
                    autoComplete="street-address"
                  />
                </Field>

                <div className="bchk-row3">
                  <Field error={fieldErrors.city}>
                    <input
                      placeholder="City"
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        clearErr("city");
                      }}
                      autoComplete="address-level2"
                    />
                  </Field>
                  <Field>
                    <input
                      placeholder="Postal code (optional)"
                      value={postal}
                      onChange={(e) => setPostal(e.target.value)}
                      autoComplete="postal-code"
                    />
                  </Field>
                  <Field
                    error={fieldErrors.region}
                    className="bchk-field--select"
                  >
                    <select
                      value={region}
                      data-empty={!region}
                      onChange={(e) => {
                        setRegion(e.target.value);
                        clearErr("region");
                      }}
                      aria-label="Region"
                    >
                      <option value="">Region</option>
                      {(REGIONS[country] ?? []).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <ChevronDown />
                  </Field>
                </div>

                <Field error={fieldErrors.phone} className="bchk-field--phone">
                  <input
                    placeholder="Phone"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      clearErr("phone");
                    }}
                    autoComplete="tel"
                  />
                  <Hint text="In case we need to contact you about your order." />
                </Field>
              </div>
            </section>
            <section
              className="customer-checkout__section"
              aria-labelledby="checkout-shipping-title"
            >
              <h2 className="bchk-h2" id="checkout-shipping-title">
                Shipping method
              </h2>
              <div className="bchk-shipPlaceholder balmoral-profile__card customer-order__card">
                {hasAddress && shippingMethods.length ? (
                  <div className="bchk-shipList">
                    {shippingMethods.map((m) => (
                      <label
                        key={m.id}
                        className={`bchk-shipRow ${shippingMethodId === m.id ? "is-active" : ""}`}
                      >
                        <input
                          type="radio"
                          name="ship"
                          checked={shippingMethodId === m.id}
                          onChange={() => setShippingMethodId(m.id)}
                        />
                        <span className="bchk-payDot" aria-hidden="true" />
                        <span>{m.name}</span>
                        <b>
                          {quote?.shipping.id === m.id &&
                          quote.totals.shippingTotal === 0
                            ? "Free"
                            : fmt(m.price, m.currency)}
                        </b>
                      </label>
                    ))}
                  </div>
                ) : shippingError ? (
                  <p className="bchk-error" role="alert">
                    {shippingError}
                  </p>
                ) : hasAddress ? (
                  "No shipping methods are available for this destination."
                ) : (
                  "Enter your shipping address to view available shipping methods."
                )}
              </div>
            </section>
            <section
              className="customer-checkout__section"
              aria-labelledby="checkout-payment-title"
            >
              <h2 className="bchk-h2" id="checkout-payment-title">
                Payment
              </h2>
              <div className="bchk-payBox balmoral-profile__card customer-order__card">
                <fieldset className="bchk-payMethods">
                  <legend className="bchk-secure">Payment method</legend>
                  {(["CARD", "CASH_ON_DELIVERY"] as const).map((method) => (
                    <label
                      key={method}
                      className={`bchk-payMethod${paymentMethod === method ? " is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method}
                        checked={paymentMethod === method}
                        disabled={busy}
                        onChange={() => {
                          setPaymentMethod(method);
                          setError("");
                          setFieldErrors((previous) =>
                            Object.fromEntries(
                              Object.entries(previous).filter(
                                ([key]) =>
                                  ![
                                    "cardNumber",
                                    "exp",
                                    "cvc",
                                    "cardName",
                                  ].includes(key),
                              ),
                            ),
                          );
                        }}
                      />
                      <span className="bchk-payDot" aria-hidden="true" />
                      {method === "CARD"
                        ? "Credit / Debit Card"
                        : "Cash on Delivery"}
                    </label>
                  ))}
                </fieldset>
                {paymentMethod === "CARD" ? (
                  <div className="bchk-payCollapse is-open">
                    <div className="bchk-payCollapseInner">
                      <div className="bchk-cardForm">
                        <Field error={fieldErrors.cardNumber}>
                          <input
                            placeholder="Card number"
                            value={cardNumber}
                            onChange={(e) => {
                              setCardNumber(e.target.value);
                              clearErr("cardNumber");
                            }}
                            inputMode="numeric"
                            autoComplete="off"
                          />
                          <LockIcon />
                        </Field>
                        <div className="bchk-row2">
                          <Field error={fieldErrors.exp}>
                            <input
                              placeholder="Expiration date (MM / YY)"
                              value={exp}
                              onChange={(e) => {
                                setExp(e.target.value);
                                clearErr("exp");
                              }}
                              autoComplete="off"
                            />
                          </Field>
                          <Field error={fieldErrors.cvc}>
                            <input
                              placeholder="Security code"
                              value={cvc}
                              onChange={(e) => {
                                setCvc(e.target.value);
                                clearErr("cvc");
                              }}
                              inputMode="numeric"
                              autoComplete="off"
                            />
                            <Hint text="The security code is usually printed on the back of your card." />
                          </Field>
                        </div>
                        <Field error={fieldErrors.cardName}>
                          <input
                            placeholder="Name on card"
                            value={cardName}
                            onChange={(e) => {
                              setCardName(e.target.value);
                              clearErr("cardName");
                            }}
                            autoComplete="off"
                          />
                        </Field>
                        <p className="bchk-secure">
                          Billing address is the same as shipping address.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="bchk-secure" style={{ padding: 16 }}>
                    Pay with cash when your order arrives.
                  </p>
                )}
              </div>
            </section>
            {error ? (
              <p className="bchk-error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="bchk-pay"
              disabled={busy || !quote}
            >
              {busy
                ? "Processing…"
                : paymentMethod === "CARD"
                  ? "Pay now"
                  : "Place order"}
            </button>

            <div className="bchk-links">
              {INFO_LINKS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setInfoModal(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </form>
        </section>

        {/* RIGHT */}
        <aside className="bchk-right" aria-labelledby="checkout-summary-title">
          <h2 className="bchk-h2" id="checkout-summary-title">
            Order summary
          </h2>
          <div className="balmoral-profile__card customer-order__card customer-checkout__summary">
            <div className="bchk-items">
              {displayItems.map((item) => {
                const line = lines.find((l) => l.variantId === item.variantId);
                return (
                  <div key={item.variantId} className="bchk-item">
                    <div className="bchk-thumb">
                      {line ? (
                        <ProductVisual
                          product={line.product}
                          color={line.color}
                        />
                      ) : (
                        <span />
                      )}
                      <span className="bchk-qty">{item.quantity}</span>
                    </div>
                    <div className="bchk-itemMeta">
                      <strong>{item.productName}</strong>
                      <span>
                        {item.colorName} / {item.size}
                      </span>
                      {item.promotion && item.promotion.savings > 0 ? (
                        <span>
                          {item.promotion.freeUnits} free{" "}
                          {item.promotion.freeUnits === 1 ? "unit" : "units"} ·
                          Save {fmt(item.promotion.savings, displayCurrency)}
                        </span>
                      ) : null}
                    </div>
                    <span className="bchk-itemPrice">
                      {item.promotion && item.promotion.savings > 0 ? (
                        <>
                          <s>{fmt(item.lineTotal, displayCurrency)}</s>
                          <br />
                          {fmt(item.promotion.payableTotal, displayCurrency)}
                        </>
                      ) : (
                        fmt(item.lineTotal, displayCurrency)
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="bchk-discount">
              <div className="bchk-discountCell">
                <input
                  className={discountError ? "is-error" : ""}
                  placeholder="Discount code"
                  value={discount}
                  onChange={(e) => {
                    setDiscount(e.target.value);
                    setDiscountApplied(false);
                    setDiscountError("");
                  }}
                  disabled={discountApplied}
                  aria-invalid={Boolean(discountError)}
                />
                {discountError ? (
                  <p className="bchk-discountErr">{discountError}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleApplyDiscount}
                disabled={busy || discountApplied}
                className={
                  discountApplied
                    ? "is-applied"
                    : discount.trim()
                      ? "is-ready"
                      : ""
                }
              >
                {discountApplied ? "✓ Applied" : "Apply"}
              </button>
              {discountApplied ? (
                <button
                  type="button"
                  onClick={() => {
                    setDiscountApplied(false);
                    setDiscount("");
                  }}
                >
                  Remove discount
                </button>
              ) : null}
            </div>

            {quote?.discount.promotion ? (
              <PromotionBreakdown
                promotion={quote.discount.promotion}
                currency={displayCurrency}
              />
            ) : null}
            <div
              className="bchk-totals"
              aria-live="polite"
              aria-busy={canQuote && !quote && !quoteError}
              data-quote-status={
                quote ? "current" : quoteError ? "error" : "pending"
              }
            >
              <div>
                <span>Subtotal · {itemCount} items</span>
                <span>{fmt(subtotalVal, displayCurrency)}</span>
              </div>
              <div>
                <span className="bchk-shipLabel">
                  Shipping{" "}
                  <button
                    type="button"
                    className="bchk-help"
                    aria-label="Shipping information"
                    onClick={() => setInfoModal("shipping")}
                  >
                    ?
                  </button>
                </span>
                <span className="bchk-muted">
                  {totals
                    ? totals.shippingTotal === 0
                      ? "Free"
                      : fmt(totals.shippingTotal, displayCurrency)
                    : hasAddress
                      ? "Awaiting quote"
                      : "Enter shipping address"}
                </span>
              </div>
              {totals && totals.discountTotal > 0 ? (
                <div>
                  <span>Discount</span>
                  <span>−{fmt(totals.discountTotal, displayCurrency)}</span>
                </div>
              ) : null}
              <div className="bchk-total">
                <span>Total</span>
                <span>
                  {totals
                    ? fmt(totals.grandTotal, displayCurrency)
                    : "Awaiting quote"}
                </span>
              </div>
              {quoteError ? (
                <p className="bchk-error" role="alert">
                  {quoteError}
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      <InfoModal modalKey={infoModal} onClose={() => setInfoModal(null)} />

      {signingOut ? (
        <div
          className="bchk-overlay"
          role="status"
          aria-live="polite"
          aria-label="Signing out"
        >
          <span className="bchk-spinner" aria-hidden="true" />
        </div>
      ) : null}
    </main>
  );
}
