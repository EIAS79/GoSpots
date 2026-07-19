-- CreateEnum
CREATE TYPE "NoteImportance" AS ENUM ('INFO', 'NORMAL', 'IMPORTANT', 'URGENT');

-- CreateTable
CREATE TABLE "ShopNote" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "importance" "NoteImportance" NOT NULL DEFAULT 'NORMAL',
    "relevantAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopNote_shopId_archivedAt_relevantAt_idx" ON "ShopNote"("shopId", "archivedAt", "relevantAt");

-- CreateIndex
CREATE INDEX "ShopNote_shopId_createdAt_idx" ON "ShopNote"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "ShopNote" ADD CONSTRAINT "ShopNote_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
