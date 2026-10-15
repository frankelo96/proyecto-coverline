/**
 * Tesorería: saldos de cajas, turnos (apertura y cierre ciego), retiros a caja
 * negra, transferencias entre cajas/cuentas y movimientos manuales.
 *
 * Reglas:
 *  - Una caja que trabaja por turnos (cajas diarias de local) solo acepta
 *    movimientos con un turno abierto: lo del cajón nunca se mezcla con tesorería.
 *  - Las cajas físicas (diaria, negra) no pueden quedar con saldo negativo.
 *  - Cada operación bloquea la fila de la caja (SELECT … FOR UPDATE).
 */
import { randomUUID } from "node:crypto";

import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import type { CashMovementType, CashRegisterKind, PaymentMethod } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { balanceOf, countAdjustment, MOVEMENT_SIGN, TreasuryError } from "@/lib/treasury/cash";

type Tx = Prisma.TransactionClient;
type Db = Tx | Prisma.DefaultPrismaClient;
const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());

export const PHYSICAL_KINDS: CashRegisterKind[] = ["CAJA_DIARIA", "CAJA_ADMINISTRATIVA", "CAJA_RESGUARDO"];

export async function lockRegister(tx: Tx, registerId: string) {
  await tx.$queryRaw`SELECT id FROM cash_registers WHERE id = ${registerId} FOR UPDATE`;
  const register = await tx.cashRegister.findUnique({ where: { id: registerId } });
  if (!register || !register.active) throw new TreasuryError("Caja o cuenta inexistente o inactiva");
  return register;
}

export async function registerBalance(db: Db, registerId: string): Promise<number> {
  const groups = await (db as Tx).cashMovement.groupBy({ by: ["type"], where: { cashRegisterId: registerId }, _sum: { amount: true } });
  return balanceOf(groups.map((g) => ({ type: g.type, amount: g._sum.amount?.toString() ?? "0" })));
}

export async function openSessionOf(db: Db, registerId: string) {
  return (db as Tx).cashRegisterSession.findFirst({ where: { cashRegisterId: registerId, status: "ABIERTA" } });
}

type Register = Awaited<ReturnType<typeof lockRegister>>;

export interface MovementInput {
  register: Register;
  type: CashMovementType;
  method: PaymentMethod;
  amount: number | Decimal;
  concept: string;
  userId: string;
  saleId?: string | null;
  paymentOrderId?: string | null;
  receiptId?: string | null;
  chequeId?: string | null;
  transferGroupId?: string | null;
  expenseCategoryId?: string | null;
}

/** Registra un movimiento validando turno abierto y saldo de cajas físicas. La caja debe estar bloqueada. */
export async function addMovement(tx: Tx, m: MovementInput) {
  const amount = new Decimal(m.amount.toString());
  if (amount.lte(0)) throw new TreasuryError("El importe debe ser mayor a 0");
  let sessionId: string | null = null;
  if (m.register.requiresSession) {
    const session = await openSessionOf(tx, m.register.id);
    if (!session) throw new TreasuryError(`"${m.register.name}" no tiene un turno abierto`);
    sessionId = session.id;
  }
  if (MOVEMENT_SIGN[m.type] < 0 && PHYSICAL_KINDS.includes(m.register.kind)) {
    const balance = await registerBalance(tx, m.register.id);
    if (amount.gt(balance)) {
      throw new TreasuryError(`Saldo insuficiente en "${m.register.name}": hay ${formatMoney(balance)} y se intenta retirar ${formatMoney(amount.toNumber())}`);
    }
  }
  return tx.cashMovement.create({
    data: {
      cashRegisterId: m.register.id,
      sessionId,
      type: m.type,
      method: m.method,
      amount: D(amount.toDecimalPlaces(2)),
      concept: m.concept.slice(0, 250),
      saleId: m.saleId ?? null,
      paymentOrderId: m.paymentOrderId ?? null,
      receiptId: m.receiptId ?? null,
      chequeId: m.chequeId ?? null,
      transferGroupId: m.transferGroupId ?? null,
      expenseCategoryId: m.expenseCategoryId ?? null,
      userId: m.userId,
    },
  });
}

export async function openSession(tx: Tx, input: { registerId: string; countedAmount: number; notes: string | null }, userId: string) {
  const register = await lockRegister(tx, input.registerId);
  if (!register.requiresSession) throw new TreasuryError(`"${register.name}" no trabaja por turnos`);
  if (await openSessionOf(tx, register.id)) throw new TreasuryError(`"${register.name}" ya tiene un turno abierto`);
  const expected = await registerBalance(tx, register.id);
  const session = await tx.cashRegisterSession.create({
    data: {
      cashRegisterId: register.id,
      openedById: userId,
      openingAmount: D(input.countedAmount),
      openingExpected: D(expected),
      notes: input.notes,
    },
  });
  const adj = countAdjustment(expected, input.countedAmount);
  if (adj.type) {
    await tx.cashMovement.create({
      data: {
        cashRegisterId: register.id,
        sessionId: session.id,
        type: adj.type,
        method: "EFECTIVO",
        amount: D(adj.amount),
        concept: `Diferencia al abrir el turno (esperado ${formatMoney(expected)}, contado ${formatMoney(input.countedAmount)})`,
        userId,
      },
    });
  }
  return { session, expected, difference: adj.difference };
}

export async function transferBetween(
  tx: Tx,
  input: { fromId: string; toId: string; amount: number; concept: string },
  userId: string,
) {
  if (input.fromId === input.toId) throw new TreasuryError("Elegí cajas distintas");
  // Bloqueo en orden estable para evitar deadlocks entre transferencias cruzadas.
  const [a, b] = [input.fromId, input.toId].sort();
  const locked = new Map([[a, await lockRegister(tx, a)], [b, await lockRegister(tx, b)]]);
  const from = locked.get(input.fromId)!;
  const to = locked.get(input.toId)!;
  const physical = PHYSICAL_KINDS.includes(from.kind) && PHYSICAL_KINDS.includes(to.kind);
  const method: PaymentMethod = physical || PHYSICAL_KINDS.includes(from.kind) || PHYSICAL_KINDS.includes(to.kind) ? "EFECTIVO" : "TRANSFERENCIA";
  const group = randomUUID();
  await addMovement(tx, { register: from, type: "TRANSFERENCIA_SALIDA", method, amount: input.amount, concept: `${input.concept} → ${to.name}`, userId, transferGroupId: group });
  await addMovement(tx, { register: to, type: "TRANSFERENCIA_ENTRADA", method, amount: input.amount, concept: `${input.concept} ← ${from.name}`, userId, transferGroupId: group });
  return { from: from.name, to: to.name };
}

export async function manualMovement(
  tx: Tx,
  input: { registerId: string; direction: "IN" | "OUT"; amount: number; concept: string; expenseCategoryId?: string | null },
  userId: string,
) {
  const register = await lockRegister(tx, input.registerId);
  const method: PaymentMethod = PHYSICAL_KINDS.includes(register.kind) ? "EFECTIVO" : "TRANSFERENCIA";
  const category = input.direction === "OUT" && input.expenseCategoryId ? await tx.expenseCategory.findUnique({ where: { id: input.expenseCategoryId } }) : null;
  if (input.direction === "OUT" && input.expenseCategoryId && !category) throw new TreasuryError("Categoría de gasto inexistente");
  await addMovement(tx, {
    register,
    type: input.direction === "IN" ? "INGRESO" : "EGRESO",
    method,
    amount: input.amount,
    concept: input.concept,
    userId,
    expenseCategoryId: category?.id ?? null,
  });
  await tx.auditLog.create({
    data: { userId, entity: "CashRegister", entityId: register.id, action: input.direction === "IN" ? "MANUAL_IN" : "MANUAL_OUT", reason: input.concept, data: { amount: input.amount } },
  });
  return register;
}

/**
 * Cierre ciego: el cajero declara el efectivo contado sin ver el esperado. La
 * diferencia queda como sobrante/faltante. Opcionalmente retira a caja negra y
 * deja el resto como fondo para el próximo turno.
 */
export async function closeSession(
  tx: Tx,
  input: { sessionId: string; declaredAmount: number; withdrawToId: string | null; withdrawAmount: number; notes: string | null },
  userId: string,
) {
  const s = await tx.cashRegisterSession.findUnique({ where: { id: input.sessionId } });
  if (!s) throw new TreasuryError("Turno inexistente");
  const register = await lockRegister(tx, s.cashRegisterId);
  const session = await tx.cashRegisterSession.findUniqueOrThrow({ where: { id: s.id } });
  if (session.status !== "ABIERTA") throw new TreasuryError("El turno ya está cerrado");

  const expected = await registerBalance(tx, register.id);
  const adj = countAdjustment(expected, input.declaredAmount);
  if (adj.type) {
    await tx.cashMovement.create({
      data: {
        cashRegisterId: register.id,
        sessionId: session.id,
        type: adj.type,
        method: "EFECTIVO",
        amount: D(adj.amount),
        concept: `${adj.type === "AJUSTE_SOBRANTE" ? "Sobrante" : "Faltante"} en cierre de turno`,
        userId,
      },
    });
  }

  if (input.withdrawAmount > 0) {
    if (!input.withdrawToId) throw new TreasuryError("Elegí a qué caja va el retiro");
    if (input.withdrawAmount > input.declaredAmount) throw new TreasuryError("El retiro no puede superar el efectivo contado");
    await transferBetween(tx, { fromId: register.id, toId: input.withdrawToId, amount: input.withdrawAmount, concept: "Retiro de cierre de turno" }, userId);
  }

  const closed = await tx.cashRegisterSession.update({
    where: { id: session.id },
    data: {
      status: "CERRADA",
      closedById: userId,
      closedAt: new Date(),
      expectedAmount: D(expected),
      declaredAmount: D(input.declaredAmount),
      difference: D(adj.difference),
      notes: [session.notes, input.notes].filter(Boolean).join(" · ") || null,
    },
  });
  if (adj.type) {
    await tx.auditLog.create({
      data: { userId, entity: "CashRegisterSession", entityId: session.id, action: "CLOSE_DIFFERENCE", data: { expected, declared: input.declaredAmount, difference: adj.difference } },
    });
  }
  return { session: closed, expected, difference: adj.difference, leftAsFund: input.declaredAmount - input.withdrawAmount };
}
