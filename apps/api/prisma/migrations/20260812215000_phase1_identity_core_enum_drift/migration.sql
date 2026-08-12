-- Phase 1 migration-upgrade testing exposed additional historical schema drift
-- between the canonical Prisma datamodel and the committed migration chain.
-- Reconcile identity/core enum columns in-place without deleting or recreating rows.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SystemRole') THEN
    CREATE TYPE "SystemRole" AS ENUM ('USER', 'SUPER_ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserAccountType') THEN
    CREATE TYPE "UserAccountType" AS ENUM ('VENUE_OWNER', 'VENUE_STAFF');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ShopRole') THEN
    CREATE TYPE "ShopRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReservationStatus') THEN
    CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELED', 'NO_SHOW');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TransactionKind') THEN
    CREATE TYPE "TransactionKind" AS ENUM ('SALE', 'REFUND', 'EXPENSE', 'ADJUSTMENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethod') THEN
    CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'ONLINE', 'OTHER');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "accountType" "UserAccountType" NOT NULL DEFAULT 'VENUE_OWNER',
  ADD COLUMN IF NOT EXISTS "staffHandle" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordSetAt" TIMESTAMP(3);

-- Historical staff records predate accountType. Preserve owners as owners and
-- classify non-owner users with staff/manager memberships as venue staff.
UPDATE "User" u
SET "accountType" = 'VENUE_STAFF'::"UserAccountType"
WHERE NOT EXISTS (SELECT 1 FROM "Shop" s WHERE s."ownerId" = u."id")
  AND EXISTS (
    SELECT 1
    FROM "Membership" m
    WHERE m."userId" = u."id"
      AND m."role"::text IN ('STAFF', 'MANAGER')
  );

-- Existing staff accounts were usable before passwordSetAt existed in the
-- committed migration chain; mark them activated rather than locking them out.
UPDATE "User"
SET "passwordSetAt" = COALESCE("passwordSetAt", CURRENT_TIMESTAMP)
WHERE "accountType" = 'VENUE_STAFF'::"UserAccountType";

DO $$
DECLARE current_type TEXT;
BEGIN
  SELECT c.udt_name INTO current_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'User' AND c.column_name = 'systemRole';

  IF current_type IS NOT NULL AND current_type <> 'SystemRole' THEN
    IF EXISTS (SELECT 1 FROM "User" WHERE "systemRole"::text NOT IN ('USER', 'SUPER_ADMIN')) THEN
      RAISE EXCEPTION 'Cannot migrate User.systemRole: unsupported historical value exists';
    END IF;
    ALTER TABLE "User" ALTER COLUMN "systemRole" DROP DEFAULT;
    ALTER TABLE "User" ALTER COLUMN "systemRole" TYPE "SystemRole"
      USING "systemRole"::text::"SystemRole";
    ALTER TABLE "User" ALTER COLUMN "systemRole" SET DEFAULT 'USER'::"SystemRole";
  END IF;
END $$;

DO $$
DECLARE current_type TEXT;
BEGIN
  SELECT c.udt_name INTO current_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'Membership' AND c.column_name = 'role';

  IF current_type IS NOT NULL AND current_type <> 'ShopRole' THEN
    IF EXISTS (SELECT 1 FROM "Membership" WHERE "role"::text NOT IN ('OWNER', 'MANAGER', 'STAFF')) THEN
      RAISE EXCEPTION 'Cannot migrate Membership.role: unsupported historical value exists';
    END IF;
    ALTER TABLE "Membership" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "Membership" ALTER COLUMN "role" TYPE "ShopRole"
      USING "role"::text::"ShopRole";
    ALTER TABLE "Membership" ALTER COLUMN "role" SET DEFAULT 'STAFF'::"ShopRole";
  END IF;
END $$;

DO $$
DECLARE current_type TEXT;
BEGIN
  SELECT c.udt_name INTO current_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'Reservation' AND c.column_name = 'status';

  IF current_type IS NOT NULL AND current_type <> 'ReservationStatus' THEN
    IF EXISTS (
      SELECT 1 FROM "Reservation"
      WHERE "status"::text NOT IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELED', 'NO_SHOW')
    ) THEN
      RAISE EXCEPTION 'Cannot migrate Reservation.status: unsupported historical value exists';
    END IF;
    ALTER TABLE "Reservation" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Reservation" ALTER COLUMN "status" TYPE "ReservationStatus"
      USING "status"::text::"ReservationStatus";
    ALTER TABLE "Reservation" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"ReservationStatus";
  END IF;
END $$;

DO $$
DECLARE current_type TEXT;
BEGIN
  SELECT c.udt_name INTO current_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'Transaction' AND c.column_name = 'kind';

  IF current_type IS NOT NULL AND current_type <> 'TransactionKind' THEN
    IF EXISTS (SELECT 1 FROM "Transaction" WHERE "kind"::text NOT IN ('SALE', 'REFUND', 'EXPENSE', 'ADJUSTMENT')) THEN
      RAISE EXCEPTION 'Cannot migrate Transaction.kind: unsupported historical value exists';
    END IF;
    ALTER TABLE "Transaction" ALTER COLUMN "kind" DROP DEFAULT;
    ALTER TABLE "Transaction" ALTER COLUMN "kind" TYPE "TransactionKind"
      USING "kind"::text::"TransactionKind";
    ALTER TABLE "Transaction" ALTER COLUMN "kind" SET DEFAULT 'SALE'::"TransactionKind";
  END IF;
END $$;

DO $$
DECLARE current_type TEXT;
BEGIN
  SELECT c.udt_name INTO current_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'Transaction' AND c.column_name = 'method';

  IF current_type IS NOT NULL AND current_type <> 'PaymentMethod' THEN
    IF EXISTS (SELECT 1 FROM "Transaction" WHERE "method"::text NOT IN ('CASH', 'CARD', 'ONLINE', 'OTHER')) THEN
      RAISE EXCEPTION 'Cannot migrate Transaction.method: unsupported historical value exists';
    END IF;
    ALTER TABLE "Transaction" ALTER COLUMN "method" DROP DEFAULT;
    ALTER TABLE "Transaction" ALTER COLUMN "method" TYPE "PaymentMethod"
      USING "method"::text::"PaymentMethod";
    ALTER TABLE "Transaction" ALTER COLUMN "method" SET DEFAULT 'CASH'::"PaymentMethod";
  END IF;
END $$;

DO $$
DECLARE current_type TEXT;
BEGIN
  SELECT c.udt_name INTO current_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'ShopOrder' AND c.column_name = 'paymentMethod';

  IF current_type IS NOT NULL AND current_type <> 'PaymentMethod' THEN
    IF EXISTS (SELECT 1 FROM "ShopOrder" WHERE "paymentMethod"::text NOT IN ('CASH', 'CARD', 'ONLINE', 'OTHER')) THEN
      RAISE EXCEPTION 'Cannot migrate ShopOrder.paymentMethod: unsupported historical value exists';
    END IF;
    ALTER TABLE "ShopOrder" ALTER COLUMN "paymentMethod" DROP DEFAULT;
    ALTER TABLE "ShopOrder" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod"
      USING "paymentMethod"::text::"PaymentMethod";
    ALTER TABLE "ShopOrder" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH'::"PaymentMethod";
  END IF;
END $$;

DO $$
DECLARE current_type TEXT;
BEGIN
  SELECT c.udt_name INTO current_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'PlaySession' AND c.column_name = 'paymentMethod';

  IF current_type IS NOT NULL AND current_type <> 'PaymentMethod' THEN
    IF EXISTS (SELECT 1 FROM "PlaySession" WHERE "paymentMethod"::text NOT IN ('CASH', 'CARD', 'ONLINE', 'OTHER')) THEN
      RAISE EXCEPTION 'Cannot migrate PlaySession.paymentMethod: unsupported historical value exists';
    END IF;
    ALTER TABLE "PlaySession" ALTER COLUMN "paymentMethod" DROP DEFAULT;
    ALTER TABLE "PlaySession" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod"
      USING "paymentMethod"::text::"PaymentMethod";
    ALTER TABLE "PlaySession" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH'::"PaymentMethod";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "User_accountType_idx" ON "User"("accountType");
CREATE INDEX IF NOT EXISTS "Membership_shopId_role_idx" ON "Membership"("shopId", "role");
CREATE INDEX IF NOT EXISTS "Transaction_shopId_kind_idx" ON "Transaction"("shopId", "kind");
