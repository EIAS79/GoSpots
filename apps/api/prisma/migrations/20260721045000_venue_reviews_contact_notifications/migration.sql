-- Venue reviews, contact messages, in-app notifications
-- (historically present via db push; required for app + optional RLS).

DO $$ BEGIN
  CREATE TYPE "VenueReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'SYSTEM',
    'TRIAL',
    'SUBSCRIPTION',
    'RESERVATION',
    'OPERATIONS',
    'BILLING',
    'STAFF'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "VenueReview" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "VenueReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VenueReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContactMessage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "section" TEXT NOT NULL DEFAULT 'system',
    "dedupeKey" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VenueReview_shopId_status_createdAt_idx"
  ON "VenueReview"("shopId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ContactMessage_shopId_createdAt_idx"
  ON "ContactMessage"("shopId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_shopId_createdAt_idx"
  ON "Notification"("shopId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_shopId_userId_readAt_idx"
  ON "Notification"("shopId", "userId", "readAt");
CREATE INDEX IF NOT EXISTS "Notification_shopId_archivedAt_createdAt_idx"
  ON "Notification"("shopId", "archivedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_shopId_section_createdAt_idx"
  ON "Notification"("shopId", "section", "createdAt");

DO $$ BEGIN
  CREATE UNIQUE INDEX "Notification_shopId_userId_dedupeKey_key"
    ON "Notification"("shopId", "userId", "dedupeKey");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "VenueReview"
    ADD CONSTRAINT "VenueReview_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContactMessage"
    ADD CONSTRAINT "ContactMessage_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
