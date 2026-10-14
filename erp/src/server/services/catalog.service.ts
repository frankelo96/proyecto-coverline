import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { autoVariantSku } from "@/lib/catalog/variants";
import type { SaveVariantsInput } from "@/lib/validations/catalog";
import { setBranchStock } from "@/server/services/stock.service";

export class CatalogError extends Error {}


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
  const stockChanges: { sku: string; branchId: string; before: number; after: number }[] = [];

  for (const row of input.variants) {
    const sku = (row.sku || autoVariantSku(product.sku, row)).toUpperCase();
    const data = {
      size: row.size,
      color: row.color || null,
      fabric: row.fabric || null,
      sku,
      barcode: row.barcode || null,
      priceAdjustmentPct: new Prisma.Decimal(row.priceAdjustmentPct),
      active: row.active,
    };
    try {
      let variantId: string;
      if (row.id) {
        if (!byId.has(row.id)) throw new CatalogError("Una de las variantes no pertenece a este producto");
        await tx.productVariant.update({ where: { id: row.id }, data });
        variantId = row.id;
        updated++;
      } else {
        variantId = (await tx.productVariant.create({ data: { ...data, productId: product.id }, select: { id: true } })).id;
        created++;
      }
      // El stock se fija por local; el total de la variante se recalcula solo.
      for (const s of row.stocks) {
        const r = await setBranchStock(tx, variantId, s.branchId, s.quantity);
        if (r.changed) stockChanges.push({ sku, branchId: s.branchId, before: r.before, after: s.quantity });
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = JSON.stringify(e.meta ?? {});
        throw new CatalogError(
          target.includes("barcode") ? `El código de barras ${row.barcode} ya está en otro artículo` : target.includes("sku") ? `El SKU ${sku} ya existe` : `Combinación talle ${row.size} repetida`,
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
