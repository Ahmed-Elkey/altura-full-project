-- ALTURA database-level integrity constraints.
-- Prisma schema cannot express CHECK constraints or partial/expression indexes,
-- so they live here as idempotent SQL. Apply with:
--   psql "$DATABASE_URL" -f backend/prisma/db-constraints.sql
-- Re-run safely after every `prisma migrate deploy` (all statements are IF NOT EXISTS
-- guarded where Postgres supports it; the DO blocks skip existing constraints/indexes).

-- ---------------------------------------------------------------------------
-- 1. Inventory invariants: no negative stock, reservations never exceed stock.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_non_negative') THEN
    ALTER TABLE "Inventory"
      ADD CONSTRAINT inventory_non_negative
      CHECK (quantity >= 0 AND "reservedQuantity" >= 0 AND "lowStockThreshold" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_reserved_within_stock') THEN
    ALTER TABLE "Inventory"
      ADD CONSTRAINT inventory_reserved_within_stock
      CHECK ("reservedQuantity" <= quantity);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Line-item quantities must be positive.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_item_positive_quantity') THEN
    ALTER TABLE "CartItem" ADD CONSTRAINT cart_item_positive_quantity CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_item_positive_quantity') THEN
    ALTER TABLE "ReturnItem" ADD CONSTRAINT return_item_positive_quantity CHECK (quantity > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. No orphan ACTIVE carts/wishlists: a live cart must always have an owner.
--    CONVERTED/ABANDONED carts are order history on purpose: checkout and
--    session-merge intentionally clear sessionId there (see checkout.service.ts
--    placeOrder and commerce-session.service.ts mergeCart), so they are exempt.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_owner_required') THEN
    ALTER TABLE "Cart"
      ADD CONSTRAINT cart_owner_required
      CHECK (status <> 'ACTIVE' OR "userId" IS NOT NULL OR "sessionId" IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlist_owner_required') THEN
    ALTER TABLE "Wishlist"
      ADD CONSTRAINT wishlist_owner_required
      CHECK ("userId" IS NOT NULL OR "sessionId" IS NOT NULL);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. One ACTIVE cart per customer / guest session (prevents checkout picking a
--    random cart when a race creates two). Application keeps findFirst as fallback.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "Cart_one_active_per_user"
  ON "Cart" ("userId") WHERE status = 'ACTIVE' AND "userId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Cart_one_active_per_session"
  ON "Cart" ("sessionId") WHERE status = 'ACTIVE' AND "sessionId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Case-insensitive email uniqueness (Postgres UNIQUE is case-sensitive, so
--    User@x.com and user@x.com would otherwise coexist and break login).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_unique"
  ON "User" (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_email_lower_unique"
  ON "NewsletterSubscriber" (lower(email));

-- ---------------------------------------------------------------------------
-- 6. GIN index for shipping-zone country lookups (STRING[] @> queries).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "ShippingZone_countries_gin"
  ON "ShippingZone" USING GIN (countries);

-- ---------------------------------------------------------------------------
-- 7. Trigram index for case-insensitive product search (LIKE %...% / ILIKE).
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Product_name_trgm"
  ON "Product" USING GIN (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 8. Housekeeping (run from cron, NOT on every deploy):
--    Purge expired carts/wishlists and revoked/expired refresh tokens.
-- ---------------------------------------------------------------------------
-- DELETE FROM "Cart" WHERE status = 'ABANDONED' AND "expiresAt" < now() - interval '30 days';
-- DELETE FROM "Wishlist" WHERE "expiresAt" < now() - interval '90 days';
-- DELETE FROM "RefreshToken" WHERE "expiresAt" < now() - interval '7 days';
