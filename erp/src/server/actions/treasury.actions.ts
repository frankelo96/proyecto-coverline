"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { SaleError } from "@/lib/pos/sale-math";
import { PurchasingError } from "@/lib/purchasing/math";
import { TreasuryError } from "@/lib/treasury/cash";
import { ChequeError } from "@/lib/treasury/cheques";
import {
  chequeActionSchema,
  closeSessionSchema,
  manualMovementSchema,
  openSessionSchema,
  receiptSchema,
  saleSchema,
  transferSchema,
} from "@/lib/validations/treasury";
import { authorizeSale, type AuthorizeResult } from "@/server/arca/authorize";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { applyChequeAction } from "@/server/services/cheque.service";
import { createSale } from "@/server/services/pos.service";
import { createReceipt } from "@/server/services/receivables.service";
import { createReturn } from "@/server/services/returns.service";
import { returnSchema } from "@/lib/validations/returns";
import { closeSession, manualMovement, openSession, transferBetween } from "@/server/services/treasury.service";

const TX = { timeout: 20_000 };

function toError(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Datos inválidos" };
  if (
    error instanceof TreasuryError ||
    error instanceof SaleError ||
    error instanceof ChequeError ||
    error instanceof PurchasingError ||
    error instanceof AuthorizationError
  ) {
    return { ok: false, error: error.message };
  }
  console.error("[treasury.actions]", error);
  return { ok: false, error: "No se pudo completar la operación. Intentá nuevamente." };
}

function revalidateTreasury() {
  revalidatePath("/pos", "layout");
  revalidatePath("/tesoreria", "layout");
  revalidatePath("/compras/cuentas", "layout");
}

/** Las cajas diarias se operan con permiso de turno; la caja negra y los bancos, con permiso de tesorería. */
async function requireForRegister(registerId: string, permissions: string[]) {
  const register = await db.cashRegister.findUnique({ where: { id: registerId }, select: { kind: true } });
  const needed = register?.kind === "CAJA_DIARIA" ? PERMISSIONS.cashSession : PERMISSIONS.cashManage;
  if (!hasPermission(permissions, needed)) throw new AuthorizationError();
}

export async function openSessionAction(raw: unknown): Promise<ActionResult<{ difference: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.cashSession);
    const input = openSessionSchema.parse(raw);
    const r = await db.$transaction((tx) => openSession(tx, input, user.id), TX);
    revalidateTreasury();
    const diff = r.difference === 0 ? "" : ` Diferencia con el cierre anterior: ${r.difference > 0 ? "sobran" : "faltan"} ${formatMoney(Math.abs(r.difference))}.`;
    return { ok: true, data: { difference: r.difference }, message: `Turno abierto con ${formatMoney(input.countedAmount)}.${diff}` };
  } catch (e) {
    return toError(e);
  }
}

export async function closeSessionAction(raw: unknown): Promise<ActionResult<{ sessionId: string; difference: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.cashSession);
    const input = closeSessionSchema.parse(raw);
    const r = await db.$transaction((tx) => closeSession(tx, input, user.id), TX);
    revalidateTreasury();
    const diff = r.difference === 0 ? "Sin diferencias." : `${r.difference > 0 ? "Sobrante" : "Faltante"} de ${formatMoney(Math.abs(r.difference))}.`;
    return { ok: true, data: { sessionId: r.session.id, difference: r.difference }, message: `Turno cerrado. ${diff} Queda de fondo ${formatMoney(r.leftAsFund)}.` };
  } catch (e) {
    return toError(e);
  }
}

export async function transferAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const input = transferSchema.parse(raw);
    await requireForRegister(input.fromId, user.permissions);
    const r = await db.$transaction((tx) => transferBetween(tx, input, user.id), TX);
    revalidateTreasury();
    return { ok: true, data: undefined, message: `${formatMoney(input.amount)} de ${r.from} a ${r.to}` };
  } catch (e) {
    return toError(e);
  }
}

export async function manualMovementAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser();
    const input = manualMovementSchema.parse(raw);
    await requireForRegister(input.registerId, user.permissions);
    const reg = await db.$transaction((tx) => manualMovement(tx, input, user.id), TX);
    revalidateTreasury();
    return { ok: true, data: undefined, message: `${input.direction === "IN" ? "Ingreso" : "Egreso"} de ${formatMoney(input.amount)} en ${reg.name}` };
  } catch (e) {
    return toError(e);
  }
}

export async function chequeAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.chequesManage);
    const input = chequeActionSchema.parse(raw);
    const message = await db.$transaction((tx) => applyChequeAction(tx, input, user.id), TX);
    revalidateTreasury();
    revalidatePath("/tesoreria/cobranzas", "layout");
    return { ok: true, data: undefined, message };
  } catch (e) {
    return toError(e);
  }
}

export async function createSaleAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; number: number; change: number; warnings: string[]; arca: AuthorizeResult | null }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.posSell);
    const input = saleSchema.parse(raw);
    const r = await db.$transaction(
      (tx) => createSale(tx, input, { id: user.id, name: user.name, canDiscount: hasPermission(user.permissions, PERMISSIONS.posDiscount) }),
      TX,
    );
    // El CAE se pide después de confirmar la venta: si ARCA no responde, la venta queda registrada y pendiente.
    const arca = r.fiscal ? await authorizeSale(r.id) : null;
    revalidateTreasury();
    revalidatePath("/ventas", "layout");
    return {
      ok: true,
      data: { id: r.id, number: r.number, change: r.change, warnings: r.warnings, arca },
      message: `Venta #${r.number} por ${formatMoney(r.total)}${r.change > 0 ? ` · vuelto ${formatMoney(r.change)}` : ""}${arca ? ` · ${arca.message}` : ""}`,
    };
  } catch (e) {
    return toError(e);
  }
}

export async function createReceiptAction(raw: unknown): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.receivablesCollect);
    const input = receiptSchema.parse(raw);
    await requireForRegister(input.registerId, user.permissions);
    const r = await db.$transaction((tx) => createReceipt(tx, input, user.id), TX);
    revalidateTreasury();
    revalidatePath("/tesoreria/cobranzas", "layout");
    return { ok: true, data: { id: r.id, number: r.number }, message: `Recibo #${r.number} por ${formatMoney(r.total)} registrado` };
  } catch (e) {
    return toError(e);
  }
}

export async function authorizeSaleAction(raw: unknown): Promise<ActionResult<AuthorizeResult>> {
  try {
    await requireActionUser(PERMISSIONS.posSell);
    const { saleId } = z.object({ saleId: z.string().min(1) }).parse(raw);
    const r = await authorizeSale(saleId);
    revalidatePath("/ventas", "layout");
    return r.ok ? { ok: true, data: r, message: r.message } : { ok: false, error: r.message };
  } catch (e) {
    return toError(e);
  }
}

export async function createReturnAction(raw: unknown): Promise<ActionResult<{ id: string; number: number; arca: AuthorizeResult | null }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.posReturn);
    const input = returnSchema.parse(raw);
    const r = await db.$transaction((tx) => createReturn(tx, input, { id: user.id }), TX);
    const arca = r.fiscal ? await authorizeSale(r.id) : null;
    revalidateTreasury();
    revalidatePath("/ventas", "layout");
    return {
      ok: true,
      data: { id: r.id, number: r.number, arca },
      message: `Devolución #${r.number} por ${formatMoney(r.total)} registrada${arca ? ` · ${arca.message}` : ""}`,
    };
  } catch (e) {
    return toError(e);
  }
}
