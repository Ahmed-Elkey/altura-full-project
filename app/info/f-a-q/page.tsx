import { infoMetadata } from "@/lib/seo";
import { FaqAccordions } from "@/components/FaqAccordions";

export const metadata = infoMetadata("f-a-q");

export default function InfoFaqPage() {
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
