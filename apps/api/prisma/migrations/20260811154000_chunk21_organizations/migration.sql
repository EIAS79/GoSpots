-- Chunk 21 — Organization / Multi-Location (expand-only).
-- Shop remains the operational/tenant boundary. Organization coordinates Shops.

CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'ANALYST', 'OPERATOR');
CREATE TYPE "OrganizationAccessMode" AS ENUM ('ALL_SHOPS', 'EXPLICIT');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "settings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMembership" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL,
  "accessMode" "OrganizationAccessMode" NOT NULL DEFAULT 'EXPLICIT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationShop" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "displayName" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "sharedCatalogEnabled" BOOLEAN NOT NULL DEFAULT false,
  "inheritedSettings" JSONB,
  "overrideSettings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationShop_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_createdById_createdAt_idx" ON "Organization"("createdById", "createdAt");
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");
CREATE INDEX "OrganizationMembership_userId_role_idx" ON "OrganizationMembership"("userId", "role");
CREATE UNIQUE INDEX "OrganizationShop_shopId_key" ON "OrganizationShop"("shopId");
CREATE UNIQUE INDEX "OrganizationShop_organizationId_shopId_key" ON "OrganizationShop"("organizationId", "shopId");
CREATE INDEX "OrganizationShop_organizationId_sortOrder_idx" ON "OrganizationShop"("organizationId", "sortOrder");

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationShop" ADD CONSTRAINT "OrganizationShop_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationShop" ADD CONSTRAINT "OrganizationShop_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Organization rows intentionally do not use the single-shop app_tenant_rls_ok policy:
-- group reads span multiple Shops. Every API query is membership-scoped first, and
-- cross-shop finance aggregation temporarily uses RLS bypass only after that check.
-- Operational Shop tables keep their existing FORCE RLS policies unchanged.
