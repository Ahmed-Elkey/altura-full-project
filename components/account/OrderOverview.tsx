"use client";

import { PromotionBreakdown } from "../PromotionBreakdown";
import type { PromotionLine, PromotionSummary } from "@/lib/promotion-types";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import {
  shipmentStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
} from "@/lib/payment-display";
import { ShipmentTracking, type OrderShipment } from "./ShipmentTracking";

export type CustomerOrder = {
  orderNumber: string;
  status: string;
  email: string;
  currency: string;
  createdAt: string;
  placedAt: string | null;
  paymentMethod?: string;
  paymentStatus?: string;
  promotion?: PromotionSummary | null;
  totals: {
    subtotal: number;
    shippingTotal: number;
    discountTotal: number;
    taxTotal: number;
    grandTotal: number;
  };
  items: {
    id: string;
    productName: string;
    colorName: string | null;
    size: string | null;
    productImageUrl: string | null;
    quantity: number;
    lineTotal: number;
    promotion?: PromotionLine | null;
    promotionAllocation?: Array<{
      discount: number;
      bundle: string | null;
    }> | null;
  }[];
  shipments: OrderShipment[];
  // Guest lookup deliberately omits addresses and payments.
  addresses?: {
    type: string;
    recipientName: string;
    line1: string;
    line2: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    countryCode: string;
  }[];
};

export function orderDate(value: string) {
  return new Date(value).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function OrderOverview({
  order,
  allowReturn = false,
}: {
  order: CustomerOrder;
  allowReturn?: boolean;
}) {
  const shipping = order.addresses?.find(
    (address) => address.type === "SHIPPING",
  );
  return (
    <div className="customer-order__sections">
      <section aria-labelledby="order-items-title">
        <div className="balmoral-profile__head">
          <h2 id="order-items-title">Items</h2>
          <span className="customer-order__muted">
            {order.items.reduce((total, item) => total + item.quantity, 0)}{" "}
            items
          </span>
        </div>
        <div className="balmoral-profile__card customer-order__card customer-order__items">
          {order.items.map((item) => (
            <div className="customer-order__item" key={item.id}>
              <div className="customer-order__image">
                {item.productImageUrl ? (
                  <img src={item.productImageUrl} alt={item.productName} />
                ) : (
                  <span>ALTURA</span>
                )}
              </div>
              <div className="customer-order__item-info">
                <strong>{item.productName}</strong>
                <span>
                  {[item.colorName, item.size].filter(Boolean).join(" / ")}
                </span>
                <span>Quantity: {item.quantity}</span>
                {item.promotion && item.promotion.savings > 0 ? (
                  <span>
                    {item.promotion.freeUnits} free{" "}
                    {item.promotion.freeUnits === 1 ? "unit" : "units"} · Save{" "}
                    {formatMoney(item.promotion.savings, order.currency)}
                  </span>
                ) : null}
              </div>
              <strong className="customer-order__price">
                {item.promotion && item.promotion.savings > 0 ? (
                  <>
                    <s>{formatMoney(item.lineTotal, order.currency)}</s>
                    <br />
                    {formatMoney(item.promotion.payableTotal, order.currency)}
                  </>
                ) : (
                  formatMoney(item.lineTotal, order.currency)
                )}
              </strong>
            </div>
          ))}
        </div>
      </section>
      <section aria-labelledby="order-summary-title">
        <div className="balmoral-profile__head">
          <h2 id="order-summary-title">Order summary</h2>
        </div>
        <dl className="balmoral-profile__card customer-order__card customer-order__totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoney(order.totals.subtotal, order.currency)}</dd>
          </div>
          <div>
            <dt>Shipping</dt>
            <dd>
              {order.totals.shippingTotal
                ? formatMoney(order.totals.shippingTotal, order.currency)
                : "Free"}
            </dd>
          </div>
          {order.totals.discountTotal > 0 && (
            <div>
              <dt>Discount</dt>
              <dd>
                −{formatMoney(order.totals.discountTotal, order.currency)}
              </dd>
            </div>
          )}
          <div>
            <dt>Tax</dt>
            <dd>{formatMoney(order.totals.taxTotal, order.currency)}</dd>
          </div>
          <div className="customer-order__total">
            <dt>Total</dt>
            <dd>{formatMoney(order.totals.grandTotal, order.currency)}</dd>
          </div>
        </dl>
        {order.promotion ? (
          <PromotionBreakdown
            promotion={order.promotion}
            currency={order.currency}
          />
        ) : null}
      </section>
      <div className="customer-order__info-grid">
        <section aria-labelledby="order-delivery-title">
          <div className="balmoral-profile__head">
            <h2 id="order-delivery-title">Delivery</h2>
          </div>
          <div className="balmoral-profile__card customer-order__card">
            {shipping && (
              <address>
                <strong>{shipping.recipientName}</strong>
                <br />
                {shipping.line1}
                {shipping.line2 && (
                  <>
                    <br />
                    {shipping.line2}
                  </>
                )}
                <br />
                {shipping.city}
                {shipping.region ? `, ${shipping.region}` : ""}{" "}
                {shipping.postalCode}
                <br />
                {shipping.countryCode}
              </address>
            )}
            {order.shipments.length ? (
              order.shipments.map((shipment, index) => (
                <div
                  className="customer-order__shipment"
                  key={`${shipment.trackingNumber ?? "shipment"}-${index}`}
                >
                  <span className="customer-order__badge">
                    {shipmentStatusLabel(shipment.status)}
                  </span>
                  <ShipmentTracking shipment={shipment} />
                </div>
              ))
            ) : (
              <p className="customer-order__muted">
                Shipping updates will appear here once your shipment is created.
              </p>
            )}
          </div>
        </section>
        <section aria-labelledby="order-payment-title">
          <div className="balmoral-profile__head">
            <h2 id="order-payment-title">Payment</h2>
          </div>
          <div className="balmoral-profile__card customer-order__card">
            <strong>{paymentMethodLabel(order.paymentMethod)}</strong>
            <p className="customer-order__muted">
              {paymentStatusLabel(order.paymentStatus, order.paymentMethod)}
            </p>
            <p>{formatMoney(order.totals.grandTotal, order.currency)}</p>
            {allowReturn && (
              <Link
                className="customer-order__link"
                href={`/returns?order=${encodeURIComponent(order.orderNumber)}`}
              >
                Start a return →
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
