CREATE TABLE "ReservationDepositCheckoutAttempt" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'STRIPE',
  "providerSessionId" TEXT NOT NULL,
  "providerPaymentIntentId" TEXT,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "idempotencyKey" TEXT NOT NULL,
  "checkoutUrlHash" TEXT,
  "lastProviderEvent" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "succeededAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  CONSTRAINT "ReservationDepositCheckoutAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReservationDepositCheckoutAttempt_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReservationDepositCheckoutAttempt_providerSessionId_key"
  ON "ReservationDepositCheckoutAttempt"("providerSessionId");
CREATE UNIQUE INDEX "ReservationDepositCheckoutAttempt_providerPaymentIntentId_key"
  ON "ReservationDepositCheckoutAttempt"("providerPaymentIntentId");
CREATE UNIQUE INDEX "ReservationDepositCheckoutAttempt_shopId_idempotencyKey_key"
  ON "ReservationDepositCheckoutAttempt"("shopId", "idempotencyKey");
CREATE INDEX "ReservationDepositCheckoutAttempt_shopId_reservationId_createdAt_idx"
  ON "ReservationDepositCheckoutAttempt"("shopId", "reservationId", "createdAt");
CREATE INDEX "ReservationDepositCheckoutAttempt_shopId_status_updatedAt_idx"
  ON "ReservationDepositCheckoutAttempt"("shopId", "status", "updatedAt");

ALTER TABLE "ReservationDepositCheckoutAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReservationDepositCheckoutAttempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ReservationDepositCheckoutAttempt_tenant_policy"
  ON "ReservationDepositCheckoutAttempt"
  USING (app_tenant_rls_ok("shopId"))
  WITH CHECK (app_tenant_rls_ok("shopId"));
