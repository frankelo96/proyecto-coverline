-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'VALE';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "storeCreditId" TEXT;

-- CreateTable
CREATE TABLE "store_credits" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT,
    "originSaleId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVO',
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_credits_number_key" ON "store_credits"("number");

-- CreateIndex
CREATE UNIQUE INDEX "store_credits_code_key" ON "store_credits"("code");

-- CreateIndex
CREATE INDEX "store_credits_clientId_idx" ON "store_credits"("clientId");

-- CreateIndex
CREATE INDEX "store_credits_status_idx" ON "store_credits"("status");

-- CreateIndex
CREATE INDEX "payments_storeCreditId_idx" ON "payments"("storeCreditId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_storeCreditId_fkey" FOREIGN KEY ("storeCreditId") REFERENCES "store_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_credits" ADD CONSTRAINT "store_credits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_credits" ADD CONSTRAINT "store_credits_originSaleId_fkey" FOREIGN KEY ("originSaleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

