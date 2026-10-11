import Link from "next/link";
import { LocalizationSelect } from "./LocalizationSelect";
import { NewsletterForm } from "./NewsletterForm";
import { store } from "@/data/store";

const linkColumns: Array<Array<{ label: string; href: string }>> = [
  [
    { label: "Contact Us", href: "/info/contact" },
    { label: "About Us", href: "/info/about" },
    { label: "FAQs", href: "/info/faqs" },
  ],
  [
    { label: "Shipping & returns", href: "/info/shipping" },
    { label: "Start a return", href: "/start-a-return" },
  ],
  [
    { label: "Press", href: "/info/press" },
    { label: "Terms & policies", href: "/info/terms" },
  ],
];

export function SiteFooter() {
  return (
    <footer className="site-footer" data-purpose="site-footer">
      <nav className="site-footer__nav" aria-label="Footer">
        {linkColumns.map((column, index) => (
          <ul key={index} className="site-footer__menu">
            {column.map((item) => (
              <li key={item.label} className="menu-item">
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        ))}
      </nav>

      <div className="site-footer__newsletter">
        <h4 className="site-footer__newsletterTitle">Subscribe to our newsletter</h4>
        <NewsletterForm />
      </div>

      <div className="site-footer__config">
        <div className="site-footer__languagesWrap">
          <h4 className="site-footer__configTitle">Select language</h4>
          <LocalizationSelect
            ariaLabel="Select language"
            defaultValue="en"
            options={[{ value: "en", label: "English" }]}
          />
        </div>
        <div className="site-footer__countriesWrap">
          <h4 className="site-footer__configTitle">Select country</h4>
          <LocalizationSelect
            ariaLabel="Select country"
            defaultValue={store.countryCode}
            options={[{ value: store.countryCode, label: `${store.countryName} (${store.currencyCode})` }]}
          />
        </div>
      </div>

      <div className="site-footer__bottom">
        <p className="site-footer__copyright">Copyright © 2026 {store.name} Running</p>
        <p className="site-footer__credits">
          <Link href="/info/about">CREDITS</Link>
        </p>
      </div>
    </footer>
  );
}
