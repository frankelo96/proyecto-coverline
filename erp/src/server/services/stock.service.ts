import "server-only";

import { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
const D = (v: number | Prisma.Decimal) => new Prisma.Decimal(v);

export class StockError extends Error {}

/** Orden de los locales en pantallas e informes: locales por punto de venta y al final el mayorista. */
export const BRANCH_ORDER: Prisma.BranchOrderByWithRelationInput[] = [{ kind: "asc" }, { pointOfSale: { sort: "asc", nulls: "last" } }, { name: "asc" }];

/**
 * Local principal: recibe compras y producción para stock.
 * STOCK_MAIN_BRANCH puede indicar el nombre; si no, el de punto de venta más bajo.
 */
export async function mainBranchId(tx: Tx): Promise<string> {
  const byName = process.env.STOCK_MAIN_BRANCH
    ? await tx.branch.findFirst({ where: { name: process.env.STOCK_MAIN_BRANCH, active: true }, select: { id: true } })
    : null;
  if (byName) return byName.id;
  const first = await tx.branch.findFirst({ where: { active: true, kind: "LOCAL" }, orderBy: BRANCH_ORDER, select: { id: true } });
  if (!first) throw new StockError("No hay locales cargados");
  return first.id;
}

/** Stock mayorista: recibe la producción de pedidos personalizados de clientes. */
export async function wholesaleBranchId(tx: Tx): Promise<string> {
  const b = await tx.branch.findFirst({ where: { active: true, kind: "MAYORISTA" }, orderBy: { name: "asc" }, select: { id: true } });
  return b?.id ?? mainBranchId(tx);
}

/**
 * Stock que alimenta la tienda web: suma de los locales (sin el mayorista).
 * En escolar cada colegio está en un solo local, así que es el stock de ese local;
 * en los demás rubros es el stock general de los dos locales.
 */
export async function webStockByVariant(tx: Pick<Tx, "branchStock">, variantIds?: string[]): Promise<Map<string, number>> {
  const rows = await tx.branchStock.groupBy({
    by: ["variantId"],
    where: { branch: { kind: "LOCAL", active: true }, ...(variantIds ? { variantId: { in: variantIds } } : {}) },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.variantId, r._sum.quantity?.toNumber() ?? 0]));
}

/**
 * Local del que sale un pedido web: el local con más stock de esa variante
 * (así un escolar se descuenta del local que vende ese colegio); a igualdad, el principal.
 */
export async function webOrderBranchId(tx: Tx, variantId: string): Promise<string> {
  const main = await mainBranchId(tx);
  const rows = await tx.branchStock.findMany({ where: { variantId, branch: { kind: "LOCAL", active: true } }, select: { branchId: true, quantity: true } });
  let best = { id: main, qty: rows.find((r) => r.branchId === main)?.quantity.toNumber() ?? 0 };
  for (const r of rows) if (r.quantity.toNumber() > best.qty) best = { id: r.branchId, qty: r.quantity.toNumber() };
  return best.id;
}

export type StockMoveReason =
  | "VENTA"
  | "DEVOLUCION"
  | "ANULACION_VENTA"
  | "COMPRA"
  | "ANULACION_COMPRA"
  | "PRODUCCION"
  | "WEB"
  | "WEB_DEVOLUCION"
  | "TRANSFERENCIA"
  | "AJUSTE"
  | "CONTEO"
  | "INGRESO"
  | "EGRESO"
  | "IMPORTACION"
  | "PEDIDO";

export const STOCK_MOVE_LABELS: Record<StockMoveReason, string> = {
  VENTA: "Venta",
  DEVOLUCION: "Devolución de cliente",
  ANULACION_VENTA: "Anulación de venta",
  COMPRA: "Compra",
  ANULACION_COMPRA: "Anulación de compra",
  PRODUCCION: "Ingreso de producción",
  WEB: "Pedido web",
  WEB_DEVOLUCION: "Pedido web cancelado",
  TRANSFERENCIA: "Transferencia",
  AJUSTE: "Ajuste manual",
  CONTEO: "Conteo de inventario",
  INGRESO: "Ingreso escaneado",
  EGRESO: "Egreso escaneado",
  IMPORTACION: "Importación",
  PEDIDO: "Entrega de pedido",
};

/** De dónde viene el movimiento (queda en el kardex). */
export interface StockMove {
  reason: StockMoveReason;
  refType?: string | null;
  refId?: string | null;
  userId?: string | null;
  notes?: string | null;
}

/**
 * Suma (o resta, con delta negativo) stock de una variante en un local,
 * mantiene el total de la variante y registra el movimiento en el kardex.
 * Devuelve el stock del local y el total.
 */
export async function adjustBranchStock(tx: Tx, variantId: string, branchId: string, delta: number | Prisma.Decimal, move: StockMove) {
  const d = D(delta);
  const row = await tx.branchStock.upsert({
    where: { variantId_branchId: { variantId, branchId } },
    update: { quantity: { increment: d } },
    create: { variantId, branchId, quantity: d },
    select: { quantity: true },
  });
  const variant = await tx.productVariant.update({ where: { id: variantId }, data: { stockQty: { increment: d } }, select: { stockQty: true } });
  if (!d.isZero()) {
    await tx.stockMovement.create({
      data: {
        variantId,
        branchId,
        delta: d,
        balanceAfter: row.quantity,
        reason: move.reason,
        refType: move.refType ?? null,
        refId: move.refId ?? null,
        userId: move.userId ?? null,
        notes: move.notes ?? null,
      },
    });
  }
  return { branch: row.quantity, total: variant.stockQty };
}

/** Fija el stock de un local (inventario / carga manual). */
export async function setBranchStock(tx: Tx, variantId: string, branchId: string, quantity: number, move: StockMove) {
  const current = await tx.branchStock.findUnique({ where: { variantId_branchId: { variantId, branchId } }, select: { quantity: true } });
  const delta = D(quantity).minus(current?.quantity ?? 0);
  if (delta.isZero()) return { changed: false, before: current?.quantity.toNumber() ?? 0 };
  await adjustBranchStock(tx, variantId, branchId, delta, move);
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
    const move = { reason: "TRANSFERENCIA" as const, refType: "TRANSFERENCIA", userId, notes: `${from.name} → ${to.name}${notes ? ` · ${notes}` : ""}` };
    const r = await adjustBranchStock(tx, l.variantId, fromBranchId, -l.quantity, move);
    await adjustBranchStock(tx, l.variantId, toBranchId, l.quantity, move);
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

const SCAN_LABELS = { INGRESO: "Ingreso", EGRESO: "Egreso", CONTEO: "Conteo de inventario", TRANSFERENCIA: "Transferencia" } as const;

/**
 * Aplica lo escaneado con el lector: ingreso (+), egreso (−), conteo (fija el
 * stock contado) o transferencia a otro local. Queda en la auditoría con las diferencias.
 */
export async function applyScannedStock(
  tx: Tx,
  input: { mode: keyof typeof SCAN_LABELS; branchId: string; toBranchId: string | null; lines: TransferLine[]; notes: string | null },
  userId: string,
) {
  const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw new StockError("Local inexistente");
  if (input.mode === "TRANSFERENCIA") {
    const r = await transferStock(tx, input.branchId, input.toBranchId!, input.lines, userId, input.notes ?? "Transferencia escaneada");
    return { message: `Transferidas ${r.units} unidades de ${r.from} a ${r.to}`, warnings: r.warnings, variantIds: input.lines.map((l) => l.variantId) };
  }
  const detail: { variantId: string; before: number; after: number }[] = [];
  for (const l of input.lines) {
    if (input.mode === "CONTEO") {
      const r = await setBranchStock(tx, l.variantId, branch.id, l.quantity, { reason: "CONTEO", userId, notes: input.notes });
      if (r.changed) detail.push({ variantId: l.variantId, before: r.before, after: l.quantity });
    } else {
      if (l.quantity <= 0) continue;
      const delta = input.mode === "INGRESO" ? l.quantity : -l.quantity;
      const r = await adjustBranchStock(tx, l.variantId, branch.id, delta, { reason: input.mode === "INGRESO" ? "INGRESO" : "EGRESO", userId, notes: input.notes });
      detail.push({ variantId: l.variantId, before: r.branch.toNumber() - delta, after: r.branch.toNumber() });
    }
  }
  await tx.auditLog.create({
    data: {
      userId,
      entity: "BranchStock",
      entityId: branch.id,
      action: `SCAN_${input.mode}`,
      reason: input.notes,
      data: { branch: branch.name, lines: detail } as unknown as Prisma.InputJsonValue,
    },
  });
  const units = input.lines.reduce((a, l) => a + l.quantity, 0);
  const negatives = detail.filter((d) => d.after < 0).length;
  const message =
    input.mode === "CONTEO"
      ? `Conteo de ${branch.name}: ${input.lines.length} artículos contados, ${detail.length} con diferencia ajustada`
      : `${SCAN_LABELS[input.mode]} en ${branch.name}: ${units} unidades`;
  return { message, warnings: negatives ? [`${negatives} artículos quedaron con stock negativo`] : [], variantIds: input.lines.map((l) => l.variantId) };
}

/** Guarda el stock mínimo de cada variante en cada local (crea la fila de stock en 0 si no existía). */
export async function saveStockMinimums(tx: Tx, items: { variantId: string; branchId: string; minQty: number }[], userId: string) {
  for (const i of items) {
    await tx.branchStock.upsert({
      where: { variantId_branchId: { variantId: i.variantId, branchId: i.branchId } },
      update: { minQty: D(i.minQty) },
      create: { variantId: i.variantId, branchId: i.branchId, quantity: D(0), minQty: D(i.minQty) },
    });
  }
  await tx.auditLog.create({
    data: { userId, entity: "BranchStock", entityId: "minimos", action: "UPDATE", data: { items } as unknown as Prisma.InputJsonValue },
  });
  return items.length;
}
