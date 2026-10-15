import "server-only";

import Decimal from "decimal.js";

import type { Prisma } from "@/generated/prisma/client";
import { isoLocalDate } from "@/lib/dates";
import { MOVEMENT_SIGN, TreasuryError } from "@/lib/treasury/cash";
import { matchStatement, type StatementLine, suggestCategory } from "@/lib/treasury/reconciliation";
import { db } from "@/server/db";
import { addMovement, lockRegister } from "@/server/services/treasury.service";

type Tx = Prisma.TransactionClient;
const RECONCILABLE = ["BANCO", "BILLETERA_VIRTUAL"] as const;

/** Compara el extracto con los movimientos sin conciliar de la cuenta (±7 días alrededor del período del extracto). */
export async function previewReconciliation(registerId: string, lines: StatementLine[]) {
  const register = await db.cashRegister.findUnique({ where: { id: registerId } });
  if (!register || !(RECONCILABLE as readonly string[]).includes(register.kind)) throw new TreasuryError("Elegí una cuenta bancaria o billetera virtual");
  if (lines.length === 0) throw new TreasuryError("El extracto no tiene movimientos");
  const dates = lines.map((l) => l.date).sort();
  const from = new Date(new Date(`${dates[0]}T00:00:00-03:00`).getTime() - 7 * 86_400_000);
  const to = new Date(new Date(`${dates.at(-1)}T23:59:59-03:00`).getTime() + 7 * 86_400_000);
  const movements = await db.cashMovement.findMany({ where: { cashRegisterId: register.id, reconciledAt: null, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "asc" } });
  const system = movements
    .filter((m) => MOVEMENT_SIGN[m.type] !== 0)
    .map((m) => ({ id: m.id, date: isoLocalDate(m.createdAt), amount: MOVEMENT_SIGN[m.type] * m.amount.toNumber(), concept: m.concept }));
  const result = matchStatement(lines, system);
  const categories = await db.expenseCategory.findMany({ where: { active: true }, select: { id: true, name: true } });
  return {
    register: { id: register.id, name: register.name },
    ...result,
    suggestions: Object.fromEntries(result.unmatchedLines.map((l) => [l.row, l.amount < 0 ? suggestCategory(l.description, categories) : null])),
    categories,
  };
}

export interface ReconciliationInput {
  registerId: string;
  matches: { movementId: string; row: number; description: string }[];
  creates: { row: number; date: string; amount: number; description: string; categoryId: string | null }[];
}

/** Marca como conciliados los movimientos emparejados y registra lo que solo estaba en el extracto. */
export async function confirmReconciliation(tx: Tx, input: ReconciliationInput, userId: string) {
  const register = await lockRegister(tx, input.registerId);
  if (!(RECONCILABLE as readonly string[]).includes(register.kind)) throw new TreasuryError("Elegí una cuenta bancaria o billetera virtual");
  const now = new Date();
  let matched = 0;
  for (const m of input.matches) {
    const r = await tx.cashMovement.updateMany({
      where: { id: m.movementId, cashRegisterId: register.id, reconciledAt: null },
      data: { reconciledAt: now, reconciledNote: `Extracto fila ${m.row}: ${m.description}`.slice(0, 250) },
    });
    matched += r.count;
  }
  const method = register.kind === "BANCO" ? "TRANSFERENCIA" : "MERCADO_PAGO";
  for (const c of input.creates) {
    await addMovement(tx, {
      register,
      type: c.amount >= 0 ? "INGRESO" : "EGRESO",
      method,
      amount: new Decimal(Math.abs(c.amount)),
      concept: `Extracto: ${c.description || "sin descripción"}`.slice(0, 250),
      userId,
      expenseCategoryId: c.amount < 0 ? c.categoryId : null,
      createdAt: new Date(`${c.date}T12:00:00-03:00`),
      reconciledAt: now,
      reconciledNote: `Registrado desde el extracto (fila ${c.row})`,
    });
  }
  await tx.auditLog.create({ data: { userId, entity: "CashRegister", entityId: register.id, action: "RECONCILE", data: { matched, created: input.creates.length } } });
  return { matched, created: input.creates.length, name: register.name };
}
