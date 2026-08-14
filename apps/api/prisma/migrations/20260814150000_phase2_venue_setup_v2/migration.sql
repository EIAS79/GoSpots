-- Phase 2 v2 — venue profile, floor/resource configuration, rates, catalog and devices.
-- Expand-first. Existing resources retain their display names and receive stable codes.

ALTER TYPE "ResourceType" ADD VALUE IF NOT EXISTS 'PRIVATE_ROOM';
ALTER TYPE "ResourceType" ADD VALUE IF NOT EXISTS 'EQUIPMENT';
ALTER TYPE "ResourceType" ADD VALUE IF NOT EXISTS 'ATTRACTION';
ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'RECEIPT_PRINTER';
ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'KITCHEN_PRINTER';
ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'CASH_DRAWER';
ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'ACCESS_SCANNER';

CREATE TYPE "CatalogItemKind" AS ENUM ('PRODUCT', 'SERVICE');
CREATE TYPE "ResourceConfigurationState" AS ENUM ('ENABLED', 'MAINTENANCE', 'DISABLED', 'OFFLINE_DEVICE');
CREATE TYPE "VenueZoneType" AS ENUM ('ROOM', 'RESTAURANT', 'BAR', 'PRIVATE_ROOM', 'GAMING_AREA', 'OTHER');
CREATE TYPE "OperationsBillingMode" AS ENUM ('HOURLY', 'PER_MINUTE', 'FIXED_PRICE', 'FIXED_DURATION', 'PER_PERSON', 'PER_GAME', 'FREE');
CREATE TYPE "DeviceClaimState" AS ENUM ('UNCLAIMED', 'CLAIMED');

ALTER TABLE "Shop"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "branchCode" TEXT,
  ADD COLUMN "region" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "taxId" TEXT,
  ADD COLUMN "taxProfile" JSONB,
  ADD COLUMN "receiptBranding" JSONB,
  ADD COLUMN "logoUrl" TEXT;

ALTER TABLE "OrganizationShop" ADD COLUMN "branchCode" TEXT;
CREATE UNIQUE INDEX "OrganizationShop_organizationId_branchCode_key"
  ON "OrganizationShop"("organizationId", "branchCode");

ALTER TABLE "MenuItem"
  ADD COLUMN "kind" "CatalogItemKind" NOT NULL DEFAULT 'PRODUCT',
  ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'UNIT',
  ADD COLUMN "taxCategoryKey" TEXT,
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "barcode" TEXT;
CREATE UNIQUE INDEX "MenuItem_shopId_sku_key" ON "MenuItem"("shopId", "sku");
CREATE UNIQUE INDEX "MenuItem_shopId_barcode_key" ON "MenuItem"("shopId", "barcode");

ALTER TABLE "ResourceCategory" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "GamingSection"
  ADD COLUMN "zoneType" "VenueZoneType" NOT NULL DEFAULT 'GAMING_AREA',
  ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Resource"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "configurationState" "ResourceConfigurationState" NOT NULL DEFAULT 'ENABLED',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "layoutX" INTEGER,
  ADD COLUMN "layoutY" INTEGER,
  ADD COLUMN "layoutWidth" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "layoutHeight" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "layoutRotation" INTEGER NOT NULL DEFAULT 0;

UPDATE "Resource"
SET "code" = 'R-' || upper(substr(md5("id"), 1, 8))
WHERE "code" IS NULL;

UPDATE "Resource"
SET "configurationState" = 'MAINTENANCE'
WHERE "status" = 'MAINTENANCE';

ALTER TABLE "Resource" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Resource_shopId_code_key" ON "Resource"("shopId", "code");
CREATE UNIQUE INDEX "Resource_shopId_id_key" ON "Resource"("shopId", "id");
CREATE UNIQUE INDEX "ResourceCategory_shopId_id_key" ON "ResourceCategory"("shopId", "id");
CREATE UNIQUE INDEX "GamingSection_shopId_id_key" ON "GamingSection"("shopId", "id");

ALTER TABLE "Device"
  ADD COLUMN "claimState" "DeviceClaimState" NOT NULL DEFAULT 'UNCLAIMED',
  ADD COLUMN "stationLabel" TEXT,
  ADD COLUMN "softwareVersion" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "claimedById" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "OperationsRatePlan"
  ADD COLUMN "billingMode" "OperationsBillingMode" NOT NULL DEFAULT 'HOURLY',
  ADD COLUMN "unitPriceMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fixedDurationMinutes" INTEGER,
  ADD COLUMN "minimumChargeMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "graceMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "membershipOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "happyHour" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "groupPackage" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "startMinute" INTEGER,
  ADD COLUMN "endMinute" INTEGER,
  ADD COLUMN "holidayDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "OperationsRatePlan"
SET "unitPriceMinor" = "hourlyRateMinor"
WHERE "unitPriceMinor" = 0;

ALTER TABLE "OperationsSession"
  ADD COLUMN "billingMode" "OperationsBillingMode" NOT NULL DEFAULT 'HOURLY',
  ADD COLUMN "unitPriceMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fixedDurationMinutes" INTEGER,
  ADD COLUMN "minimumChargeMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "graceMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "participantCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "gameCount" INTEGER NOT NULL DEFAULT 1;

UPDATE "OperationsSession"
SET "unitPriceMinor" = "hourlyRateMinor"
WHERE "unitPriceMinor" = 0;

ALTER TABLE "ResourceCategory" ADD CONSTRAINT "ResourceCategory_version_positive"
  CHECK ("version" > 0) NOT VALID;
ALTER TABLE "GamingSection" ADD CONSTRAINT "GamingSection_version_positive"
  CHECK ("version" > 0) NOT VALID;
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_version_positive"
  CHECK ("version" > 0) NOT VALID;
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_layout_dimensions_positive"
  CHECK ("layoutWidth" > 0 AND "layoutHeight" > 0 AND "layoutRotation" >= 0 AND "layoutRotation" < 360) NOT VALID;
ALTER TABLE "Device" ADD CONSTRAINT "Device_version_positive"
  CHECK ("version" > 0) NOT VALID;
ALTER TABLE "OperationsRatePlan" ADD CONSTRAINT "OperationsRatePlan_phase2_values_valid"
  CHECK (
    "version" > 0 AND "hourlyRateMinor" >= 0 AND "unitPriceMinor" >= 0
    AND "minimumMinutes" >= 0 AND "minimumChargeMinor" >= 0 AND "graceMinutes" >= 0
    AND ("capMinor" IS NULL OR "capMinor" >= "minimumChargeMinor")
    AND ("fixedDurationMinutes" IS NULL OR "fixedDurationMinutes" > 0)
    AND ("startMinute" IS NULL OR ("startMinute" >= 0 AND "startMinute" < 1440))
    AND ("endMinute" IS NULL OR ("endMinute" >= 0 AND "endMinute" < 1440))
    AND "weekdays" <@ ARRAY[0,1,2,3,4,5,6]::INTEGER[]
    AND ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" < "effectiveTo")
  ) NOT VALID;
ALTER TABLE "OperationsSession" ADD CONSTRAINT "OperationsSession_phase2_values_valid"
  CHECK (
    "unitPriceMinor" >= 0 AND "minimumChargeMinor" >= 0 AND "graceMinutes" >= 0
    AND "participantCount" > 0 AND "gameCount" > 0
    AND ("fixedDurationMinutes" IS NULL OR "fixedDurationMinutes" > 0)
  ) NOT VALID;

ALTER TABLE "OperationsRatePlan" ADD CONSTRAINT "OperationsRatePlan_resource_same_shop_fkey"
  FOREIGN KEY ("shopId", "resourceId") REFERENCES "Resource"("shopId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "OperationsRatePlan" ADD CONSTRAINT "OperationsRatePlan_category_same_shop_fkey"
  FOREIGN KEY ("shopId", "resourceCategoryId") REFERENCES "ResourceCategory"("shopId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "ResourceCategory" VALIDATE CONSTRAINT "ResourceCategory_version_positive";
ALTER TABLE "GamingSection" VALIDATE CONSTRAINT "GamingSection_version_positive";
ALTER TABLE "Resource" VALIDATE CONSTRAINT "Resource_version_positive";
ALTER TABLE "Resource" VALIDATE CONSTRAINT "Resource_layout_dimensions_positive";
ALTER TABLE "Device" VALIDATE CONSTRAINT "Device_version_positive";
ALTER TABLE "OperationsRatePlan" VALIDATE CONSTRAINT "OperationsRatePlan_phase2_values_valid";
ALTER TABLE "OperationsSession" VALIDATE CONSTRAINT "OperationsSession_phase2_values_valid";
ALTER TABLE "OperationsRatePlan" VALIDATE CONSTRAINT "OperationsRatePlan_resource_same_shop_fkey";
ALTER TABLE "OperationsRatePlan" VALIDATE CONSTRAINT "OperationsRatePlan_category_same_shop_fkey";
