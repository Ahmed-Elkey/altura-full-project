# Design audit — 7 October 2026

## Approved system
Inter typography; white surfaces on a light gray canvas; compact readable headings; 18px card corners; subtle shadows; rounded form controls; clear keyboard focus and shared semantic status colors. Brand marks are treated separately from page typography.

## Repairs
- Account Security now matches Profile and has a discoverable navigation link.
- Order detail, confirmation, tracking, cart, checkout and administration use the customer design established in the preceding implementation.
- Admin subpage cards, tables, labels and metrics follow the dashboard/customer typography. Tables scroll within their container. Tablet/mobile search no longer inherits a 240px vertical flex basis.
- Wishlist, search, contact, return and informational pages use customer typography and surfaces. Information headers no longer invert the navigation or reserve an empty image-hero aspect ratio.
- Contact fields override the old high-specificity underline selectors. Keyboard focus remains visible.
- Account dialogs trap focus, support Escape and restore their trigger; page scroll is restored when they close.
- Old Terms, FAQ, About and Return URLs resolve to implemented pages. Registration links to the real Terms page.
- The editorial font token resolves to Inter, including storefront headings. OS dark preference does not change the approved light palette.

## Verification approach
Browser scans cover 65 public paths (including aliases and all 9 live products) and 18 protected display paths at widths 390, 768 and 1440. Protected paths use populated synthetic fixtures. Screenshots of contact, About, FAQ, Terms, returns, wishlist and search were inspected. Homepage layout additionally covers 1024 and 1920. Automated checks include heading font, readable color, horizontal overflow and table containment. See QA_REPORT.md for outcomes and limits.
