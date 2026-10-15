import "server-only";

import { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export type MaterialMoveReason = "COMPRA" | "ANULACION_COMPRA" | "CONSUMO_OP" | "DEVOLUCION_OP" | "AJUSTE_CORTE" | "AJUSTE" | "IMPORTACION";

export const MATERIAL_MOVE_LABELS: Record<MaterialMoveReason, string> = {
  COMPRA: "Compra",
  ANULACION_COMPRA: "Anulación de compra",
  CONSUMO_OP: "Consumo de producción",
  DEVOLUCION_OP: "Devolución de producción",
  AJUSTE_CORTE: "Ajuste de corte (real vs. teórico)",
  AJUSTE: "Ajuste de inventario",
  IMPORTACION: "Importación",
};

/**
 * Único camino para mover el stock de una materia prima: actualiza la
 * existencia y deja el movimiento en el kardex (para auditar y revertir).
 */
export async function moveRawMaterial(
  tx: Tx,
  m: {
    rawMaterialId: string;
    delta: Prisma.Decimal | number;
    reason: MaterialMoveReason;
    refType?: string | null;
    refId?: string | null;
    unitCost?: Prisma.Decimal | number | null;
    notes?: string | null;
    userId?: string | null;
  },
) {
  const delta = new Prisma.Decimal(m.delta);
  if (delta.isZero()) return null;
  const updated = await tx.rawMaterial.update({ where: { id: m.rawMaterialId }, data: { stockQty: { increment: delta } }, select: { stockQty: true, currentCost: true } });
  await tx.rawMaterialMovement.create({
    data: {
      rawMaterialId: m.rawMaterialId,
      delta,
      reason: m.reason,
      refType: m.refType ?? null,
      refId: m.refId ?? null,
      unitCost: m.unitCost !== undefined && m.unitCost !== null ? new Prisma.Decimal(m.unitCost) : updated.currentCost,
      notes: m.notes ?? null,
      userId: m.userId ?? null,
    },
  });
  return updated.stockQty;
}

/** Lo que una orden de producción consumió neto (consumos menos devoluciones y ajustes), por material. */
export async function netConsumptionOfOrder(tx: Tx, orderId: string) {
  const rows = await tx.rawMaterialMovement.groupBy({ by: ["rawMaterialId"], where: { refType: "OP", refId: orderId }, _sum: { delta: true } });
  return rows.map((r) => ({ rawMaterialId: r.rawMaterialId, consumed: r._sum.delta ? r._sum.delta.neg() : new Prisma.Decimal(0) })).filter((r) => r.consumed.gt(0));
}
