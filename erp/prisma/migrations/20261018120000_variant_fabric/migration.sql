-- DropIndex
DROP INDEX "product_variants_productId_size_color_key";

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "fabric" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_size_color_fabric_key" ON "product_variants"("productId", "size", "color", "fabric");

