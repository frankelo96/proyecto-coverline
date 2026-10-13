-- CreateEnum
CREATE TYPE "SaleKind" AS ENUM ('VENTA', 'DEVOLUCION');

-- CreateEnum
CREATE TYPE "ArcaStatus" AS ENUM ('NO_APLICA', 'PENDIENTE', 'AUTORIZADO', 'RECHAZADO');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "arcaAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "arcaAuthorizedAt" TIMESTAMP(3),
ADD COLUMN     "arcaError" TEXT,
ADD COLUMN     "arcaLockedAt" TIMESTAMP(3),
ADD COLUMN     "arcaObservations" JSONB,
ADD COLUMN     "arcaRequestedNumber" INTEGER,
ADD COLUMN     "arcaStatus" "ArcaStatus" NOT NULL DEFAULT 'NO_APLICA',
ADD COLUMN     "kind" "SaleKind" NOT NULL DEFAULT 'VENTA',
ADD COLUMN     "originalSaleId" TEXT,
ADD COLUMN     "returnReason" TEXT;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "originalItemId" TEXT,
ADD COLUMN     "restocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "arca_tokens" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sign" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arca_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arca_tokens_service_key" ON "arca_tokens"("service");

-- CreateIndex
CREATE INDEX "sales_arcaStatus_idx" ON "sales"("arcaStatus");

-- CreateIndex
CREATE INDEX "sales_originalSaleId_idx" ON "sales"("originalSaleId");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_originalSaleId_fkey" FOREIGN KEY ("originalSaleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_originalItemId_fkey" FOREIGN KEY ("originalItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

