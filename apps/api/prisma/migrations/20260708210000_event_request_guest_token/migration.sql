-- Guest status link for public event request follow-up (no account required).
ALTER TABLE "EventRequest" ADD COLUMN "guestToken" TEXT;

CREATE UNIQUE INDEX "EventRequest_guestToken_key" ON "EventRequest"("guestToken");
