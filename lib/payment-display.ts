export function paymentMethodLabel(method?: string) {
  return method === "CASH_ON_DELIVERY"
    ? "Cash on Delivery"
    : "Credit / Debit Card";
}

export function paymentStatusLabel(status?: string, method?: string) {
  if (method === "CASH_ON_DELIVERY" && status === "PENDING")
    return "Payment due on delivery";
  return (
    (
      {
        PAID: "Paid",
        PENDING: "Awaiting payment",
        INITIALIZED: "Awaiting payment",
        FAILED: "Payment unsuccessful",
        CANCELLED: "Payment cancelled",
        REFUNDED: "Refunded",
        PARTIALLY_REFUNDED: "Partially refunded",
        REVIEW: "Payment under review",
      } as Record<string, string>
    )[status ?? ""] ?? "Payment under review"
  );
}

export function orderStatusLabel(status?: string) {
  return (
    (
      {
        PENDING: "Awaiting payment",
        CONFIRMED: "Confirmed",
        PROCESSING: "Preparing your order",
        SHIPPED: "Shipped",
        IN_TRANSIT: "On the way",
        DELIVERED: "Delivered",
        CANCELLED: "Cancelled",
        PAYMENT_REVIEW: "Payment under review",
        RETURNED: "Returned",
        PARTIALLY_REFUNDED: "Partially refunded",
        REFUNDED: "Refunded",
      } as Record<string, string>
    )[status ?? ""] ?? "Preparing your order"
  );
}

export function shipmentStatusLabel(status?: string) {
  return (
    (
      {
        PENDING: "Preparing shipment",
        READY: "Ready to ship",
        SHIPPED: "Shipped",
        IN_TRANSIT: "On the way",
        DELIVERED: "Delivered",
        FAILED: "Delivery unsuccessful",
        RETURNED: "Returned",
      } as Record<string, string>
    )[status ?? ""] ?? "Shipping updates pending"
  );
}
