import { store } from "@/data/store";

export function formatMoney(amount: number, currency: string = store.currencyCode) {
  const normalizedCurrency = String(currency ?? store.currencyCode).toUpperCase();
  try {
    // Intl guarantees correct rounding (no 0.1+0.2 artifacts) and grouping.
    return new Intl.NumberFormat("en-EG", { style: "currency", currency: normalizedCurrency }).format(amount);
  } catch {
    const symbol = normalizedCurrency === "EGP" ? "EGP" : normalizedCurrency === "CAD" ? "CA$" : normalizedCurrency === "USD" ? "$" : normalizedCurrency;
    const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
    return `${symbol} ${rounded}`;
  }
}
