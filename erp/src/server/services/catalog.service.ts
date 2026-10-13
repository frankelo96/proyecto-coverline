import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { SaveVariantsInput } from "@/lib/validations/catalog";

export class CatalogError extends Error {}

const autoSku = (productSku: string, size: string, color: string | null) =>
  [productSku, size, color ? color.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() : null].filter(Boolean).join("-");

/**
 * Guarda los talles/colores de un producto. Las variantes no se borran (tienen
 * historial de ventas y producción): se desactivan. Los cambios de stock se auditan.
 */
export async function saveVariants(tx: Prisma.TransactionClient, input: SaveVariantsInput, userId: string) {
  const product = await tx.product.findUnique({ where: { id: input.productId }, include: { variants: true } });
  if (!product) throw new CatalogError("Producto inexistente");
  const byId = new Map(product.variants.map((v) => [v.id, v]));
  let created = 0;
  let updated = 0;
  const stockChanges: { sku: string; before: number; after: number }[] = [];

  for (const row of input.variants) {
    const sku = (row.sku || autoSku(product.sku, row.size, row.color)).toUpperCase();
    const data = {
      size: row.size,
      color: row.color || null,
      sku,
      barcode: row.barcode || null,
      stockQty: new Prisma.Decimal(row.stockQty),
      priceAdjustmentPct: new Prisma.Decimal(row.priceAdjustmentPct),
      active: row.active,
    };
    try {
      if (row.id) {
        const prev = byId.get(row.id);
        if (!prev) throw new CatalogError("Una de las variantes no pertenece a este producto");
        if (!prev.stockQty.equals(data.stockQty)) stockChanges.push({ sku, before: prev.stockQty.toNumber(), after: row.stockQty });
        await tx.productVariant.update({ where: { id: row.id }, data });
        updated++;
      } else {
        await tx.productVariant.create({ data: { ...data, productId: product.id } });
        if (row.stockQty > 0) stockChanges.push({ sku, before: 0, after: row.stockQty });
        created++;
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = JSON.stringify(e.meta ?? {});
        throw new CatalogError(
          target.includes("barcode") ? `El código de barras ${row.barcode} ya está en otro artículo` : target.includes("sku") ? `El SKU ${sku} ya existe` : `Talle ${row.size} repetido`,
        );
      }
      throw e;
    }
  }
  if (stockChanges.length) {
    await tx.auditLog.create({
      data: { userId, entity: "Product", entityId: product.id, action: "STOCK_ADJUST", reason: "Ajuste manual desde el maestro de productos", data: stockChanges },
    });
  }
  return { created, updated };
}
