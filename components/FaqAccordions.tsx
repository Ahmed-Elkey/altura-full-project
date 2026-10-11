"use client";

export function FaqAccordions() {
  return (
    <div className="accordions position-relative pb-row-accordions__accordions" data-module="accordions">
      <div className="shopify-block block-accordion">
        <details className="accordions__accordion">
          <summary className="accordions__btn">How long does it take to process my order?</summary>
          <div className="accordions__content overflow-clip wysiwyg">
            <p>Orders are prepared within 48 hours of being placed, Monday through Friday. Once your order has been dispatched, you will receive a confirmation email with tracking information. We do not ship on weekends or holidays.</p>
          </div>
        </details>
      </div>

      <div className="shopify-block block-accordion">
        <details className="accordions__accordion">
          <summary className="accordions__btn">How will my order be shipped?</summary>
          <div className="accordions__content overflow-clip wysiwyg">
            <p>All Egypt orders ship via Bosta / Mylerz with 2–4 business days delivery after dispatch (48 hours processing). Delivery times may vary due to weather and local conditions.</p>
          </div>
        </details>
      </div>

      <div className="shopify-block block-accordion">
        <details className="accordions__accordion">
          <summary className="accordions__btn">What is your return policy?</summary>
          <div className="accordions__content overflow-clip wysiwyg">
            <p>We accept returns on regular-priced items within 14 days of delivery inside Egypt. Approved returns are issued as online store credit.</p>
            <p>Discounted items are final sale.</p>
            <p>We ask that returned items be unworn, in their original condition, and in their original packaging.</p>
            <p>
              For more details please visit <a href="/info/shipping" title="Shipping & Returns">Shipping & Returns.</a>
            </p>
          </div>
        </details>
      </div>

      <div className="shopify-block block-accordion">
        <details className="accordions__accordion">
          <summary className="accordions__btn">When will my store credit be issued?</summary>
          <div className="accordions__content overflow-clip wysiwyg">
            <p>Store credit is issued within 5 business days of receiving and inspecting your return. You will be notified by email once your credit is available. Shipping fees are non-refundable.</p>
          </div>
        </details>
      </div>

      <div className="shopify-block block-accordion">
        <details className="accordions__accordion">
          <summary className="accordions__btn">How do I initiate a return?</summary>
          <div className="accordions__content overflow-clip wysiwyg">
            <p>
              To initiate a return, please visit our <a href="/start-a-return" title="Start a Return">Start a Return</a> page and complete the form. For any questions, you can also reach us at{" "}
              <a href="mailto:info@altura.eg">info@altura.eg</a>. Once your return has been shipped, please share your tracking number with us.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
