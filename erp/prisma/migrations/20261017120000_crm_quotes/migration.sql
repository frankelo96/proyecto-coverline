-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "lostReason" TEXT;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryTerms" TEXT,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN     "discountPct" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quotes_clientId_idx" ON "quotes"("clientId");

-- CreateIndex
CREATE INDEX "quote_items_quoteId_idx" ON "quote_items"("quoteId");

