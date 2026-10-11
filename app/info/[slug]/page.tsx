import type { Metadata } from "next";
import { infoMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BalmoralContactForm } from "@/components/BalmoralContactForm";
import { TermsPoliciesContent } from "@/components/TermsPoliciesContent";
import { FaqAccordions } from "@/components/FaqAccordions";
import { StartAReturnForm } from "@/components/StartAReturnForm";

// Balmoral exact content for shipping-returns — replicated 1:1
function ShippingReturnsContent() {
  return (
    <>
      <h3>SHIPPING — EGYPT ONLY</h3>
      <p>Orders are processed within 48 hours. Once dispatched, a confirmation email with tracking details will follow. Delivery via Bosta / Mylerz within 2–4 business days across Egypt.</p>
      <p>
        <strong>Egypt — All Governorates</strong>
        <br />
        All orders inside Egypt ship via Bosta / Mylerz with door-to-door delivery. Prices include VAT. No additional duties for domestic shipments.
      </p>
      <p>
        <strong>Cairo & Giza</strong>
        <br />
        Typically delivered within 2 business days after dispatch.
      </p>
      <p>
        <strong>Other Governorates</strong>
        <br />
        Typically delivered within 3–4 business days after dispatch via Bosta / Mylerz.
      </p>
      <p>Orders are prepared Monday through Friday. We do not ship on weekends or holidays. Delivery times may vary due to weather and local conditions.</p>
      <p>
        For any inquiries, please contact <a href="mailto:info@altura.eg">info@altura.eg</a>.
      </p>
      <h3>RETURN &amp; EXCHANGE POLICY — EGYPT ONLY</h3>
      <p>
        If you are not completely satisfied with your purchase, you may return any regular-priced item for an online store credit within Egypt. Please note that discounted items are <strong>final sale</strong> and cannot be returned or exchanged.
      </p>
      <h3>Return Eligibility</h3>
      <ul>
        <li>
          You have <strong>14 days</strong> from the date of delivery to ship back a return.
        </li>
        <li>
          Regular priced items can only be returned for an <strong>online</strong> <strong>store credit.</strong>
        </li>
        <li>
          Items must be <strong>unused</strong>, in their <strong>original condition</strong>, and in the <strong>original packaging</strong>.
        </li>
        <li>
          A <strong>receipt or proof of purchase</strong> is required for all returns.
        </li>
        <li>Customers are responsible for return shipping costs and must arrange the return with their local postal service.</li>
      </ul>
      <h3>How to request a return</h3>
      <ol>
        <li>
          <strong>Request an RA Number</strong> – Visit our{" "}
          <Link href="/start-a-return" title="Start a return">
            returns page
          </Link>{" "}
          to submit a return request, including your order number and the item(s) you wish to return.
        </li>
        <li>
          <strong>Receive Return Authorization</strong> – We will provide an RA number and return instructions via email within{" "}
          <strong>2 business days</strong>.
        </li>
        <li>
          <strong>Ship Your Return</strong> – Follow the instructions and coordinate the return with your local postal service. Please provide your
          tracking number when item has been shipped.
        </li>
        <li>
          <strong>Credit Processing</strong> – Once we receive and inspect the returned item, we will issue your online store credit.
        </li>
      </ol>
      <h3>Important Notes</h3>
      <ul>
        <li>
          Store credit may take <strong>up to 5 business days</strong> to be issued once the returned item is received.
        </li>
        <li>
          <strong>Shipping fees are non-refundable</strong>.
        </li>
      </ul>
    </>
  );
}

const pages: Record<string, { title: string; intro?: string; body?: string[]; custom?: React.ReactNode }> = {
  shipping: {
    title: "Shipping & Returns",
    custom: <ShippingReturnsContent />,
  },
  "shipping-returns": {
    title: "Shipping & Returns",
    custom: <ShippingReturnsContent />,
  },
  contact: {
    title: "Contact",
    custom: "contact-form" as any,
  },
  "contact-us": {
    title: "Contact",
    custom: "contact-form" as any,
  },
  about: {
    title: "About",
    intro: "ALTURA is built around movement, restraint and changing weather.",
    body: ["We design performance apparel with a quieter point of view—technical enough for the run, refined enough for everyday wear."],
  },
  journal: {
    title: "Journal",
    intro: "Notes from the brand, the season and the road ahead.",
    body: ["Editorial stories, field notes and collection insights will live here once the production content system is connected."],
  },
  lookbook: {
    title: "Fall–Winter 26 Lookbook",
    intro: "Movement, layers and changing weather.",
    body: ["The ALTURA Fall–Winter 26 collection explores technical layers through a restrained palette of forest, stone, black and sage."],
  },
  press: {
    title: "Press",
    intro: "Selected ALTURA features and brand information.",
    body: ["For editorial requests, product loans and brand assets, contact press@altura.run."],
  },
  instagram: {
    title: "Instagram",
    intro: "ALTURA in motion.",
    body: ["Social links will be connected when the production brand accounts are ready."],
  },
  faqs: {
    title: "FAQs",
    intro: "Common questions about fit, orders and care.",
    body: ["Product pages show available sizes and fit descriptions. A measurement-based size guide is future scope and is not available in this demo. Care instructions are listed on the garment label and product page."],
  },
  returns: {
    title: "Start a return",
    intro: "Return portal placeholder.",
    body: ["The production store will connect this page to the order and returns provider selected for ALTURA."],
  },
  terms: {
    title: "Terms & policies",
    intro: "Store terms and privacy information.",
    body: ["Production legal terms, privacy policy and payment terms will be added before launch."],
  },
  "terms-policies": {
    title: "Terms & Policies",
    intro: "Store terms and privacy information.",
    body: ["Production legal terms, privacy policy and payment terms will be added before launch."],
  },
  "f-a-q": {
    title: "FAQs",
    intro: "Common questions about fit, orders and care.",
    body: ["Product pages show available sizes and fit descriptions. A measurement-based size guide is future scope and is not available in this demo. Care instructions are listed on the garment label and product page."],
  },
  "start-a-return": {
    title: "Start a Return",
    intro: "Return form.",
    body: ["Submit your return request via the form."],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!Object.hasOwn(pages, slug)) notFound();
  return infoMetadata(slug);
}

export default async function InfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "returns") redirect("/start-a-return");
  if (slug === "terms") redirect("/info/terms-policies");
  if (slug === "faqs") redirect("/info/f-a-q");
  if (slug === "about") redirect("/info/about-us");
  const page = pages[slug];
  if (!page) notFound();

  // Balmoral exact replica — Contact page has hero + form (not page-default)
  if (slug === "contact" || slug === "contact-us") {
    return (
      <main className="customer-info">
        <section className="shopify-section section--pb-row-page-header">
          <div
            className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-0 mb-0 mt-md-0 mb-md-0 mt-xl-0 mb-xl-0 --has-text-color --has-bg-color"
            style={{ ["--zindex" as any]: 0, ["--text-color" as any]: "#ffffff", ["--bg-color" as any]: "#000000" } as React.CSSProperties}
          >
            <div
              id="pb-row-page-header-contact"
              className="pb-row pb-row-page-header container-fluid position-relative d-grid row-gap-20 pb-30 pb-md-12 pb-xl-10"
            >
              <div className="pb-row-page-header__media position-absolute t-0 l-0 w-100 h-100 pointer-events-none2" aria-hidden="true">
                <picture className="pb-row-page-header__picture position-absolute t-0 l-0 w-100 h-100">
                  <source srcSet="/contact/grahambaird_photo-03865_1920x.jpg" media="(min-width: 1441px)" />
                  <source srcSet="/contact/grahambaird_photo-03865_1440x.jpg" media="(min-width: 1200px)" />
                  <source srcSet="/contact/grahambaird_photo-03865_1200x.jpg" media="(min-width: 1024px)" />
                  <source srcSet="/contact/grahambaird_photo-03865_1024x.jpg" media="(min-width: 768px)" />
                  <img
                    src="/contact/grahambaird_photo-03865_768x.jpg"
                    alt=""
                    className="pb-row-page-header__img image-as-background"
                  />
                </picture>
              </div>
              <header className="pb-row-page-header__header position-relative col-start-1 col-span-4 col-span-xl-9 row-start-md-1 align-self-end d-flex align-items-start">
                <h1 className="pb-row-page-header__title ff-heading fz-20 fz-md-32 fz-xl-40 fw-400 lh-normal m-0">Contact</h1>
              </header>
            </div>
          </div>
        </section>

        <section className="shopify-section section--pb-row-form">
          <div
            className="pb-row-wrapper pt-0 pb-10 pt-md-0 pb-md-10 pt-xl-0 pb-xl-90 mt-30 mb-20 mt-md-50 mb-md-70 mt-xl-90 mb-xl-90"
            style={{ ["--zindex" as any]: 0 } as React.CSSProperties}
          >
            <div className="pb-row pb-row-form container-fluid d-grid grid-column-xl-12 col-gap-10 row-gap-20 row-gap-xl-30">
              <h2 className="pb-row-form__title col-start-1 col-span-xl-3 fz-13 fz-xl-14 ff-heading fw-400 lh-17 lh-xl-normal tt-uppercase m-0">
                Get in touch
              </h2>
              <BalmoralContactForm />
            </div>
          </div>
        </section>
      </main>
    );
  }

  // Balmoral exact replicas — About Us, Terms, FAQ, Start a Return
  if (slug === "about" || slug === "about-us" || slug === "about_us") {
    return (
      <main className="flex-grow-1 customer-info" role="main">
        <section className="shopify-section section--pb-row-page-header">
          <div
            className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-0 mb-0 mt-md-0 mb-md-0 mt-xl-0 mb-xl-0 --has-text-color --has-bg-color"
            style={{ ["--zindex" as any]: 0, ["--text-color" as any]: "#ffffff", ["--bg-color" as any]: "#000000" } as React.CSSProperties}
          >
            <div className="pb-row pb-row-page-header container-fluid position-relative d-grid row-gap-20 pb-30 pb-md-12 pb-xl-10">
              <div className="pb-row-page-header__media position-absolute t-0 l-0 w-100 h-100 pointer-events-none2" aria-hidden="true">
                <picture className="pb-row-page-header__picture position-absolute t-0 l-0 w-100 h-100">
                  <img src="/editorial/story.jpg" alt="" className="pb-row-page-header__img image-as-background" />
                </picture>
              </div>
              <header className="pb-row-page-header__header position-relative col-start-1 col-span-4 col-span-xl-9 row-start-md-1 align-self-end d-flex align-items-start">
                <h1 className="pb-row-page-header__title ff-heading fz-20 fz-md-32 fz-xl-40 fw-400 lh-normal m-0">About Us</h1>
              </header>
            </div>
          </div>
        </section>
        <section className="shopify-section section">
          <div className="shopify-block block-wrapper">
            <div
              className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-30 mb-20 mt-md-50 mb-md-70 mt-xl-90 mb-xl-90"
              style={{ ["--zindex" as any]: 0 } as React.CSSProperties}
            >
              <div className="pb-row pb-row-text-simple container-fluid d-grid row-gap-20">
                <header className="pb-row-text-simple__header col-start-1 col-span-4 col-span-md-2 col-span-xl-3">
                  <h2 className="pb-row-text-simple__title ff-heading fz-13 fz-xl-14 fw-400 lh-17 lh-xl-normal tt-uppercase m-0">The Brand</h2>
                </header>
                <aside className="pb-row-text-simple__content col-start-1 col-start-md-3 col-start-xl-4 col-span-4 col-span-xl-6 d-flex flex-column grid-gap-20">
                  <div className="pb-row-text-simple__text fz-13 fz-xl-15 fw-400 lh-17 lh-xl-normal wysiwyg">
                    <p>
                      ALTURA was founded in Egypt to create timeless garments shaped by the country’s distinct desert climate and vibrant urban life. Drawing from its Egyptian heritage, the brand takes inspiration from landscapes where intense sun demands protection, breathability, and lightness, and cool evenings invite layering and comfort. Each collection reinterprets essential pieces through this contrast, balancing function and refinement for life between the desert and the city.
                    </p>
                  </div>
                  <div className="shopify-block block-buttons parent-shopify-block">
                    <nav className="links-nav d-flex pb-row-text-simple__buttons --layout-horizontal --layout-mobile-horizontal --layout-tablet-horizontal"></nav>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (slug === "terms" || slug === "terms-policies" || slug === "terms_policies" || slug === "terms-policies-1") {
    return (
      <main className="flex-grow-1 customer-info" role="main">
        <TermsPoliciesContent />
      </main>
    );
  }

  if (slug === "faqs" || slug === "faq" || slug === "f-a-q" || slug === "f_a_q") {
    return (
      <main className="flex-grow-1 customer-info" role="main">
        <section className="shopify-section section--pb-row-page-header">
          <div className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-0 mb-0 mt-md-0 mb-md-0 mt-xl-0 mb-xl-0 --has-text-color --has-bg-color" style={{ ["--zindex" as any]: 0, ["--text-color" as any]: "#ffffff", ["--bg-color" as any]: "#000000" } as React.CSSProperties}>
            <div className="pb-row pb-row-page-header container-fluid position-relative d-grid row-gap-20 pb-30 pb-md-12 pb-xl-10">
              <div className="pb-row-page-header__media position-absolute t-0 l-0 w-100 h-100 pointer-events-none2" aria-hidden="true">
                <picture className="pb-row-page-header__picture position-absolute t-0 l-0 w-100 h-100">
                  <source srcSet="/faq/20260310_BALMORAL_CONTENT3270_2800x.jpg" media="(min-width: 1800px)" />
                  <source srcSet="/faq/20260310_BALMORAL_CONTENT3270_1920x.jpg" media="(min-width: 1441px)" />
                  <source srcSet="/faq/20260310_BALMORAL_CONTENT3270_1440x.jpg" media="(min-width: 1200px)" />
                  <source srcSet="/faq/20260310_BALMORAL_CONTENT3270_1200x.jpg" media="(min-width: 1024px)" />
                  <source srcSet="/faq/20260310_BALMORAL_CONTENT3270_1024x.jpg" media="(min-width: 768px)" />
                  <img src="/faq/20260310_BALMORAL_CONTENT3270_768x.jpg" alt="" loading="lazy" className="pb-row-page-header__img image-as-background" />
                </picture>
              </div>
              <header className="pb-row-page-header__header position-relative col-start-1 col-span-4 col-span-xl-9 row-start-md-1 align-self-end d-flex align-items-start">
                <h1 className="pb-row-page-header__title ff-heading fz-20 fz-md-32 fz-xl-40 fw-400 lh-normal m-0">FAQs</h1>
              </header>
            </div>
          </div>
        </section>
        <section className="shopify-section section">
          <div className="shopify-block block-wrapper">
            <div className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-30 mb-20 mt-md-50 mb-md-70 mt-xl-90 mb-xl-90" style={{ ["--zindex" as any]: 0 } as React.CSSProperties}>
              <div className="pb-row pb-row-accordions container-fluid d-grid row-gap-20">
                <div className="shopify-block block-accordions parent-shopify-block">
                  <FaqAccordions />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (slug === "start-a-return" || slug === "start_a_return" || slug === "returns" || slug === "return") {
    return (
      <main className="flex-grow-1 customer-info" role="main">
        <section className="shopify-section section--pb-row-page-header">
          <div className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-0 mb-0 mt-md-0 mb-md-0 mt-xl-0 mb-xl-0 --has-text-color --has-bg-color" style={{ ["--zindex" as any]: 0, ["--text-color" as any]: "#ffffff", ["--bg-color" as any]: "#000000" } as React.CSSProperties}>
            <div className="pb-row pb-row-page-header container-fluid position-relative d-grid row-gap-20 pb-30 pb-md-12 pb-xl-10">
              <div className="pb-row-page-header__media position-absolute t-0 l-0 w-100 h-100 pointer-events-none2" aria-hidden="true">
                <picture className="pb-row-page-header__picture position-absolute t-0 l-0 w-100 h-100">
                  <source srcSet="/start-a-return/20260310_BALMORAL_CONTENT3177_revA_2800x.jpg" media="(min-width: 1800px)" />
                  <source srcSet="/start-a-return/20260310_BALMORAL_CONTENT3177_revA_1920x.jpg" media="(min-width: 1441px)" />
                  <source srcSet="/start-a-return/20260310_BALMORAL_CONTENT3177_revA_1440x.jpg" media="(min-width: 1200px)" />
                  <source srcSet="/start-a-return/20260310_BALMORAL_CONTENT3177_revA_1200x.jpg" media="(min-width: 1024px)" />
                  <source srcSet="/start-a-return/20260310_BALMORAL_CONTENT3177_revA_1024x.jpg" media="(min-width: 768px)" />
                  <img src="/start-a-return/20260310_BALMORAL_CONTENT3177_768x.jpg" alt="" loading="lazy" className="pb-row-page-header__img image-as-background" />
                </picture>
              </div>
              <header className="pb-row-page-header__header position-relative col-start-1 col-span-4 col-span-xl-9 row-start-md-1 align-self-end d-flex align-items-start">
                <h1 className="pb-row-page-header__title ff-heading fz-20 fz-md-32 fz-xl-40 fw-400 lh-normal m-0">Start a return</h1>
              </header>
            </div>
          </div>
        </section>
        <section className="shopify-section section--pb-row-form">
          <div className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-30 mb-20 mt-md-50 mb-md-70 mt-xl-90 mb-xl-90" style={{ ["--zindex" as any]: 0 } as React.CSSProperties}>
            <div className="pb-row pb-row-form container-fluid d-grid grid-column-xl-12 col-gap-10 row-gap-20 row-gap-xl-30">
              <h2 className="pb-row-form__title col-start-1 col-span-xl-3 fz-13 fz-xl-14 ff-heading fw-400 lh-17 lh-xl-normal tt-uppercase m-0">Return form</h2>
              <div className="pb-row-form__text col-start-1 col-start-xl-4 col-span-xl-6 fz-13 fz-xl-15 fw-400 lh-17 lh-xl-normal m-0 wysiwyg">
                <p>Use the secure online return flow after your order is marked delivered. Sign in to see your history, or continue as a guest with your order number and checkout email.</p>
              </div>
              <StartAReturnForm />
            </div>
          </div>
        </section>
      </main>
    );
  }

  // Balmoral exact replica layout — page-default container for shipping & others
  return (
    <main className="customer-info">
      <div className="page-default container-fluid d-grid row-gap-20 row-gap-xl-30 mb-20 mb-xl-90">
        <h1 className="page-default__title ff-heading fz-13 fz-md-14 fz-xl-15 fw-400 lh-17 lh-md-20 lh-xl-normal ta-xl-center tt-uppercase m-0">
          {page.title}
        </h1>
        <div className="page-default__text fz-13 fz-md-14 fz-xl-15 fw-400 lh-17 lh-md-20 lh-xl-normal wysiwyg">
          {page.custom && typeof page.custom !== "string" ? (
            page.custom
          ) : (
            <>
              {page.intro && <p>{page.intro}</p>}
              {page.body && page.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
