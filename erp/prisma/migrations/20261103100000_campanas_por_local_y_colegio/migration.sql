-- Colegio del producto, WhatsApp de cada local y local que envía cada campaña
ALTER TABLE "products" ADD COLUMN "school" TEXT;
CREATE INDEX "products_school_idx" ON "products"("school");

ALTER TABLE "branches" ADD COLUMN "whatsapp" TEXT;
UPDATE "branches" SET "whatsapp" = '5493515512455' WHERE "name" = 'Recta Martinolli' AND "whatsapp" IS NULL;
UPDATE "branches" SET "whatsapp" = '5493518032157' WHERE "name" = 'Villa Allende' AND "whatsapp" IS NULL;

ALTER TABLE "campaigns" ADD COLUMN "branchId" TEXT;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
