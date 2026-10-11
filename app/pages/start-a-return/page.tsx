import { infoMetadata } from "@/lib/seo";
import { StartAReturnForm } from "@/components/StartAReturnForm";

export const metadata = infoMetadata("start-a-return");

export default function StartAReturnPage() {
  return (
    <main className="flex-grow-1 customer-info" role="main">
      <section className="shopify-section section--pb-row-page-header">
        <div className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-0 mb-0 mt-md-0 mb-md-0 mt-xl-0 mb-xl-0 --has-text-color --has-bg-color" style={{ ["--zindex" as any]: 0, ["--text-color" as any]: "#ffffff", ["--bg-color" as any]: "#000000" } as React.CSSProperties}>
          <div
            id="pb-row-page-header-start-return"
            className="pb-row pb-row-page-header container-fluid position-relative d-grid row-gap-20 pb-30 pb-md-12 pb-xl-10"
          >
            <div className="pb-row-page-header__media position-absolute t-0 l-0 w-100 h-100 pointer-events-none2" aria-hidden="true">
              <picture className="pb-row-page-header__picture position-absolute t-0 l-0 w-100 h-100">
                <source srcSet="/start-a-return/20260310_BALMORAL_CONTENT3177_revA_2800x.jpg" media="(min-width: 1800px)" />
                <source srcSet="/start-a-return/20260310_BALMORAL_CONTENT3177_revA_1920x.jpg" media="(min-width: 1441px)" />
                <source srcSet="/start-a-return/20260310_BALMORAL_CONTENT3177_revA_1440x.jpg" media="(min-width: 1200px)" />
                <source srcSet="/start-a-return/20260310_BALMORAL_CONTENT3177_revA_1200x.jpg" media="(min-width: 1024px)" />
                <source srcSet="/start-a-return/20260310_BALMORAL_CONTENT3177_revA_1024x.jpg" media="(min-width: 768px)" />
                <img
                  src="/start-a-return/20260310_BALMORAL_CONTENT3177_768x.jpg"
                  alt=""
                  loading="lazy"
                  className="pb-row-page-header__img image-as-background"
                />
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
          <div
            id="pb-row-form-start-return"
            className="pb-row pb-row-form container-fluid d-grid grid-column-xl-12 col-gap-10 row-gap-20 row-gap-xl-30"
          >
            <h2 className="pb-row-form__title col-start-1 col-span-xl-3 fz-13 fz-xl-14 ff-heading fw-400 lh-17 lh-xl-normal tt-uppercase m-0">Return form</h2>
            <div className="pb-row-form__text col-start-1 col-start-xl-4 col-span-xl-6 fz-13 fz-xl-15 fw-400 lh-17 lh-xl-normal m-0 wysiwyg">
              <p>Use the secure online return flow for orders in your account after they are marked delivered. Guest orders and account access questions can be directed to customer care.</p>
            </div>
            <StartAReturnForm />
          </div>
        </div>
      </section>
      <div className="shopify-section">
        <div className="shopify-block block-wrapper" />
      </div>
    </main>
  );
}
