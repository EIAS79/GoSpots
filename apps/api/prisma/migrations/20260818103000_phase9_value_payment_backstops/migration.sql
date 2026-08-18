-- Phase 9 financial-value backstops.
-- A canonical payment may not be replayed into multiple loads of the same
-- customer-value authority. Cross-domain reuse is surfaced by Phase 9
-- reconciliation so historical/legitimate mixed settlement evidence is not
-- destroyed by a cross-table constraint.

CREATE UNIQUE INDEX "StoredValueLedgerEntry_shop_payment_load_unique"
ON "StoredValueLedgerEntry" ("shopId", "paymentId")
WHERE "paymentId" IS NOT NULL
  AND "type" = 'LOAD'
  AND COALESCE("sourceType", '') <> 'TRANSFER';

CREATE UNIQUE INDEX "CustomerPackageLedgerEntry_shop_payment_load_unique"
ON "CustomerPackageLedgerEntry" ("shopId", "paymentId")
WHERE "paymentId" IS NOT NULL
  AND "type" = 'LOAD';
