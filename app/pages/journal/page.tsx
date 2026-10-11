import { infoMetadata } from "@/lib/seo";

export const metadata = infoMetadata("journal");

export default function JournalPage() {
  return (
    <main className="flex-grow-1 customer-info" role="main">
      <section className="shopify-section section--pb-row-page-header">
        <div
          className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-0 mb-0 mt-md-0 mb-md-0 mt-xl-0 mb-xl-0 --has-text-color --has-bg-color"
          style={{ ["--zindex" as any]: 0, ["--text-color" as any]: "#ffffff", ["--bg-color" as any]: "#000000" } as React.CSSProperties}
        >
          <div
            id="pb-row-page-header-journal"
            className="pb-row pb-row-page-header container-fluid position-relative d-grid row-gap-20 pb-30 pb-md-12 pb-xl-10"
          >
            <div className="pb-row-page-header__media position-absolute t-0 l-0 w-100 h-100 pointer-events-none2" aria-hidden="true">
              <picture className="pb-row-page-header__picture position-absolute t-0 l-0 w-100 h-100">
                <img src="/editorial/trail-story.jpg" alt="" className="pb-row-page-header__img image-as-background" />
              </picture>
            </div>
            <header className="pb-row-page-header__header position-relative col-start-1 col-span-4 col-span-xl-9 row-start-md-1 align-self-end d-flex align-items-start">
              <h1 className="pb-row-page-header__title ff-heading fz-20 fz-md-32 fz-xl-40 fw-400 lh-normal m-0">Journal</h1>
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
            <div id="pb-row-text-simple-journal" className="pb-row pb-row-text-simple container-fluid d-grid row-gap-20">
              <header className="pb-row-text-simple__header col-start-1 col-span-4 col-span-md-2 col-span-xl-3">
                <h2 className="pb-row-text-simple__title ff-heading fz-13 fz-xl-14 fw-400 lh-17 lh-xl-normal tt-uppercase m-0">The Dispatch</h2>
              </header>
              <aside className="pb-row-text-simple__content col-start-1 col-start-md-3 col-start-xl-4 col-span-4 col-span-xl-6 d-flex flex-column grid-gap-20">
                <div className="pb-row-text-simple__text fz-13 fz-xl-15 fw-400 lh-17 lh-xl-normal wysiwyg">
                  <p>Notes from the brand, the season and the road ahead.</p>
                  <p>
                    Editorial stories, field notes and collection insights will live here once the production content system is connected. BISTA / Mylerz deliveries across Egypt — 2–4 days. For now, explore the Fall–Winter 26 Lookbook and our latest Press features.
                  </p>
                  <p>
                    For inquiries: <a href="mailto:info@altura.eg">info@altura.eg</a> — Cairo, Egypt.
                  </p>
                </div>
                <div className="shopify-block block-buttons parent-shopify-block">
                  <nav className="links-nav d-flex pb-row-text-simple__buttons --layout-horizontal --layout-mobile-horizontal --layout-tablet-horizontal">
                    <div className="shopify-block block-button">
                      <a href="/pages/lookbook" className="btn links-nav__link --link" aria-label="Explore Lookbook">
                        <span className="btn__label" aria-hidden="true">
                          Explore Lookbook
                        </span>
                      </a>
                    </div>
                    <div className="shopify-block block-button">
                      <a href="/pages/press" className="btn links-nav__link --link" aria-label="View Press">
                        <span className="btn__label" aria-hidden="true">
                          View Press
                        </span>
                      </a>
                    </div>
                  </nav>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>
      <div className="shopify-section">
        <div className="shopify-block block-wrapper" />
      </div>
    </main>
  );
}
