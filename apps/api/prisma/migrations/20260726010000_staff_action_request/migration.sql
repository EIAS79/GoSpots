-- Staff one-time privileged edit requests (menu / game billing).
CREATE TYPE "StaffActionKind" AS ENUM ('MENU_ITEM_UPDATE', 'RESOURCE_UNIT_UPDATE', 'RESOURCE_CATEGORY_UPDATE');
CREATE TYPE "StaffActionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "StaffActionRequest" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "kind" "StaffActionKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL DEFAULT '',
    "proposedPatch" TEXT NOT NULL,
    "requiredPermission" TEXT NOT NULL,
    "status" "StaffActionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "approverUserId" TEXT,
    "resolveNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffActionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffActionRequest_shopId_status_createdAt_idx" ON "StaffActionRequest"("shopId", "status", "createdAt");
CREATE INDEX "StaffActionRequest_shopId_requesterUserId_createdAt_idx" ON "StaffActionRequest"("shopId", "requesterUserId", "createdAt");
CREATE INDEX "StaffActionRequest_expiresAt_idx" ON "StaffActionRequest"("expiresAt");

ALTER TABLE "StaffActionRequest" ADD CONSTRAINT "StaffActionRequest_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffActionRequest" ADD CONSTRAINT "StaffActionRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffActionRequest" ADD CONSTRAINT "StaffActionRequest_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
