-- CreateEnum
CREATE TYPE "PurchaseKind" AS ENUM ('MERCADERIA', 'SERVICIO_TALLER');

-- CreateEnum
CREATE TYPE "PurchaseItemType" AS ENUM ('MATERIA_PRIMA', 'AVIO_INSUMO', 'PRODUCTO_TERMINADO', 'SERVICIO_CONFECCION', 'SERVICIO_PERSONALIZACION');

-- CreateEnum
CREATE TYPE "ProductSourcing" AS ENUM ('FABRICADO', 'REVENTA');

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "kind" "PurchaseKind" NOT NULL,
ADD COLUMN     "number" SERIAL NOT NULL,
ADD COLUMN     "otherTaxes" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "perceptionIibb" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "perceptionIva" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pointOfSale" INTEGER,
ADD COLUMN     "vat105" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vat21" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vat27" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "workshopId" TEXT,
ALTER COLUMN "supplierId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "purchase_items" ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "itemType" "PurchaseItemType" NOT NULL,
ADD COLUMN     "previousUnitCost" DECIMAL(14,4),
ADD COLUMN     "productVariantId" TEXT,
ADD COLUMN     "stockQuantity" DECIMAL(14,4),
ADD COLUMN     "stockUnitCost" DECIMAL(14,4),
ADD COLUMN     "updatedCost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workshopRemitId" TEXT,
ALTER COLUMN "rawMaterialId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "sourcing" "ProductSourcing" NOT NULL DEFAULT 'FABRICADO';

-- AlterTable
ALTER TABLE "workshops" ADD COLUMN     "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "taxCondition" "TaxCondition" NOT NULL DEFAULT 'MONOTRIBUTO';

-- AlterTable
ALTER TABLE "workshop_remits" ADD COLUMN     "purchaseId" TEXT;

-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN     "paymentOrderId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "paymentOrderId" TEXT;

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "supplierId" TEXT,
    "workshopId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "PaymentMethod" NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_number_key" ON "payment_orders"("number");

-- CreateIndex
CREATE INDEX "payment_orders_supplierId_date_idx" ON "payment_orders"("supplierId", "date");

-- CreateIndex
CREATE INDEX "payment_orders_workshopId_date_idx" ON "payment_orders"("workshopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_number_key" ON "purchases"("number");

-- CreateIndex
CREATE INDEX "purchases_workshopId_date_idx" ON "purchases"("workshopId", "date");

-- CreateIndex
CREATE INDEX "purchases_kind_date_idx" ON "purchases"("kind", "date");

-- CreateIndex
CREATE INDEX "purchase_items_rawMaterialId_idx" ON "purchase_items"("rawMaterialId");

-- CreateIndex
CREATE INDEX "purchase_items_productVariantId_idx" ON "purchase_items"("productVariantId");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_workshopRemitId_fkey" FOREIGN KEY ("workshopRemitId") REFERENCES "workshop_remits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_remits" ADD CONSTRAINT "workshop_remits_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "payment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

