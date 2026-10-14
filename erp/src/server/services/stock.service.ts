import "server-only";

import { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
const D = (v: number | Prisma.Decimal) => new Prisma.Decimal(v);

export class StockError extends Error {}

/**
 * Local principal: recibe compras y producción terminada, y es el que
 * descuenta los pedidos de la web (salvo que se configure otro).
 * STOCK_MAIN_BRANCH puede indicar el nombre; si no, el de punto de venta más bajo.
 */
export async function mainBranchId(tx: Tx): Promise<string> {
  const byName = process.env.STOCK_MAIN_BRANCH
    ? await tx.branch.findFirst({ where: { name: process.env.STOCK_MAIN_BRANCH, active: true }, select: { id: true } })
    : null;
  if (byName) return byName.id;
  const first = await tx.branch.findFirst({ where: { active: true }, orderBy: [{ pointOfSale: { sort: "asc", nulls: "last" } }, { name: "asc" }], select: { id: true } });
  if (!first) throw new StockError("No hay locales cargados");
  return first.id;
}

/**
 * Suma (o resta, con delta negativo) stock de una variante en un local y
 * mantiene el total de la variante. Devuelve el stock del local y el total.
 */
export async function adjustBranchStock(tx: Tx, variantId: string, branchId: string, delta: number | Prisma.Decimal) {
  const d = D(delta);
  const row = await tx.branchStock.upsert({
    where: { variantId_branchId: { variantId, branchId } },
    update: { quantity: { increment: d } },
    create: { variantId, branchId, quantity: d },
    select: { quantity: true },
  });
  const variant = await tx.productVariant.update({ where: { id: variantId }, data: { stockQty: { increment: d } }, select: { stockQty: true } });
  return { branch: row.quantity, total: variant.stockQty };
}

/** Fija el stock de un local (inventario / carga manual). */
export async function setBranchStock(tx: Tx, variantId: string, branchId: string, quantity: number) {
  const current = await tx.branchStock.findUnique({ where: { variantId_branchId: { variantId, branchId } }, select: { quantity: true } });
  const delta = D(quantity).minus(current?.quantity ?? 0);
  if (delta.isZero()) return { changed: false, before: current?.quantity.toNumber() ?? 0 };
  await adjustBranchStock(tx, variantId, branchId, delta);
  return { changed: true, before: current?.quantity.toNumber() ?? 0 };
}

export interface TransferLine {
  variantId: string;
  quantity: number;
}

/** Pasa mercadería de un local a otro (queda registrado en la auditoría). */
export async function transferStock(tx: Tx, fromBranchId: string, toBranchId: string, lines: TransferLine[], userId: string, notes: string | null) {
  if (fromBranchId === toBranchId) throw new StockError("Elegí locales distintos");
  const valid = lines.filter((l) => l.quantity > 0);
  if (valid.length === 0) throw new StockError("Cargá al menos una cantidad a transferir");
  const [from, to] = await Promise.all([tx.branch.findUnique({ where: { id: fromBranchId } }), tx.branch.findUnique({ where: { id: toBranchId } })]);
  if (!from || !to) throw new StockError("Local inexistente");
  const warnings: string[] = [];
  for (const l of valid) {
    const r = await adjustBranchStock(tx, l.variantId, fromBranchId, -l.quantity);
    await adjustBranchStock(tx, l.variantId, toBranchId, l.quantity);
    if (r.branch.lt(0)) {
      const v = await tx.productVariant.findUnique({ where: { id: l.variantId }, select: { sku: true } });
      warnings.push(`${v?.sku}: ${from.name} queda con stock negativo (${r.branch.toNumber()})`);
    }
  }
  await tx.auditLog.create({
    data: {
      userId,
      entity: "BranchStock",
      entityId: `${fromBranchId}>${toBranchId}`,
      action: "TRANSFER",
      reason: notes,
      data: { from: from.name, to: to.name, lines: valid } as unknown as Prisma.InputJsonValue,
    },
  });
  return { from: from.name, to: to.name, units: valid.reduce((a, l) => a + l.quantity, 0), warnings };
}
