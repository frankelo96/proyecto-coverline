-- CreateTable
CREATE TABLE "branch_stocks" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "woo_links" (
    "id" TEXT NOT NULL,
    "wooProductId" INTEGER NOT NULL,
    "wooVariationId" INTEGER NOT NULL DEFAULT 0,
    "wooSku" TEXT,
    "wooName" TEXT NOT NULL,
    "variantId" TEXT,
    "linkedBy" TEXT,
    "lastPushedQty" INTEGER,
    "lastPushedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "woo_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "woo_orders" (
    "id" TEXT NOT NULL,
    "wooOrderId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "deducted" BOOLEAN NOT NULL DEFAULT false,
    "branchId" TEXT,
    "lines" JSONB NOT NULL,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "customer" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "woo_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "woo_sync_runs" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "woo_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_stocks_branchId_idx" ON "branch_stocks"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_stocks_variantId_branchId_key" ON "branch_stocks"("variantId", "branchId");

-- CreateIndex
CREATE INDEX "woo_links_variantId_idx" ON "woo_links"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "woo_links_wooProductId_wooVariationId_key" ON "woo_links"("wooProductId", "wooVariationId");

-- CreateIndex
CREATE UNIQUE INDEX "woo_orders_wooOrderId_key" ON "woo_orders"("wooOrderId");

-- CreateIndex
CREATE INDEX "woo_sync_runs_startedAt_idx" ON "woo_sync_runs"("startedAt");

-- AddForeignKey
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "woo_links" ADD CONSTRAINT "woo_links_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- El stock existente queda asignado al local principal (el de punto de venta más bajo).
INSERT INTO "branch_stocks" ("id", "variantId", "branchId", "quantity", "updatedAt")
SELECT 'bs_' || v."id", v."id", b."id", v."stockQty", NOW()
FROM "product_variants" v
CROSS JOIN (SELECT "id" FROM "branches" WHERE "active" ORDER BY "pointOfSale" NULLS LAST, "name" LIMIT 1) b
WHERE v."stockQty" <> 0;
