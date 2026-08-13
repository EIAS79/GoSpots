-- Phase 1 migration-upgrade testing exposed legacy core columns that were
-- represented as TEXT in early migrations while the canonical Prisma model now
-- uses PostgreSQL enums. Reconcile those columns in-place and preserve all rows.

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
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionTier') THEN
    CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'STARTER', 'STANDARD', 'PRO', 'ENTERPRISE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'PAUSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ResourceType') THEN
    CREATE TYPE "ResourceType" AS ENUM ('BILLIARD', 'FOOSBALL', 'SNOOKER', 'POOL', 'DARTS', 'PLAYSTATION', 'PC', 'BOWLING', 'MINIGAMES', 'SWIMMING_POOL', 'TABLE_TENNIS', 'ARCADE', 'CHESS', 'CARDS', 'TABLE', 'DINING', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ResourceStatus') THEN
    CREATE TYPE "ResourceStatus" AS ENUM ('AVAILABLE', 'BUSY', 'RESERVED', 'MAINTENANCE');
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
    SELECT 1 FROM "Membership" m
    WHERE m."userId" = u."id" AND m."role"::text IN ('STAFF', 'MANAGER')
  );

UPDATE "User"
SET "passwordSetAt" = COALESCE("passwordSetAt", CURRENT_TIMESTAMP)
WHERE "accountType" = 'VENUE_STAFF'::"UserAccountType";

DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='User' AND column_name='systemRole';
  IF t IS NOT NULL AND t <> 'SystemRole' THEN
    IF EXISTS (SELECT 1 FROM "User" WHERE "systemRole"::text NOT IN ('USER','SUPER_ADMIN')) THEN
      RAISE EXCEPTION 'Unsupported User.systemRole value';
    END IF;
    ALTER TABLE "User" ALTER COLUMN "systemRole" DROP DEFAULT;
    ALTER TABLE "User" ALTER COLUMN "systemRole" TYPE "SystemRole" USING "systemRole"::text::"SystemRole";
    ALTER TABLE "User" ALTER COLUMN "systemRole" SET DEFAULT 'USER'::"SystemRole";
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='Membership' AND column_name='role';
  IF t IS NOT NULL AND t <> 'ShopRole' THEN
    IF EXISTS (SELECT 1 FROM "Membership" WHERE "role"::text NOT IN ('OWNER','MANAGER','STAFF')) THEN
      RAISE EXCEPTION 'Unsupported Membership.role value';
    END IF;
    ALTER TABLE "Membership" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "Membership" ALTER COLUMN "role" TYPE "ShopRole" USING "role"::text::"ShopRole";
    ALTER TABLE "Membership" ALTER COLUMN "role" SET DEFAULT 'STAFF'::"ShopRole";
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='Subscription' AND column_name='tier';
  IF t IS NOT NULL AND t <> 'SubscriptionTier' THEN
    IF EXISTS (SELECT 1 FROM "Subscription" WHERE "tier"::text NOT IN ('FREE','STARTER','STANDARD','PRO','ENTERPRISE')) THEN
      RAISE EXCEPTION 'Unsupported Subscription.tier value';
    END IF;
    ALTER TABLE "Subscription" ALTER COLUMN "tier" DROP DEFAULT;
    ALTER TABLE "Subscription" ALTER COLUMN "tier" TYPE "SubscriptionTier" USING "tier"::text::"SubscriptionTier";
    ALTER TABLE "Subscription" ALTER COLUMN "tier" SET DEFAULT 'STARTER'::"SubscriptionTier";
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='Subscription' AND column_name='status';
  IF t IS NOT NULL AND t <> 'SubscriptionStatus' THEN
    IF EXISTS (SELECT 1 FROM "Subscription" WHERE "status"::text NOT IN ('TRIAL','ACTIVE','PAST_DUE','CANCELED','PAUSED')) THEN
      RAISE EXCEPTION 'Unsupported Subscription.status value';
    END IF;
    ALTER TABLE "Subscription" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Subscription" ALTER COLUMN "status" TYPE "SubscriptionStatus" USING "status"::text::"SubscriptionStatus";
    ALTER TABLE "Subscription" ALTER COLUMN "status" SET DEFAULT 'TRIAL'::"SubscriptionStatus";
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ResourceCategory' AND column_name='type';
  IF t IS NOT NULL AND t <> 'ResourceType' THEN
    IF EXISTS (SELECT 1 FROM "ResourceCategory" WHERE "type"::text NOT IN ('BILLIARD','FOOSBALL','SNOOKER','POOL','DARTS','PLAYSTATION','PC','BOWLING','MINIGAMES','SWIMMING_POOL','TABLE_TENNIS','ARCADE','CHESS','CARDS','TABLE','DINING','OTHER')) THEN
      RAISE EXCEPTION 'Unsupported ResourceCategory.type value';
    END IF;
    ALTER TABLE "ResourceCategory" ALTER COLUMN "type" DROP DEFAULT;
    ALTER TABLE "ResourceCategory" ALTER COLUMN "type" TYPE "ResourceType" USING "type"::text::"ResourceType";
    ALTER TABLE "ResourceCategory" ALTER COLUMN "type" SET DEFAULT 'OTHER'::"ResourceType";
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='Resource' AND column_name='type';
  IF t IS NOT NULL AND t <> 'ResourceType' THEN
    IF EXISTS (SELECT 1 FROM "Resource" WHERE "type"::text NOT IN ('BILLIARD','FOOSBALL','SNOOKER','POOL','DARTS','PLAYSTATION','PC','BOWLING','MINIGAMES','SWIMMING_POOL','TABLE_TENNIS','ARCADE','CHESS','CARDS','TABLE','DINING','OTHER')) THEN
      RAISE EXCEPTION 'Unsupported Resource.type value';
    END IF;
    ALTER TABLE "Resource" ALTER COLUMN "type" DROP DEFAULT;
    ALTER TABLE "Resource" ALTER COLUMN "type" TYPE "ResourceType" USING "type"::text::"ResourceType";
    ALTER TABLE "Resource" ALTER COLUMN "type" SET DEFAULT 'OTHER'::"ResourceType";
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='Resource' AND column_name='status';
  IF t IS NOT NULL AND t <> 'ResourceStatus' THEN
    IF EXISTS (SELECT 1 FROM "Resource" WHERE "status"::text NOT IN ('AVAILABLE','BUSY','RESERVED','MAINTENANCE')) THEN
      RAISE EXCEPTION 'Unsupported Resource.status value';
    END IF;
    ALTER TABLE "Resource" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Resource" ALTER COLUMN "status" TYPE "ResourceStatus" USING "status"::text::"ResourceStatus";
    ALTER TABLE "Resource" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE'::"ResourceStatus";
  END IF;
END $$;

-- Reservation.status participates in the SQL-only overlap exclusion predicate.
-- Drop/recreate that constraint around the type conversion so PostgreSQL never
-- attempts to compare the new enum to the old predicate's TEXT constants.
DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='Reservation' AND column_name='status';
  IF t IS NOT NULL AND t <> 'ReservationStatus' THEN
    IF EXISTS (SELECT 1 FROM "Reservation" WHERE "status"::text NOT IN ('PENDING','CONFIRMED','CHECKED_IN','COMPLETED','CANCELED','NO_SHOW')) THEN
      RAISE EXCEPTION 'Unsupported Reservation.status value';
    END IF;
    ALTER TABLE "Reservation" DROP CONSTRAINT IF EXISTS "Reservation_resource_tstzrange_excl";
    ALTER TABLE "Reservation" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Reservation" ALTER COLUMN "status" TYPE "ReservationStatus" USING "status"::text::"ReservationStatus";
    ALTER TABLE "Reservation" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"ReservationStatus";
    ALTER TABLE "Reservation"
      ADD CONSTRAINT "Reservation_resource_tstzrange_excl"
      EXCLUDE USING gist (
        "resourceId" WITH =,
        tsrange("startsAt", "endsAt", '[)') WITH &&
      )
      WHERE (
        "resourceId" IS NOT NULL
        AND "status" IN ('PENDING'::"ReservationStatus", 'CONFIRMED'::"ReservationStatus", 'CHECKED_IN'::"ReservationStatus")
      );
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='Transaction' AND column_name='kind';
  IF t IS NOT NULL AND t <> 'TransactionKind' THEN
    IF EXISTS (SELECT 1 FROM "Transaction" WHERE "kind"::text NOT IN ('SALE','REFUND','EXPENSE','ADJUSTMENT')) THEN
      RAISE EXCEPTION 'Unsupported Transaction.kind value';
    END IF;
    ALTER TABLE "Transaction" ALTER COLUMN "kind" DROP DEFAULT;
    ALTER TABLE "Transaction" ALTER COLUMN "kind" TYPE "TransactionKind" USING "kind"::text::"TransactionKind";
    ALTER TABLE "Transaction" ALTER COLUMN "kind" SET DEFAULT 'SALE'::"TransactionKind";
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='Transaction' AND column_name='method';
  IF t IS NOT NULL AND t <> 'PaymentMethod' THEN
    IF EXISTS (SELECT 1 FROM "Transaction" WHERE "method"::text NOT IN ('CASH','CARD','ONLINE','OTHER')) THEN
      RAISE EXCEPTION 'Unsupported Transaction.method value';
    END IF;
    ALTER TABLE "Transaction" ALTER COLUMN "method" DROP DEFAULT;
    ALTER TABLE "Transaction" ALTER COLUMN "method" TYPE "PaymentMethod" USING "method"::text::"PaymentMethod";
    ALTER TABLE "Transaction" ALTER COLUMN "method" SET DEFAULT 'CASH'::"PaymentMethod";
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='ShopOrder' AND column_name='paymentMethod';
  IF t IS NOT NULL AND t <> 'PaymentMethod' THEN
    IF EXISTS (SELECT 1 FROM "ShopOrder" WHERE "paymentMethod"::text NOT IN ('CASH','CARD','ONLINE','OTHER')) THEN
      RAISE EXCEPTION 'Unsupported ShopOrder.paymentMethod value';
    END IF;
    ALTER TABLE "ShopOrder" ALTER COLUMN "paymentMethod" DROP DEFAULT;
    ALTER TABLE "ShopOrder" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod" USING "paymentMethod"::text::"PaymentMethod";
    ALTER TABLE "ShopOrder" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH'::"PaymentMethod";
  END IF;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  SELECT udt_name INTO t FROM information_schema.columns
  WHERE table_schema='public' AND table_name='PlaySession' AND column_name='paymentMethod';
  IF t IS NOT NULL AND t <> 'PaymentMethod' THEN
    IF EXISTS (SELECT 1 FROM "PlaySession" WHERE "paymentMethod"::text NOT IN ('CASH','CARD','ONLINE','OTHER')) THEN
      RAISE EXCEPTION 'Unsupported PlaySession.paymentMethod value';
    END IF;
    ALTER TABLE "PlaySession" ALTER COLUMN "paymentMethod" DROP DEFAULT;
    ALTER TABLE "PlaySession" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod" USING "paymentMethod"::text::"PaymentMethod";
    ALTER TABLE "PlaySession" ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH'::"PaymentMethod";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "User_accountType_idx" ON "User"("accountType");
CREATE INDEX IF NOT EXISTS "Membership_shopId_role_idx" ON "Membership"("shopId", "role");
CREATE INDEX IF NOT EXISTS "Transaction_shopId_kind_idx" ON "Transaction"("shopId", "kind");
