-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "lemonSubscriptionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "lemonCustomerId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "lemonOrderId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "billingCurrency" TEXT NOT NULL DEFAULT 'EUR';
