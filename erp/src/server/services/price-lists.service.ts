import { Prisma } from "@/generated/prisma/client";
import type { PriceListRule } from "@/lib/pos/price-lists";
import { SaleError } from "@/lib/pos/sale-math";

type Tx = Prisma.TransactionClient;
type Reader = Pick<Tx, "priceList">;

const toRule = (l: { id: string; name: string; adjustmentPct: Prisma.Decimal; items: { productId: string; netPrice: Prisma.Decimal }[] }): PriceListRule => ({
  id: l.id,
  name: l.name,
  adjustmentPct: l.adjustmentPct.toNumber(),
  prices: Object.fromEntries(l.items.map((i) => [i.productId, i.netPrice.toNumber()])),
});

/** Listas activas con sus precios fijos (para el POS y presupuestos). */
export async function activePriceListRules(db: Reader): Promise<PriceListRule[]> {
  const lists = await db.priceList.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { items: { select: { productId: true, netPrice: true } } } });
  return lists.map(toRule);
}

export async function priceListRule(db: Reader, id: string): Promise<PriceListRule> {
  const l = await db.priceList.findUnique({ where: { id }, include: { items: { select: { productId: true, netPrice: true } } } });
  if (!l || !l.active) throw new SaleError("Lista de precios inexistente o inactiva");
  return toRule(l);
}

export async function savePriceList(tx: Tx, input: { id: string | null; name: string; adjustmentPct: number; notes: string | null; active: boolean }, userId: string) {
  const data = { name: input.name, adjustmentPct: new Prisma.Decimal(input.adjustmentPct), notes: input.notes, active: input.active };
  const dup = await tx.priceList.findFirst({ where: { name: { equals: input.name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) }, select: { id: true } });
  if (dup) throw new SaleError(`Ya existe la lista "${input.name}"`);
  const saved = input.id ? await tx.priceList.update({ where: { id: input.id }, data }) : await tx.priceList.create({ data });
  await tx.auditLog.create({ data: { userId, entity: "PriceList", entityId: saved.id, action: input.id ? "UPDATE" : "CREATE", data: { ...input } } });
  return saved;
}

/** Precios fijos por producto: null o 0 quita el precio fijo (vuelve al ajuste general). */
export async function savePriceListItems(tx: Tx, priceListId: string, items: { productId: string; netPrice: number | null }[], userId: string) {
  for (const i of items) {
    if (i.netPrice && i.netPrice > 0) {
      await tx.priceListItem.upsert({
        where: { priceListId_productId: { priceListId, productId: i.productId } },
        update: { netPrice: new Prisma.Decimal(i.netPrice) },
        create: { priceListId, productId: i.productId, netPrice: new Prisma.Decimal(i.netPrice) },
      });
    } else {
      await tx.priceListItem.deleteMany({ where: { priceListId, productId: i.productId } });
    }
  }
  await tx.auditLog.create({ data: { userId, entity: "PriceList", entityId: priceListId, action: "PRICES", data: { items } } });
  return items.length;
}
