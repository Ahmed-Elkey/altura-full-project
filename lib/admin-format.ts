export function adminMoney(value: number, currency = "EGP") {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function adminDate(value: string | Date | null | undefined, withTime = true) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-EG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function adminName(firstName?: string | null, lastName?: string | null, fallback = "Customer") {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || fallback;
}
