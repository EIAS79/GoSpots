-- Guest ↔ staff live support chats (token-private)
CREATE TYPE "GuestChatStatus" AS ENUM ('WAITING', 'OPEN', 'PAUSED', 'ENDED');
CREATE TYPE "GuestChatSender" AS ENUM ('GUEST', 'STAFF');

CREATE TABLE "GuestChat" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "guestToken" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "status" "GuestChatStatus" NOT NULL DEFAULT 'WAITING',
    "staffJoinedAt" TIMESTAMP(3),
    "staffUserId" TEXT,
    "lastGuestPingAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedBy" "GuestChatSender",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sender" "GuestChatSender" NOT NULL,
    "staffUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestChat_guestToken_key" ON "GuestChat"("guestToken");
CREATE INDEX "GuestChat_shopId_status_updatedAt_idx" ON "GuestChat"("shopId", "status", "updatedAt");
CREATE INDEX "GuestChat_shopId_createdAt_idx" ON "GuestChat"("shopId", "createdAt");
CREATE INDEX "GuestChatMessage_chatId_createdAt_idx" ON "GuestChatMessage"("chatId", "createdAt");

ALTER TABLE "GuestChat" ADD CONSTRAINT "GuestChat_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestChatMessage" ADD CONSTRAINT "GuestChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "GuestChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
