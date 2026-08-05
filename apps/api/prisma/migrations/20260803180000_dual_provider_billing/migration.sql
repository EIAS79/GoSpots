-- Dual-provider billing (Stripe + Mollie) — preserve Lemon history

-- Ensure legacy Subscription enums exist (init used TEXT for tier/status)
DO $$ BEGIN
  CREATE TYPE "SubscriptionTier" AS ENUM (
    'FREE', 'STARTER', 'STANDARD', 'PRO', 'ENTERPRISE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM (
    'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Subscription'
      AND column_name = 'tier' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "Subscription"
      ALTER COLUMN "tier" DROP DEFAULT,
      ALTER COLUMN "tier" TYPE "SubscriptionTier"
        USING (
          CASE upper("tier")
            WHEN 'FREE' THEN 'FREE'::"SubscriptionTier"
            WHEN 'STARTER' THEN 'STARTER'::"SubscriptionTier"
            WHEN 'STANDARD' THEN 'STANDARD'::"SubscriptionTier"
            WHEN 'PRO' THEN 'PRO'::"SubscriptionTier"
            WHEN 'ENTERPRISE' THEN 'ENTERPRISE'::"SubscriptionTier"
            ELSE 'STARTER'::"SubscriptionTier"
          END
        ),
      ALTER COLUMN "tier" SET DEFAULT 'STARTER'::"SubscriptionTier";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Subscription'
      AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "Subscription"
      ALTER COLUMN "status" DROP DEFAULT,
      ALTER COLUMN "status" TYPE "SubscriptionStatus"
        USING (
          CASE upper("status")
            WHEN 'TRIAL' THEN 'TRIAL'::"SubscriptionStatus"
            WHEN 'ACTIVE' THEN 'ACTIVE'::"SubscriptionStatus"
            WHEN 'PAST_DUE' THEN 'PAST_DUE'::"SubscriptionStatus"
            WHEN 'CANCELED' THEN 'CANCELED'::"SubscriptionStatus"
            WHEN 'PAUSED' THEN 'ACTIVE'::"SubscriptionStatus"
            ELSE 'TRIAL'::"SubscriptionStatus"
          END
        ),
      ALTER COLUMN "status" SET DEFAULT 'TRIAL'::"SubscriptionStatus";
  END IF;
END $$;

-- Enums
DO $$ BEGIN
  CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'MOLLIE', 'LEMON_SQUEEZY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "BillingRenewalMode" AS ENUM ('AUTOMATIC_RENEWAL', 'MANUAL_MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "BillingCanonicalSubscriptionStatus" AS ENUM (
    'DRAFT', 'CHECKOUT_PENDING', 'INCOMPLETE', 'REQUIRES_ACTION', 'PROCESSING',
    'TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'PAUSE_PENDING', 'PAUSED',
    'RESUME_PENDING', 'CANCEL_AT_PERIOD_END', 'CANCELED', 'EXPIRED',
    'INCOMPLETE_EXPIRED', 'PROVIDER_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "BillingCanonicalPaymentStatus" AS ENUM (
    'CREATED', 'OPEN', 'REQUIRES_ACTION', 'PENDING', 'PROCESSING', 'AUTHORIZED',
    'PAID', 'FAILED', 'CANCELED', 'EXPIRED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED',
    'REFUNDED', 'DISPUTED', 'CHARGEBACK', 'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "BillingWebhookProcessingStatus" AS ENUM (
    'RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "BillingOperationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

-- BillingAccount
CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "providerCustomerId" TEXT NOT NULL,
    "billingEmail" TEXT,
    "country" TEXT,
    "taxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingAccount_shopId_provider_key" ON "BillingAccount"("shopId", "provider");
CREATE UNIQUE INDEX "BillingAccount_provider_providerCustomerId_key" ON "BillingAccount"("provider", "providerCustomerId");
CREATE INDEX "BillingAccount_shopId_idx" ON "BillingAccount"("shopId");
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BillingSubscription
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "billingAccountId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "providerSubscriptionId" TEXT,
    "providerPriceId" TEXT,
    "planId" TEXT NOT NULL,
    "renewalMode" "BillingRenewalMode" NOT NULL DEFAULT 'AUTOMATIC_RENEWAL',
    "canonicalStatus" "BillingCanonicalSubscriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "providerStatus" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "amountMinor" INTEGER NOT NULL DEFAULT 0,
    "seatQuantity" INTEGER NOT NULL DEFAULT 0,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "nextBillingAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancellationRequestedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "resumeAt" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "lastSuccessfulPaymentAt" TIMESTAMP(3),
    "lastFailedPaymentAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "autoRenewConsentAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingSubscription_provider_providerSubscriptionId_key"
  ON "BillingSubscription"("provider", "providerSubscriptionId");
CREATE INDEX "BillingSubscription_shopId_canonicalStatus_idx"
  ON "BillingSubscription"("shopId", "canonicalStatus");
CREATE INDEX "BillingSubscription_nextBillingAt_idx" ON "BillingSubscription"("nextBillingAt");
CREATE INDEX "BillingSubscription_currentPeriodEnd_idx" ON "BillingSubscription"("currentPeriodEnd");
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Link entitlement Subscription → BillingSubscription
ALTER TABLE "Subscription" ADD COLUMN "billingSubscriptionId" TEXT;
CREATE UNIQUE INDEX "Subscription_billingSubscriptionId_key" ON "Subscription"("billingSubscriptionId");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_billingSubscriptionId_fkey"
  FOREIGN KEY ("billingSubscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BillingSubscriptionAddOn" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "addOnId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountMinor" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BillingSubscriptionAddOn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingSubscriptionAddOn_subscriptionId_addOnId_key"
  ON "BillingSubscriptionAddOn"("subscriptionId", "addOnId");
CREATE INDEX "BillingSubscriptionAddOn_addOnId_idx" ON "BillingSubscriptionAddOn"("addOnId");
ALTER TABLE "BillingSubscriptionAddOn" ADD CONSTRAINT "BillingSubscriptionAddOn_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" "BillingProvider" NOT NULL,
    "providerPaymentId" TEXT,
    "providerInvoiceId" TEXT,
    "providerCheckoutId" TEXT,
    "canonicalStatus" "BillingCanonicalPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "providerStatus" TEXT,
    "amountMinor" INTEGER NOT NULL DEFAULT 0,
    "amountRefundedMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "sequenceType" TEXT,
    "failureCode" TEXT,
    "failureMessageSanitized" TEXT,
    "requiresCustomerAction" BOOLEAN NOT NULL DEFAULT false,
    "actionUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingPayment_provider_providerPaymentId_key"
  ON "BillingPayment"("provider", "providerPaymentId");
CREATE INDEX "BillingPayment_shopId_createdAt_idx" ON "BillingPayment"("shopId", "createdAt");
CREATE INDEX "BillingPayment_subscriptionId_idx" ON "BillingPayment"("subscriptionId");
CREATE INDEX "BillingPayment_providerCheckoutId_idx" ON "BillingPayment"("providerCheckoutId");
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BillingPaymentMethodSummary" (
    "id" TEXT NOT NULL,
    "billingAccountId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "providerPaymentMethodId" TEXT,
    "type" TEXT,
    "cardBrand" TEXT,
    "last4" TEXT,
    "expiryMonth" INTEGER,
    "expiryYear" INTEGER,
    "bankName" TEXT,
    "mandateStatus" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingPaymentMethodSummary_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BillingPaymentMethodSummary_billingAccountId_idx"
  ON "BillingPaymentMethodSummary"("billingAccountId");
CREATE UNIQUE INDEX "BillingPaymentMethodSummary_provider_providerPaymentMethodId_key"
  ON "BillingPaymentMethodSummary"("provider", "providerPaymentMethodId");
ALTER TABLE "BillingPaymentMethodSummary" ADD CONSTRAINT "BillingPaymentMethodSummary_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Evolve BillingWebhookEvent (preserve Lemon rows as PROCESSED)
ALTER TABLE "BillingWebhookEvent" ADD COLUMN IF NOT EXISTS "canonicalEntityId" TEXT;
ALTER TABLE "BillingWebhookEvent" ADD COLUMN IF NOT EXISTS "status" "BillingWebhookProcessingStatus" NOT NULL DEFAULT 'PROCESSED';
ALTER TABLE "BillingWebhookEvent" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BillingWebhookEvent" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "BillingWebhookEvent" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "BillingWebhookEvent" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3);
ALTER TABLE "BillingWebhookEvent" ADD COLUMN IF NOT EXISTS "redactedPayload" JSONB;
-- processedAt was NOT NULL with default; make nullable for in-flight RECEIVED rows
ALTER TABLE "BillingWebhookEvent" ALTER COLUMN "processedAt" DROP NOT NULL;
ALTER TABLE "BillingWebhookEvent" ALTER COLUMN "processedAt" DROP DEFAULT;
CREATE INDEX IF NOT EXISTS "BillingWebhookEvent_status_nextAttemptAt_idx"
  ON "BillingWebhookEvent"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "BillingWebhookEvent_shopId_receivedAt_idx"
  ON "BillingWebhookEvent"("shopId", "receivedAt");

CREATE TABLE "BillingNotificationDelivery" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "notificationType" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT NOT NULL,
    CONSTRAINT "BillingNotificationDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingNotificationDelivery_dedupeKey_key"
  ON "BillingNotificationDelivery"("dedupeKey");
CREATE INDEX "BillingNotificationDelivery_shopId_notificationType_idx"
  ON "BillingNotificationDelivery"("shopId", "notificationType");
ALTER TABLE "BillingNotificationDelivery" ADD CONSTRAINT "BillingNotificationDelivery_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingNotificationDelivery" ADD CONSTRAINT "BillingNotificationDelivery_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BillingOperation" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "BillingOperationStatus" NOT NULL DEFAULT 'PENDING',
    "responseJson" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingOperation_shopId_operationType_idempotencyKey_key"
  ON "BillingOperation"("shopId", "operationType", "idempotencyKey");
CREATE INDEX "BillingOperation_shopId_createdAt_idx" ON "BillingOperation"("shopId", "createdAt");
ALTER TABLE "BillingOperation" ADD CONSTRAINT "BillingOperation_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
