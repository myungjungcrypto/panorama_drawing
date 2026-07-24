-- AlterTable
ALTER TABLE "Case" ADD COLUMN "shareToken" TEXT;

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "linkUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "position" TEXT NOT NULL DEFAULT 'community',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Case_shareToken_key" ON "Case"("shareToken");

