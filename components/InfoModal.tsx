"use client";
import { Modal } from "./account/Modal";

export type InfoKey = "refund" | "shipping" | "privacy" | "terms" | "cookies";

export const INFO_LINKS: Array<{ key: InfoKey; label: string }> = [
  { key: "refund", label: "Refund policy" },
  { key: "shipping", label: "Shipping" },
  { key: "privacy", label: "Privacy policy" },
  { key: "terms", label: "Terms of service" },
  { key: "cookies", label: "Cookies" },
];

const INFO_MODALS: Record<InfoKey, { title: string; body: React.ReactNode }> = {
  shipping: {
    title: "Shipping",
    body: (
      <>
        <p>Orders are usually processed within 48 hours. Once dispatched, a confirmation email with tracking details will follow.</p>
        <h3>Egypt</h3>
        <p>All orders inside Egypt ship via Bosta / Mylerz with door-to-door delivery. Prices include VAT. No additional duties for domestic shipments.</p>
        <h3>Cairo &amp; Giza</h3>
        <p>Typically delivered within 2 business days after dispatch.</p>
        <h3>Other Governorates</h3>
        <p>Typically delivered within 3–4 business days after dispatch via Bosta / Mylerz.</p>
        <h3>International</h3>
        <p>All international orders are shipped with duties and taxes included.</p>
        <p>Orders are prepared Monday through Friday. We do not ship on weekends or holidays. Delivery times may vary due to weather and local conditions.</p>
        <p>For any inquiries, please contact <a href="mailto:info@altura.eg">info@altura.eg</a></p>
      </>
    ),
  },
  refund: {
    title: "Refund policy",
    body: (
      <>
        <p>If you are not completely satisfied with your purchase, you may return any regular-priced item for an online store credit within Egypt. Discounted items are final sale and cannot be returned or exchanged.</p>
        <h3>Return Eligibility</h3>
        <p>You have 14 days from the date of delivery to send back a return. Items must be unused, in their original condition and packaging, and a receipt or proof of purchase is required. Customers are responsible for return shipping costs.</p>
        <h3>How to request a return</h3>
        <p>Submit a return request with your order number and the items you wish to return. We will provide a return authorization number and instructions by email within 2 business days. Once we receive and inspect the returned item, your online store credit will be issued within up to 5 business days.</p>
        <h3>Important Notes</h3>
        <p>Shipping fees are non-refundable.</p>
        <p>For any inquiries, please contact <a href="mailto:info@altura.eg">info@altura.eg</a></p>
      </>
    ),
  },
  privacy: {
    title: "Privacy policy",
    body: (
      <>
        <p>ALTURA collects the information you provide at checkout and on your account — name, email, phone, shipping addresses and order history — to process and deliver your orders and to support you when you contact us.</p>
        <h3>Sessions &amp; Cookies</h3>
        <p>Guest carts are kept in a secure HttpOnly session cookie. When you sign in, we keep you signed in with an access token and an HttpOnly refresh cookie. We also remember your last used email on your own device to speed up sign-in.</p>
        <h3>Sharing</h3>
        <p>We do not sell your personal information. It is shared only as needed to fulfill your order — such as delivery carriers and payment providers.</p>
        <p>For access or deletion requests, please contact <a href="mailto:info@altura.eg">info@altura.eg</a></p>
      </>
    ),
  },
  terms: {
    title: "Terms of service",
    body: (
      <>
        <p>By accessing or using ALTURA, you agree to these terms as well as any applicable laws and regulations. Product descriptions, pricing and availability are subject to change at any time without notice.</p>
        <h3>Orders</h3>
        <p>All orders are subject to acceptance and availability. Payment must be received in full prior to shipment. We accept major credit cards, including Visa, Mastercard and American Express. Please review all order details carefully prior to purchase.</p>
        <h3>Pricing &amp; Currency</h3>
        <p>All prices are listed in EGP with conversion available. Prices include VAT and are subject to change without notice.</p>
        <h3>Shipping — Egypt Only</h3>
        <p>Orders are processed within 48 hours and delivered via Bosta / Mylerz within 2–4 business days across Egypt. Risk of loss transfers to the customer upon delivery to the carrier.</p>
        <h3>Returns</h3>
        <p>Approved returns are issued as store credit unless otherwise stated. Items marked as final sale are not eligible for return, exchange or store credit.</p>
        <h3>Governing Law</h3>
        <p>These terms are governed by the laws of the Arab Republic of Egypt. For inquiries, please contact <a href="mailto:info@altura.eg">info@altura.eg</a></p>
      </>
    ),
  },
  cookies: {
    title: "Cookies",
    body: (
      <>
        <p>ALTURA uses a small number of cookies and local storage entries to keep the store working:</p>
        <h3>Strictly Necessary</h3>
        <p>Guest cart session cookie (HttpOnly) — keeps your bag while you shop. Sign-in refresh cookie (HttpOnly) — keeps you signed in. Both expire automatically.</p>
        <h3>Preferences</h3>
        <p>Last used email — remembered on your own device so sign-in is faster. You can clear it at any time by clearing your browser site data.</p>
        <p>We do not use advertising or cross-site tracking cookies.</p>
      </>
    ),
  },
};

export function InfoModal({ modalKey, onClose }: { modalKey: InfoKey | null; onClose: () => void }) {
  return (
    <Modal open={modalKey !== null} label={modalKey ? INFO_MODALS[modalKey].title : "Information"} onClose={onClose} small>
      {modalKey ? (
        <>
          <h2 className="acct-modal__title">{INFO_MODALS[modalKey].title}</h2>
          <div className="ship-info">{INFO_MODALS[modalKey].body}</div>
        </>
      ) : null}
    </Modal>
  );
}
