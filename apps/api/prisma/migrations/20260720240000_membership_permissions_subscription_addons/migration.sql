-- Expand-only: relational permissions / add-ons (CSV columns retained for dual-read).

CREATE TABLE "MembershipPermission" (
    "membershipId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "MembershipPermission_pkey" PRIMARY KEY ("membershipId","permission")
);

CREATE TABLE "SubscriptionAddOn" (
    "subscriptionId" TEXT NOT NULL,
    "addOnId" TEXT NOT NULL,

    CONSTRAINT "SubscriptionAddOn_pkey" PRIMARY KEY ("subscriptionId","addOnId")
);

CREATE INDEX "MembershipPermission_permission_idx" ON "MembershipPermission"("permission");

CREATE INDEX "SubscriptionAddOn_addOnId_idx" ON "SubscriptionAddOn"("addOnId");

ALTER TABLE "MembershipPermission" ADD CONSTRAINT "MembershipPermission_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscriptionAddOn" ADD CONSTRAINT "SubscriptionAddOn_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill permissions from CSV (skip empty; keep '*' as a single row).
INSERT INTO "MembershipPermission" ("membershipId", "permission")
SELECT m."id", trim(both FROM p.perm)
FROM "Membership" m
CROSS JOIN LATERAL unnest(string_to_array(m."permissions", ',')) AS p(perm)
WHERE m."permissions" IS NOT NULL
  AND trim(both FROM m."permissions") <> ''
  AND trim(both FROM p.perm) <> ''
ON CONFLICT DO NOTHING;

-- Backfill add-ons from CSV.
INSERT INTO "SubscriptionAddOn" ("subscriptionId", "addOnId")
SELECT s."id", trim(both FROM a.addon)
FROM "Subscription" s
CROSS JOIN LATERAL unnest(string_to_array(s."addOns", ',')) AS a(addon)
WHERE s."addOns" IS NOT NULL
  AND trim(both FROM s."addOns") <> ''
  AND trim(both FROM a.addon) <> ''
ON CONFLICT DO NOTHING;
