"use client";

import { getUserErrorMessage, logApiError } from "@/lib/api-errors";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminError, AdminPageHeader, AdminSectionTitle, AdminStatus } from "@/components/admin/AdminUI";
import { adminDate, adminMoney } from "@/lib/admin-format";

type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  email: string;
  phone: string | null;
  currency: string;
  totals: { subtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; grandTotal: number };
  appliedCode: string | null;
  customerNote: string | null;
  internalNote: string | null;
  placedAt: string | null;
  reservationExpiresAt: string | null;
  inventoryCommittedAt: string | null;
  inventoryReleasedAt: string | null;
  createdAt: string;
  items: Array<{ id: string; sku: string; productName: string; colorName: string | null; size: string | null; productImageUrl: string | null; unitPrice: number; quantity: number; lineTotal: number }>;
  addresses: Array<{ type: string; recipientName: string; phone: string | null; line1: string; line2: string | null; city: string; region: string | null; postalCode: string | null; countryCode: string }>;
  payments: Array<{ id: string; provider: string; status: string; amount: number; refundedAmount: number; currency: string; failureReason: string | null; paidAt: string | null; lastWebhookAt: string | null; createdAt: string }>;
  shipments: Array<{ id: string; status: string; carrier: string | null; service: string | null; trackingNumber: string | null; trackingUrl: string | null; shippedAt: string | null; deliveredAt: string | null }>;
  customer: { id: string; email: string; firstName: string | null; lastName: string | null; role: string; status: string } | null;
  statusHistory: Array<{ id: string; action: string; metadata: { from?: string; to?: string } | null; actor: { email: string; firstName: string | null; lastName: string | null } | null; createdAt: string }>;
  webhookEvents: Array<{ id: string; provider: string; eventType: string; externalEventId: string; processingError: string | null; processedAt: string | null; createdAt: string }>;
};

const nextWorkflow: Record<string, string | undefined> = { PENDING: "CONFIRMED", CONFIRMED: "PROCESSING", PROCESSING: "SHIPPED", SHIPPED: "DELIVERED" };
const actionLabels: Record<string, string> = { CONFIRMED: "Confirm order", PROCESSING: "Mark as preparing", SHIPPED: "Mark as shipped", DELIVERED: "Mark as delivered" };

export default function AdminOrderDetailPage() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = decodeURIComponent(params.orderNumber);
  const { apiFetch, user } = useAdminAuth();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("Delivery");

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await apiFetch<AdminOrder>(`/admin/orders/${encodeURIComponent(orderNumber)}`);
      next.payments.forEach(payment => { if (payment.failureReason) logApiError(new Error(payment.failureReason), "/admin/orders/detail"); });
      next.webhookEvents.forEach(event => { if (event.processingError) logApiError(new Error(event.processingError), "/admin/orders/detail"); });
      setOrder(next);
      setNote(next.internalNote || "");
      setTrackingNumber(next.shipments[0]?.trackingNumber || "");
      setCarrier(next.shipments[0]?.carrier || "Delivery");
    } catch (cause) {
      setError(getUserErrorMessage(cause, "admin"));
    }
  }, [apiFetch, orderNumber]);

  useEffect(() => { void load(); }, [load]);
  const nextStatus = useMemo(() => order ? nextWorkflow[order.status] : undefined, [order]);
  const canAdvance = nextStatus !== "CONFIRMED" || Boolean(order?.inventoryCommittedAt && order.payments.some((payment) => payment.status === "PAID"));

  const cash = order?.payments.find(payment => payment.provider === "CASH_ON_DELIVERY");
  async function collectCash() {
    setBusy(true); setError(""); setSuccess("");
    try { setOrder(await apiFetch<AdminOrder>(`/admin/orders/${encodeURIComponent(orderNumber)}/collect-cash`, { method: "POST", body: "{}" })); setSuccess("Cash collection recorded."); }
    catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setBusy(false); }
  }

  async function saveNote() {
    setBusy(true); setError(""); setSuccess("");
    try {
      const next = await apiFetch<AdminOrder>(`/admin/orders/${encodeURIComponent(orderNumber)}/note`, { method: "PATCH", body: JSON.stringify({ internalNote: note }) });
      setOrder(next);
      setSuccess("Internal note saved.");
    } catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setBusy(false); }
  }

  async function changeWorkflow(status: string) {
    setBusy(true); setError(""); setSuccess("");
    try {
      const next = await apiFetch<AdminOrder>(`/admin/orders/${encodeURIComponent(orderNumber)}/workflow`, { method: "PATCH", body: JSON.stringify({
        status,
        ...(status === "SHIPPED" ? { trackingNumber: trackingNumber.trim(), carrier: carrier.trim() || undefined } : {}),
      }) });
      setOrder(next);
      setSuccess(status === "CANCELLED" ? "Order cancelled and inventory restored." : `Order marked ${status === "PROCESSING" ? "preparing" : status.toLowerCase()}.`);
    } catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
    finally { setBusy(false); }
  }

  function cancelOrder() {
    if (!order || !window.confirm(`Cancel ${order.orderNumber}? Reserved or committed stock will be restored. Paid orders cannot be cancelled here.`)) return;
    void changeWorkflow("CANCELLED");
  }

  return (
    <>
      <div className="admin-breadcrumb"><Link href="/admin/orders">Orders</Link><span>/</span><span>{orderNumber}</span></div>
      <AdminPageHeader
        index="01A"
        eyebrow="Order Detail"
        title={order?.orderNumber || orderNumber}
        description={order ? `${order.email} · ${adminDate(order.createdAt)}` : "Loading order ledger…"}
        action={order ? <div className="admin-header-status"><AdminStatus value={order.status} /></div> : undefined}
      />
      {error ? <AdminError message={error} retry={() => void load()} /> : null}
      {success ? <p className="admin-success" role="status">{success}</p> : null}
      {order ? (
        <>
          <section className="admin-order-summary-grid">
            <div className="admin-panel admin-order-items">
              <AdminSectionTitle label="01 / Line items" title="Purchased equipment" />
              {order.items.map((item) => (
                <div className="admin-order-line" key={item.id}>
                  <div className="admin-order-thumb">{item.productImageUrl ? <img src={item.productImageUrl} alt="" /> : <span>ALT</span>}</div>
                  <div><strong>{item.productName}</strong><span>{[item.colorName, item.size, item.sku].filter(Boolean).join(" / ")}</span></div>
                  <div className="tnum">× {item.quantity}</div>
                  <div className="tnum">{adminMoney(item.lineTotal, order.currency)}</div>
                </div>
              ))}
              <dl className="admin-order-totals">
                <div><dt>Subtotal</dt><dd>{adminMoney(order.totals.subtotal, order.currency)}</dd></div>
                <div><dt>Discount{order.appliedCode ? ` / ${order.appliedCode}` : ""}</dt><dd>−{adminMoney(order.totals.discountTotal, order.currency)}</dd></div>
                <div><dt>Shipping</dt><dd>{adminMoney(order.totals.shippingTotal, order.currency)}</dd></div>
                <div><dt>Tax</dt><dd>{adminMoney(order.totals.taxTotal, order.currency)}</dd></div>
                <div className="is-total"><dt>Total</dt><dd>{adminMoney(order.totals.grandTotal, order.currency)}</dd></div>
              </dl>
            </div>
            <aside className="admin-panel">
              <AdminSectionTitle label="02 / Fulfilment" title="Workflow" />
              <dl className="admin-definition-list">
                {cash ? <><div><dt>Payment method</dt><dd>Cash on Delivery</dd></div><div><dt>Collection status</dt><dd>{cash.status === "PAID" ? "Collected" : "Awaiting collection"}</dd></div></> : null}
                <div><dt>Order</dt><dd><AdminStatus value={order.status} /></dd></div>
                <div><dt>Payment status</dt><dd><AdminStatus value={order.payments[0]?.status || "PENDING"} /></dd></div>
                <div><dt>Inventory committed</dt><dd>{adminDate(order.inventoryCommittedAt)}</dd></div>
                <div><dt>Reservation expires</dt><dd>{adminDate(order.reservationExpiresAt)}</dd></div>
                <div><dt>Placed</dt><dd>{adminDate(order.placedAt)}</dd></div>
              </dl>
              {order.shipments[0] ? <dl className="admin-definition-list">
                <div><dt>Shipment</dt><dd><AdminStatus value={order.shipments[0].status} /></dd></div>
                <div><dt>Method</dt><dd>{order.shipments[0].service || "Standard delivery"}</dd></div>
                <div><dt>Tracking</dt><dd>{order.shipments[0].trackingNumber || "Not recorded"}</dd></div>
                <div><dt>Shipped</dt><dd>{adminDate(order.shipments[0].shippedAt)}</dd></div>
                <div><dt>Delivered</dt><dd>{adminDate(order.shipments[0].deliveredAt)}</dd></div>
              </dl> : null}
              {nextStatus === "SHIPPED" && user?.role === "ADMIN" ? <div className="admin-inline-create">
                <label><span>Tracking number</span><input required maxLength={150} value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} /></label>
                <label><span>Carrier label</span><input maxLength={100} value={carrier} onChange={(event) => setCarrier(event.target.value)} /></label>
                <p className="admin-muted">Local tracking record only. No carrier is contacted.</p>
              </div> : null}
              {cash?.status === "PENDING" && order.status === "SHIPPED" && order.inventoryCommittedAt && order.shipments[0]?.trackingNumber && user?.role === "ADMIN" ? <button className="admin-primary-button admin-full-button" type="button" disabled={busy} onClick={() => void collectCash()}>Mark cash as collected</button> : null}
              {nextStatus && user?.role === "ADMIN" ? <button className="admin-primary-button admin-full-button" type="button" disabled={busy || !canAdvance || (nextStatus === "DELIVERED" && cash?.status === "PENDING") || (nextStatus === "SHIPPED" && !trackingNumber.trim())} onClick={() => void changeWorkflow(nextStatus)}>{actionLabels[nextStatus]} →</button> : null}
              {nextStatus === "CONFIRMED" && !canAdvance ? <p className="admin-muted">Confirmation unlocks after payment and inventory commit.</p> : null}
              {["PENDING", "CONFIRMED", "PROCESSING"].includes(order.status) && user?.role === "ADMIN" ? <button className="admin-danger-button admin-full-button" type="button" disabled={busy} onClick={cancelOrder}>Cancel order</button> : null}
              {nextStatus && user?.role !== "ADMIN" ? <p className="admin-muted">Only an ADMIN can progress fulfillment.</p> : null}
              {order.status === "PAYMENT_REVIEW" ? <p className="admin-caution-copy">Financial review blocks automatic fulfilment. Verify provider evidence before changing any financial state.</p> : null}
            </aside>
          </section>

          <section className="admin-three-column">
            <div className="admin-panel">
              <AdminSectionTitle label="03 / Customer" title="Contact" />
              <div className="admin-address-block"><strong>{order.email}</strong><span>{order.phone || "No phone recorded"}</span>{order.customer ? <Link href={`/admin/customers/${order.customer.id}`}>Open customer record →</Link> : <span>Guest checkout</span>}</div>
            </div>
            {order.addresses.map((address) => (
              <div className="admin-panel" key={address.type}>
                <AdminSectionTitle label={`04 / ${address.type}`} title={address.type === "SHIPPING" ? "Ship to" : "Bill to"} />
                <address className="admin-address-block"><strong>{address.recipientName}</strong><span>{address.line1}</span>{address.line2 ? <span>{address.line2}</span> : null}<span>{[address.city, address.region, address.postalCode].filter(Boolean).join(", ")}</span><span>{address.countryCode}</span></address>
              </div>
            ))}
          </section>

          <section className="admin-dashboard-split">
            <div className="admin-panel">
              <AdminSectionTitle label="05 / Payment ledger" title="Payment attempts" />
              {order.payments.map((payment) => (
                <div className="admin-payment-row" key={payment.id}>
                  <div>{payment.provider === "CASH_ON_DELIVERY" ? <strong>{payment.status === "PAID" ? "Collected" : "Awaiting collection"}</strong> : <AdminStatus value={payment.status} />}<span>{payment.provider === "CASH_ON_DELIVERY" ? "Cash on Delivery" : "Credit / Debit Card"}</span></div>
                  <div><strong>{adminMoney(payment.amount, payment.currency)}</strong>{payment.refundedAmount ? <small>{adminMoney(payment.refundedAmount, payment.currency)} refunded</small> : null}</div>
                  <div><span>Created {adminDate(payment.createdAt)}</span><span>Paid {adminDate(payment.paidAt)}</span></div>
                  {payment.failureReason ? <p>Payment needs review. Check the order details.</p> : null}
                </div>
              ))}
              {!order.payments.length ? <p className="admin-muted">No payment attempts.</p> : null}
            </div>
            <div className="admin-panel">
              <AdminSectionTitle label="06 / Internal" title="Operator note" />
              <textarea className="admin-note-field" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Visible only to ALTURA operators." />
              <button className="admin-secondary-button" type="button" disabled={busy} onClick={() => void saveNote()}>Save note</button>
              {order.customerNote ? <div className="admin-customer-note"><span>Customer note</span><p>{order.customerNote}</p></div> : null}
            </div>
          </section>

          <section className="admin-panel admin-webhook-log">
            <AdminSectionTitle label="07 / Provider trace" title="Webhook events" />
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Provider</th><th>Event</th><th>External ID</th><th>Processed</th><th>Error</th></tr></thead><tbody>{order.webhookEvents.map((event) => <tr key={event.id}><td>{event.provider}</td><td>{event.eventType}</td><td className="admin-mono">{event.externalEventId}</td><td>{adminDate(event.processedAt)}</td><td>{event.processingError ? "This payment event needs review." : "—"}</td></tr>)}{!order.webhookEvents.length ? <tr><td colSpan={5}>No webhook events recorded.</td></tr> : null}</tbody></table></div>
          </section>
          <section className="admin-panel">
            <AdminSectionTitle label="08 / History" title="Order status timeline" />
            <div className="admin-history-list">
              <div><AdminStatus value="PENDING" /><span>Order created</span><time>{adminDate(order.createdAt)}</time></div>
              {order.statusHistory.map((entry) => <div key={entry.id}><AdminStatus value={entry.metadata?.to || entry.action} /><span>{entry.actor?.firstName || entry.actor?.email || "System"}</span><time>{adminDate(entry.createdAt)}</time></div>)}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
