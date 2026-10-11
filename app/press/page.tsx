import { infoMetadata } from "@/lib/seo";
import { PressSlider } from "./PressSlider";

export const metadata = infoMetadata("press");

export default function PressPage() {
  return (
    <main className="flex-grow-1 customer-info" role="main">
      <section id="shopify-section-press" className="shopify-section section--pb-row-press">
        <div className="shopify-block block-wrapper">
          <div
            className="pb-row-wrapper pt-0 pb-0 pt-md-0 pb-md-0 pt-xl-0 pb-xl-0 mt-0 mb-40 mt-md-0 mb-md-50 mt-xl-0 mb-xl-70 --has-text-color"
            style={{ ["--zindex" as any]: 0, ["--text-color" as any]: "var(--text-primary)" } as React.CSSProperties}
          >
            <PressSlider />
          </div>
        </div>
      </section>
      <div className="shopify-section">
        <div className="shopify-block block-wrapper" />
      </div>
    </main>
  );
}
