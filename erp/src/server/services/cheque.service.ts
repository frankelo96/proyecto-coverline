/**
 * Cartera de cheques y eCheqs (de terceros y propios).
 */
import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import { formatMoney } from "@/lib/format";
import {
  assertCollectable,
  assertTransition,
  chequeLabel,
  ChequeError,
  validateChequeDates,
} from "@/lib/treasury/cheques";
import type { ChequeAction, ChequeData } from "@/lib/validations/treasury";
import { addMovement, lockRegister } from "@/server/services/treasury.service";

type Tx = Prisma.TransactionClient;
const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());

/** Días para reclamar una deuda reabierta por cheque rechazado o devuelto. */
const REOPENED_DEBT_DUE_DAYS = 0;

export async function receiveThirdPartyCheque(tx: Tx, data: ChequeData, amount: number, clientId: string | null, userId: string) {
  const issueDate = new Date(data.issueDate);
  const paymentDate = new Date(data.paymentDate);
  validateChequeDates(issueDate, paymentDate);
  const dup = await tx.cheque.findFirst({
    where: { kind: "TERCERO", bank: { equals: data.bank, mode: "insensitive" }, number: data.number, status: { notIn: ["ANULADO"] } },
    select: { id: true },
  });
  if (dup) throw new ChequeError(`El cheque ${data.bank} N° ${data.number} ya está registrado`);
  return tx.cheque.create({
    data: {
      kind: "TERCERO",
      format: data.format,
      status: "EN_CARTERA",
      bank: data.bank,
      number: data.number,
      issuerName: data.issuerName,
      issuerCuit: data.issuerCuit,
      amount: D(amount),
      issueDate,
      paymentDate,
      clientId,
      createdById: userId,
    },
  });
}

export async function issueOwnCheque(
  tx: Tx,
  input: { format: "FISICO" | "ECHEQ"; bankRegisterId: string; number: string; amount: number; issueDate: Date; paymentDate: Date; deliveredTo: string; paymentOrderId: string },
  userId: string,
) {
  validateChequeDates(input.issueDate, input.paymentDate);
  const bank = await tx.cashRegister.findUnique({ where: { id: input.bankRegisterId } });
  if (!bank || bank.kind !== "BANCO" || !bank.active) throw new ChequeError("Los cheques propios se emiten desde una cuenta bancaria");
  const dup = await tx.cheque.findFirst({ where: { kind: "PROPIO", cashRegisterId: bank.id, number: input.number, status: { not: "ANULADO" } }, select: { id: true } });
  if (dup) throw new ChequeError(`Ya existe el cheque propio N° ${input.number} de ${bank.name}`);
  return tx.cheque.create({
    data: {
      kind: "PROPIO",
      format: input.format,
      status: "EMITIDO",
      bank: bank.bankName ?? bank.name,
      number: input.number,
      issuerName: "Coverline Uniformes",
      amount: D(input.amount),
      issueDate: input.issueDate,
      paymentDate: input.paymentDate,
      cashRegisterId: bank.id,
      paymentOrderId: input.paymentOrderId,
      deliveredTo: input.deliveredTo,
      createdById: userId,
    },
  });
}

async function lockCheque(tx: Tx, chequeId: string) {
  await tx.$queryRaw`SELECT id FROM cheques WHERE id = ${chequeId} FOR UPDATE`;
  const cheque = await tx.cheque.findUnique({
    where: { id: chequeId },
    include: { paymentOrder: { select: { id: true, number: true, supplierId: true, workshopId: true } } },
  });
  if (!cheque) throw new ChequeError("Cheque inexistente");
  return cheque;
}

export async function endorseCheque(tx: Tx, chequeId: string, paymentOrderId: string, deliveredTo: string) {
  const cheque = await lockCheque(tx, chequeId);
  if (cheque.kind !== "TERCERO") throw new ChequeError("Solo se endosan cheques de terceros");
  assertTransition(cheque.kind, cheque.status, "ENDOSADO");
  await tx.cheque.update({ where: { id: cheque.id }, data: { status: "ENDOSADO", paymentOrderId, deliveredTo } });
  return cheque;
}

/** Reabre la deuda del cliente que entregó el cheque (rechazo o devolución). */
async function reopenClientDebt(tx: Tx, cheque: Awaited<ReturnType<typeof lockCheque>>, why: string) {
  if (!cheque.clientId) return;
  const due = new Date();
  due.setDate(due.getDate() + REOPENED_DEBT_DUE_DAYS);
  await tx.accountReceivable.create({
    data: {
      clientId: cheque.clientId,
      chequeId: cheque.id,
      description: `${chequeLabel(cheque)} ${why}`,
      dueDate: due,
      amount: cheque.amount,
      balance: cheque.amount,
    },
  });
}

/** Reabre la deuda con el proveedor/taller al que se le entregó el cheque. */
async function reopenCreditorDebt(tx: Tx, cheque: Awaited<ReturnType<typeof lockCheque>>, why: string) {
  const order = cheque.paymentOrder;
  if (!order) return;
  await tx.accountPayable.create({
    data: {
      supplierId: order.supplierId,
      workshopId: order.workshopId,
      description: `${chequeLabel(cheque)} ${why} (orden de pago #${order.number})`,
      dueDate: new Date(),
      amount: cheque.amount,
      balance: cheque.amount,
    },
  });
}

export async function applyChequeAction(tx: Tx, input: ChequeAction, userId: string) {
  const cheque = await lockCheque(tx, input.chequeId);
  const label = chequeLabel(cheque);
  const method = cheque.format === "ECHEQ" ? "ECHEQ" : "CHEQUE";

  switch (input.action) {
    case "DEPOSITAR": {
      assertTransition(cheque.kind, cheque.status, "DEPOSITADO");
      assertCollectable(cheque.paymentDate);
      const register = await lockRegister(tx, input.registerId);
      if (register.kind !== "BANCO") throw new ChequeError("Los cheques se depositan en una cuenta bancaria");
      await addMovement(tx, { register, type: "INGRESO", method, amount: new Decimal(cheque.amount.toString()), concept: `Depósito ${label}`, userId, chequeId: cheque.id });
      await tx.cheque.update({ where: { id: cheque.id }, data: { status: "DEPOSITADO", cashRegisterId: register.id, depositedAt: new Date() } });
      return `${label} depositado en ${register.name}`;
    }
    case "COBRAR": {
      assertTransition(cheque.kind, cheque.status, "COBRADO");
      assertCollectable(cheque.paymentDate);
      const register = await lockRegister(tx, input.registerId);
      await addMovement(tx, { register, type: "INGRESO", method: "EFECTIVO", amount: new Decimal(cheque.amount.toString()), concept: `Cobro por ventanilla ${label}`, userId, chequeId: cheque.id });
      await tx.cheque.update({ where: { id: cheque.id }, data: { status: "COBRADO", cashRegisterId: register.id, clearedAt: new Date() } });
      return `${label} cobrado: ${formatMoney(cheque.amount.toNumber())} ingresó a ${register.name}`;
    }
    case "DEBITAR": {
      assertTransition(cheque.kind, cheque.status, "DEBITADO");
      if (!cheque.cashRegisterId) throw new ChequeError("El cheque no tiene cuenta bancaria asociada");
      const register = await lockRegister(tx, cheque.cashRegisterId);
      await addMovement(tx, { register, type: "EGRESO", method, amount: new Decimal(cheque.amount.toString()), concept: `Débito ${label} — ${cheque.deliveredTo ?? ""}`, userId, chequeId: cheque.id });
      await tx.cheque.update({ where: { id: cheque.id }, data: { status: "DEBITADO", clearedAt: new Date() } });
      return `${label} debitado de ${register.name}`;
    }
    case "RECHAZAR":
    case "ANULAR": {
      const to = input.action === "RECHAZAR" ? "RECHAZADO" : "ANULADO";
      assertTransition(cheque.kind, cheque.status, to);
      const why = to === "RECHAZADO" ? "rechazado" : "devuelto / anulado";
      if (cheque.kind === "TERCERO") {
        // Si ya estaba depositado, se revierte el ingreso en el banco.
        if (cheque.status === "DEPOSITADO" && cheque.cashRegisterId) {
          const register = await lockRegister(tx, cheque.cashRegisterId);
          await addMovement(tx, { register, type: "EGRESO", method, amount: new Decimal(cheque.amount.toString()), concept: `Rechazo ${label}`, userId, chequeId: cheque.id });
        }
        await reopenClientDebt(tx, cheque, why);
        if (cheque.status === "ENDOSADO") await reopenCreditorDebt(tx, cheque, `${why}: el proveedor lo devuelve`);
      } else {
        await reopenCreditorDebt(tx, cheque, why);
      }
      await tx.cheque.update({ where: { id: cheque.id }, data: { status: to, rejectedAt: new Date(), rejectionReason: input.reason } });
      await tx.auditLog.create({ data: { userId, entity: "Cheque", entityId: cheque.id, action: to, reason: input.reason, data: { amount: cheque.amount.toNumber(), label } } });
      const debts = [cheque.kind === "TERCERO" && cheque.clientId ? "se reabrió la deuda del cliente" : null, cheque.paymentOrder ? "se reabrió la deuda con el proveedor" : null].filter(Boolean);
      return `${label} ${to.toLowerCase()}${debts.length ? `: ${debts.join(" y ")}` : ""}`;
    }
  }
}
