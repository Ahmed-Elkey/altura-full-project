-- The admin application now has a single privileged role. Fail closed if a
-- deployment still contains a STAFF account so no privilege is converted
-- silently.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "role" = 'STAFF') THEN
    RAISE EXCEPTION 'Cannot remove STAFF role while STAFF users still exist';
  END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
CREATE TYPE "UserRole_new" AS ENUM ('CUSTOMER', 'ADMIN');
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';
