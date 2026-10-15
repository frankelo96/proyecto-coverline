"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { SaleError } from "@/lib/pos/sale-math";
import { TreasuryError } from "@/lib/treasury/cash";
import { ChequeError } from "@/lib/treasury/cheques";
import { cancelOrderSchema, createOrderSchema, deliverSchema, depositSchema } from "@/lib/validations/orders";
import { WorkflowError } from "@/lib/production/workflow";
import { authorizeSale } from "@/server/arca/authorize";
import { requireForRegister } from "@/server/auth/registers";
import { AuthorizationError, type CurrentUser, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { addOrderDeposit, cancelCustomerOrder, createCustomerOrder, createOrderProduction, deliverCustomerOrder, setOrderStatus } from "@/server/services/orders.service";
import { scheduleWebStockPush } from "@/server/woo/sync";

const TX = { timeout: 30_000 };

function toError(e: unknown): ActionResult<never> {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
  if (e instanceof SaleError || e instanceof TreasuryError || e instanceof ChequeError || e instanceof WorkflowError || e instanceof AuthorizationError) {
    return { ok: false, error: e.message };
  }
  console.error("[orders.actions]", e);
  return { ok: false, error: "No se pudo completar la operación. Intentá nuevamente." };
}

function revalidate(orderId?: string) {
  revalidatePath("/ventas", "layout");
  revalidatePath("/pos", "layout");
  revalidatePath("/tesoreria", "layout");
  if (orderId) revalidatePath(`/ventas/pedidos/${orderId}`);
}

/** Quien tiene un local asignado toma y entrega pedidos de su local. */
function requireBranch(user: CurrentUser, branchId: string) {
  if (user.branchId && user.branchId !== branchId) throw new AuthorizationError("Solo podés operar pedidos de tu local");
}

export async function createOrderAction(raw: unknown): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.posSell);
    const input = createOrderSchema.parse(raw);
    requireBranch(user, input.branchId);
    if (input.deposit) await requireForRegister(input.deposit.registerId, user);
    const r = await db.$transaction((tx) => createCustomerOrder(tx, input, { id: user.id, canDiscount: hasPermission(user.permissions, PERMISSIONS.posDiscount) }), TX);
    revalidate();
    return { ok: true, data: { id: r.id, number: r.number }, message: `Pedido #${r.number} por ${formatMoney(r.total)} registrado${r.deposit > 0 ? ` con seña de ${formatMoney(r.deposit)}` : ""}` };
  } catch (e) {
    return toError(e);
  }
}

export async function addDepositAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.posSell);
    const input = depositSchema.parse(raw);
    await requireForRegister(input.registerId, user);
    const r = await db.$transaction((tx) => addOrderDeposit(tx, input, { id: user.id }), TX);
    revalidate(input.orderId);
    return { ok: true, data: undefined, message: `Seña de ${formatMoney(r.amount)} cobrada. Saldo del pedido #${r.number}: ${formatMoney(r.balance)}` };
  } catch (e) {
    return toError(e);
  }
}

export async function startOrderProductionAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.productionWrite);
    const input = z.object({ orderId: z.string().min(1), requiresPersonalization: z.boolean() }).parse(raw);
    const ops = await db.$transaction((tx) => createOrderProduction(tx, input.orderId, { requiresPersonalization: input.requiresPersonalization }, user.id), TX);
    revalidate(input.orderId);
    revalidatePath("/produccion", "layout");
    return { ok: true, data: undefined, message: `Órdenes de producción creadas: ${ops.map((n) => `OP #${n}`).join(", ")}. Quedan en borrador para lanzarlas en Producción.` };
  } catch (e) {
    return toError(e);
  }
}

export async function setOrderStatusAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.posSell);
    const input = z.object({ orderId: z.string().min(1), status: z.enum(["ABIERTO", "EN_PRODUCCION", "LISTO"]) }).parse(raw);
    await db.$transaction((tx) => setOrderStatus(tx, input.orderId, input.status, user.id), TX);
    revalidate(input.orderId);
    return { ok: true, data: undefined, message: input.status === "LISTO" ? "Pedido marcado como listo para entregar" : "Estado actualizado" };
  } catch (e) {
    return toError(e);
  }
}

export async function deliverOrderAction(raw: unknown): Promise<ActionResult<{ saleId: string }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.posSell);
    const input = deliverSchema.parse(raw);
    await requireForRegister(input.registerId, user);
    const r = await db.$transaction((tx) => deliverCustomerOrder(tx, input, { id: user.id }), TX);
    const arca = r.fiscal ? await authorizeSale(r.id) : null;
    scheduleWebStockPush(r.variantIds);
    revalidate(input.orderId);
    revalidatePath("/maestros", "layout");
    const parts = [
      `Pedido entregado: venta #${r.number} por ${formatMoney(r.total)}`,
      r.deposited > 0 ? `seña aplicada ${formatMoney(r.deposited)}` : null,
      r.change > 0 ? `vuelto ${formatMoney(r.change)}` : null,
      arca?.message ?? null,
      r.warnings.length ? `Atención: ${r.warnings.join("; ")}` : null,
    ].filter(Boolean);
    return { ok: true, data: { saleId: r.id }, message: parts.join(" · ") };
  } catch (e) {
    return toError(e);
  }
}

export async function cancelOrderAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.posReturn);
    const input = cancelOrderSchema.parse(raw);
    if (input.refund === "EFECTIVO" && input.registerId) await requireForRegister(input.registerId, user);
    if ((input.refund === "TRANSFERENCIA" || input.refund === "MERCADO_PAGO") && !hasPermission(user.permissions, PERMISSIONS.cashManage) && !hasPermission(user.permissions, PERMISSIONS.posVoid)) {
      throw new AuthorizationError("Devolver la seña por banco o Mercado Pago lo hace administración");
    }
    const r = await db.$transaction((tx) => cancelCustomerOrder(tx, input, { id: user.id }), TX);
    revalidate(input.orderId);
    return {
      ok: true,
      data: undefined,
      message: `Pedido #${r.number} cancelado: ${r.result}${r.openOps ? `. Tiene ${r.openOps} orden(es) de producción abiertas: cancelalas en Producción o dejalas para stock` : ""}`,
    };
  } catch (e) {
    return toError(e);
  }
}
