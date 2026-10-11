# ALTURA Catalog + Inventory API (Phase 3)

Base path: `/api/v1`

## Public catalog

### `GET /catalog/products`

Returns only `ACTIVE` products. Supported query parameters:

- `q` — name/slug/description/color/size/SKU search
- `category` — category slug, e.g. `tops`, `shorts`, `headwear`
- `collection` — collection slug, e.g. `shopall`, `fall-26`
- `color`
- `size`
- `inStock=true|false`
- `sort=featured|price-asc|price-desc|name-asc|newest`
- `page`
- `limit` (max 100)

Each product is shaped for the existing ALTURA storefront and includes:

- product metadata
- categories and collections
- colorways
- SKU/size variants
- per-variant availability
- color-specific images
- public stock state

Draft/archived products are never returned by this endpoint.

### `GET /catalog/products/:slug`

Returns one active product by its stable storefront slug, e.g. `meridian-tee`.

### `GET /catalog/categories`

Returns the category tree and active-product counts.

### `GET /catalog/collections`

Returns active collections and active-product counts.

### `GET /catalog/collections/:slug`

Returns collection metadata plus the paginated public product response.

## Admin catalog

Requires a valid access token with the `ADMIN` role.

- `GET /admin/catalog/products`
- `GET /admin/catalog/products/:productId`
- `POST /admin/catalog/products`
- `PATCH /admin/catalog/products/:productId`
- `POST /admin/catalog/products/:productId/archive`
- `POST /admin/catalog/products/:productId/variants`
- `PATCH /admin/catalog/variants/:variantId`
- `POST /admin/catalog/variants/:variantId/deactivate`
- `POST /admin/catalog/products/:productId/images`
- `PATCH /admin/catalog/images/:imageId`
- `DELETE /admin/catalog/images/:imageId`
- `GET /admin/catalog/categories`
- `POST /admin/catalog/categories`
- `PATCH /admin/catalog/categories/:categoryId`
- `GET /admin/catalog/collections`
- `POST /admin/catalog/collections`
- `PATCH /admin/catalog/collections/:collectionId`

Products are archived rather than hard-deleted so historic order relations remain safe.

## Inventory admin

Requires `ADMIN`.

- `GET /admin/inventory`
- `GET /admin/inventory/:variantId`
- `PATCH /admin/inventory/:variantId` — set physical quantity and optionally threshold
- `POST /admin/inventory/:variantId/adjust` — delta adjustment with a required reason
- `GET /admin/inventory/:variantId/movements` — latest movement history

Inventory is stored per SKU (`ProductVariant`), never at product level.

Definitions:

- `quantity` = physical stock
- `reservedQuantity` = stock temporarily held for checkout/order flow
- `availableQuantity` = `quantity - reservedQuantity`
- `lowStock` = `availableQuantity <= lowStockThreshold`

The service also exposes internal `reserve`, `releaseReservation`, and `commitReservation` methods for the cart/checkout phases. Reservation writes use a database-side conditional update so concurrent checkout attempts cannot reserve more stock than is available.

## Current ALTURA seed snapshot

`prisma/data/altura-catalog.json` was generated from the existing storefront catalog and intentionally preserves:

- 20 total products
- 9 public ACTIVE products
- 11 DRAFT products
- 21 public colorways
- 196 local product image records
- 192 total size/color SKU variants (87 active-product variants)
- current CAD prices
- current storefront slugs
- current category/collection routes

The seed stores image paths such as `/products/meridian-tee/bone-front.jpg`. These paths reference the current Next.js public assets and do not copy image binaries into the API.

## Seeding

After migration:

```bash
npm run db:seed
```

Optional development admin creation can be enabled in `.env`:

```env
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=use-a-long-development-password
```

If the email already exists, seeding only upgrades the role/status and does not overwrite its password.
