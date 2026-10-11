export type ApiErrorContext = "generic" | "recovery" | "login" | "register" | "session" | "password" | "cart" | "wishlist" | "checkout" | "profile" | "newsletter" | "returns" | "orders" | "catalog" | "admin";
export type ApiErrorKind = "http" | "network" | "timeout" | "cancelled" | "unexpected";

const actionMessages = {
  "studio-account": "Use ALTURA Studio to sign in with this account.",
  "studio-forbidden": "This account does not have permission to access ALTURA Studio.",
  "signin-required": "Please sign in to continue.",
  "session-expired": "Your session has expired. Please sign in again.",
  "session-unavailable": "We couldn't start your session. Please try again.",
  "shipping-required": "Please select a shipping method to continue.",
  "quote-changed": "Your order total has changed. Review the pending order before trying again. Payment was not started.",
  "mock-only": "Card payment is temporarily unavailable. Please try again later.",
  "payment-unconfirmed": "We couldn't confirm your payment. Check your order before trying again.",
} as const;

/** Only explicitly approved local UI messages can pass through this error type. */
export class UserActionError extends Error {
  constructor(readonly code: keyof typeof actionMessages) {
    super(actionMessages[code]);
    this.name = "UserActionError";
  }
}

function messageFor(status: number, kind: ApiErrorKind, context: ApiErrorContext): string {
  if (context === "recovery" && status === 400) return "This reset link is invalid or expired. Please request a new link.";
  if (context === "recovery" && status === 503) return "Password recovery is temporarily unavailable. Please try again later.";
  if (kind === "timeout" || status === 408 || status === 504) return "This is taking longer than expected. Please try again.";
  if (kind === "network" || status === 502 || status === 503) return "We couldn't connect to ALTURA. Please try again in a moment.";
  if (kind === "cancelled") return "The request was cancelled. Please try again.";
  if (status === 401) {
    if (context === "login") return "The email or password is incorrect. Please try again.";
    if (context === "password") return "Please check your current password and choose a different new password.";
    return "Your session has expired. Please sign in again.";
  }
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) {
    if (context === "orders" || context === "returns") return "We couldn't find that order or return. Check the details and try again.";
    if (context === "catalog") return "This product is no longer available.";
    return "We couldn't find what you requested. Refresh the page and try again.";
  }
  if (status === 400 || status === 422) {
    if (context === "login") return "Please enter a valid email address and password.";
    if (context === "register") return "Please check your email, password and account details.";
    if (context === "checkout") return "Please check your checkout details, shipping method and discount code.";
    if (context === "cart") return "Please review your cart and selected quantities.";
    if (context === "newsletter") return "Please enter a valid email address.";
    if (context === "returns") return "Please check the selected items and return details.";
    return "Please check your details and try again.";
  }
  if (status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (status === 409) {
    if (context === "register") return "This email is already registered. Please sign in or use another email.";
    if (context === "checkout") return "Your checkout has changed. Review your cart and order before trying again.";
    if (context === "cart") return "Your cart has changed. Refresh it and try again.";
    return "These details have changed or are already in use. Refresh and try again.";
  }
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return "We couldn't complete that request. Please try again.";
}

export class CommerceApiError extends Error {
  constructor(readonly status: number, readonly context: ApiErrorContext = "generic", readonly kind: ApiErrorKind = "http", readonly details?: unknown) {
    super(messageFor(status, kind, context));
    this.name = "CommerceApiError";
  }
}

export function apiErrorContext(path: string): ApiErrorContext {
  if (path.startsWith("/auth/forgot-password") || path.startsWith("/auth/reset-password")) return "recovery";
  if (path.startsWith("/auth/login")) return "login";
  if (path.startsWith("/auth/register")) return "register";
  if (path.startsWith("/auth/")) return "session";
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/cart") || path.startsWith("/commerce-session")) return "cart";
  if (path.startsWith("/wishlist")) return "wishlist";
  if (path.startsWith("/checkout") || path.startsWith("/payments")) return "checkout";
  if (path === "/users/me/password") return "password";
  if (path.startsWith("/users")) return "profile";
  if (path.startsWith("/newsletter")) return "newsletter";
  if (path.startsWith("/returns")) return "returns";
  if (path.startsWith("/orders")) return "orders";
  if (path.startsWith("/catalog")) return "catalog";
  return "generic";
}

function redact(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, "$1[redacted]@")
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[redacted-token]")
    .replace(/\b(?:sk_live_|sk_test_|whsec_|ghp_|github_pat_)[\w-]+/g, "[redacted-key]")
    .replace(/((?:["']?)(?:[\w-]*(?:password|secret|token|api[_-]?key)|authorization|cookie)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1[redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[redacted-email]");
}

/** Preserve diagnostic message/stack in development, without request bodies or credentials. */
export function logApiError(error: unknown, path = "UI"): void {
  if (process.env.NODE_ENV === "production") return;
  const details = error instanceof CommerceApiError ? error.details : error;
  let technical: string;
  if (details instanceof Error) technical = details.stack || `${details.name}: ${details.message}`;
  else if (details && typeof details === "object" && "message" in details) technical = JSON.stringify(details.message) || "Unspecified backend error";
  else technical = typeof details === "string" ? details : error instanceof Error ? error.stack || error.message : "Unknown error";
  console.warn("[ALTURA API]", {
    path: redact(path.split("?")[0]),
    status: error instanceof CommerceApiError ? error.status : undefined,
    category: error instanceof CommerceApiError ? error.kind : "unexpected",
    technical: redact(technical),
  });
}

/** Never use an arbitrary Error.message or backend response as display copy. */
export function getUserErrorMessage(error: unknown, context: ApiErrorContext = "generic"): string {
  if (error instanceof UserActionError) return actionMessages[error.code];
  if (error instanceof CommerceApiError) return messageFor(error.status, error.kind, error.context === "generic" ? context : error.context);
  logApiError(error);
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return messageFor(0, "timeout", context);
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return messageFor(0, "network", context);
  return messageFor(0, "unexpected", context);
}

export function cartIssueMessage(code: string): string {
  switch (code) {
    case "PRODUCT_UNAVAILABLE": return "An item in your cart is no longer available.";
    case "VARIANT_UNAVAILABLE": return "A selected size or color is no longer available.";
    case "OUT_OF_STOCK": return "An item in your cart is out of stock.";
    case "QUANTITY_REDUCED": return "An item quantity was reduced to match available stock.";
    default: return "Some items in your cart need attention. Please review your cart.";
  }
}
