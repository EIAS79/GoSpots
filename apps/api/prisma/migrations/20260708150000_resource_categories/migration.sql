-- Backfill schema that historically existed via `db push` but was never in migrate history.
-- Required before 20260708160000_gaming_sections (FK → ResourceCategory).
-- Idempotent for databases that already have these objects.

-- Enums (FOOSBALL / DINING added in later migrations)
DO $$ BEGIN
  CREATE TYPE "ResourceType" AS ENUM (
    'BILLIARD',
    'SNOOKER',
    'POOL',
    'DARTS',
    'PLAYSTATION',
    'PC',
    'BOWLING',
    'MINIGAMES',
    'SWIMMING_POOL',
    'TABLE_TENNIS',
    'ARCADE',
    'CHESS',
    'CARDS',
    'TABLE',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ResourceStatus" AS ENUM (
    'AVAILABLE',
    'BUSY',
    'RESERVED',
    'MAINTENANCE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ResourceCategory" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "imageUrl2" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "slotMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ResourceRate" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "price" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ResourceRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ResourceCategory_shopId_idx" ON "ResourceCategory"("shopId");
CREATE INDEX IF NOT EXISTS "ResourceRate_categoryId_idx" ON "ResourceRate"("categoryId");

DO $$ BEGIN
  ALTER TABLE "ResourceCategory"
    ADD CONSTRAINT "ResourceCategory_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ResourceRate"
    ADD CONSTRAINT "ResourceRate_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ResourceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Resource columns used by later gaming / dining migrations
ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE "Resource"
    ADD CONSTRAINT "Resource_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ResourceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Resource_shopId_categoryId_idx" ON "Resource"("shopId", "categoryId");

-- Promote legacy TEXT columns to enums when still text
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Resource'
      AND column_name = 'type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "Resource"
      ALTER COLUMN "type" DROP DEFAULT,
      ALTER COLUMN "type" TYPE "ResourceType"
        USING (
          CASE
            WHEN upper("type") IN (
              'BILLIARD','SNOOKER','POOL','DARTS','PLAYSTATION','PC','BOWLING',
              'MINIGAMES','SWIMMING_POOL','TABLE_TENNIS','ARCADE','CHESS','CARDS','TABLE','OTHER'
            ) THEN upper("type")::"ResourceType"
            ELSE 'OTHER'::"ResourceType"
          END
        ),
      ALTER COLUMN "type" SET DEFAULT 'OTHER'::"ResourceType";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Resource'
      AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "Resource"
      ALTER COLUMN "status" DROP DEFAULT,
      ALTER COLUMN "status" TYPE "ResourceStatus"
        USING (
          CASE
            WHEN upper("status") IN ('AVAILABLE','BUSY','RESERVED','MAINTENANCE')
              THEN upper("status")::"ResourceStatus"
            ELSE 'AVAILABLE'::"ResourceStatus"
          END
        ),
      ALTER COLUMN "status" SET DEFAULT 'AVAILABLE'::"ResourceStatus";
  END IF;
END $$;
