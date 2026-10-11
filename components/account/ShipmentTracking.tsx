"use client";

import { shipmentStatusLabel } from "@/lib/payment-display";

export type OrderShipment = {
  status: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier?: string | null;
  service?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
};

export function ShipmentTracking({ shipment }: { shipment: OrderShipment }) {
  if (!shipment.trackingNumber) return null;
  let carrierUrl: string | null = null;
  try {
    const url = new URL(shipment.trackingUrl ?? "");
    if (url.protocol === "https:" || url.protocol === "http:")
      carrierUrl = url.href;
  } catch {
    /* A shipment can have a tracking number without a carrier URL. */
  }

  const label = `Track shipment · ${shipment.trackingNumber}`;
  if (carrierUrl)
    return (
      <a
        className="customer-order__link"
        href={carrierUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {label} ↗
      </a>
    );

  const date = (value: string) =>
    new Date(value).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  return (
    <details className="customer-order__tracking">
      <summary>{label}</summary>
      <div className="customer-order__tracking-content">
        <p>Carrier tracking is unavailable for this local shipment.</p>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{shipmentStatusLabel(shipment.status)}</dd>
          </div>
          {shipment.carrier && (
            <div>
              <dt>Carrier</dt>
              <dd>{shipment.carrier}</dd>
            </div>
          )}
          {shipment.service && (
            <div>
              <dt>Service</dt>
              <dd>{shipment.service}</dd>
            </div>
          )}
        </dl>
        {shipment.shippedAt && <p>Shipped {date(shipment.shippedAt)}</p>}
        {shipment.deliveredAt && <p>Delivered {date(shipment.deliveredAt)}</p>}
      </div>
    </details>
  );
}
