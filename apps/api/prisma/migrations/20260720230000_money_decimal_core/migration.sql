-- M1 money: convert confirmed commercial Float columns → DECIMAL(19,4).
-- Preserves values via CAST + ROUND (no silent truncate beyond 4dp).
-- Leaves billingDiscountPercent as double precision (percent, not money).
-- Never reset.

-- MenuItem
ALTER TABLE "MenuItem"
  ALTER COLUMN "price" TYPE DECIMAL(19,4)
  USING ROUND(("price")::numeric, 4);

-- ResourceRate
ALTER TABLE "ResourceRate"
  ALTER COLUMN "price" TYPE DECIMAL(19,4)
  USING ROUND(("price")::numeric, 4);

-- Resource
ALTER TABLE "Resource"
  ALTER COLUMN "hourlyRate" TYPE DECIMAL(19,4)
  USING ROUND(("hourlyRate")::numeric, 4);

-- Reservation billing amounts (not discount %)
ALTER TABLE "Reservation"
  ALTER COLUMN "billedAmount" TYPE DECIMAL(19,4)
  USING CASE
    WHEN "billedAmount" IS NULL THEN NULL
    ELSE ROUND(("billedAmount")::numeric, 4)
  END;

ALTER TABLE "Reservation"
  ALTER COLUMN "billingBaseAmount" TYPE DECIMAL(19,4)
  USING CASE
    WHEN "billingBaseAmount" IS NULL THEN NULL
    ELSE ROUND(("billingBaseAmount")::numeric, 4)
  END;

-- PlaySession
ALTER TABLE "PlaySession"
  ALTER COLUMN "amount" TYPE DECIMAL(19,4)
  USING ROUND(("amount")::numeric, 4);

-- ShopOrder
ALTER TABLE "ShopOrder"
  ALTER COLUMN "total" TYPE DECIMAL(19,4)
  USING ROUND(("total")::numeric, 4);

ALTER TABLE "ShopOrder"
  ALTER COLUMN "reservationFee" TYPE DECIMAL(19,4)
  USING CASE
    WHEN "reservationFee" IS NULL THEN NULL
    ELSE ROUND(("reservationFee")::numeric, 4)
  END;

-- ShopOrderLine
ALTER TABLE "ShopOrderLine"
  ALTER COLUMN "unitPrice" TYPE DECIMAL(19,4)
  USING ROUND(("unitPrice")::numeric, 4);

-- Transaction
ALTER TABLE "Transaction"
  ALTER COLUMN "amount" TYPE DECIMAL(19,4)
  USING ROUND(("amount")::numeric, 4);

-- TransactionLineItem
ALTER TABLE "TransactionLineItem"
  ALTER COLUMN "unitPrice" TYPE DECIMAL(19,4)
  USING ROUND(("unitPrice")::numeric, 4);

ALTER TABLE "TransactionLineItem"
  ALTER COLUMN "total" TYPE DECIMAL(19,4)
  USING ROUND(("total")::numeric, 4);

-- ShopLoss
ALTER TABLE "ShopLoss"
  ALTER COLUMN "amount" TYPE DECIMAL(19,4)
  USING ROUND(("amount")::numeric, 4);
