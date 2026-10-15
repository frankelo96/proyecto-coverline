-- CreateTable
CREATE TABLE "product_material_rules" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "sizeQuantities" JSONB,
    "alternatives" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_material_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_movements" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "delta" DECIMAL(14,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "unitCost" DECIMAL(14,4),
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_material_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_material_rules_productId_rawMaterialId_key" ON "product_material_rules"("productId", "rawMaterialId");

-- CreateIndex
CREATE INDEX "raw_material_movements_rawMaterialId_createdAt_idx" ON "raw_material_movements"("rawMaterialId", "createdAt");

-- CreateIndex
CREATE INDEX "raw_material_movements_refType_refId_idx" ON "raw_material_movements"("refType", "refId");

-- AddForeignKey
ALTER TABLE "product_material_rules" ADD CONSTRAINT "product_material_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_material_rules" ADD CONSTRAINT "product_material_rules_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_movements" ADD CONSTRAINT "raw_material_movements_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Variantes repetidas con color o tela vacíos (los NULL no chocan en el índice único común).
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_unique_combo" ON "product_variants" ("productId", "size", COALESCE("color", ''), COALESCE("fabric", ''));
