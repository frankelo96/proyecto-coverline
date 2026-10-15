"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CostingError } from "@/lib/costing/escandallo";
import { formatMoney } from "@/lib/format";
import { PurchasingError } from "@/lib/purchasing/math";
import { TreasuryError } from "@/lib/treasury/cash";
import { ChequeError } from "@/lib/treasury/cheques";
import {
  annulPurchaseSchema,
  creditNoteSchema,
  merchandisePurchaseSchema,
  paymentOrderSchema,
  purchaseOrderSchema,
  workshopInvoiceSchema,
} from "@/lib/validations/purchasing";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { CostingServiceError } from "@/server/services/costing.service";
import { cancelPurchaseOrder, createPurchaseOrder, createSupplierCreditNote } from "@/server/services/purchase-orders.service";
import {
  annulPurchase,
  createMerchandisePurchase,
  createPaymentOrder,
  createWorkshopInvoice,
  type MerchandiseResult,
} from "@/server/services/purchasing.service";

function toError(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Datos inválidos" };
  if (
    error instanceof PurchasingError ||
    error instanceof AuthorizationError ||
    error instanceof CostingServiceError ||
    error instanceof CostingError ||
    error instanceof TreasuryError ||
    error instanceof ChequeError
  ) {
    return { ok: false, error: error.message };
  }
  console.error("[purchasing.actions]", error);
  return { ok: false, error: "No se pudo completar la operación. Intentá nuevamente." };
}

function revalidateAll() {
  revalidatePath("/compras", "layout");
  revalidatePath("/produccion", "layout");
}

export async function createMerchandisePurchaseAction(raw: unknown): Promise<ActionResult<MerchandiseResult>> {
  try {
    const user = await requireActionUser(PERMISSIONS.purchasesWrite);
    const input = merchandisePurchaseSchema.parse(raw);
    const result = await db.$transaction((tx) => createMerchandisePurchase(tx, input, user.id), { timeout: 30_000 });
    revalidateAll();
    const order = result.order ? ` · orden de compra #${result.order.number} ${result.order.complete ? "recibida completa" : "recibida en parte"}` : "";
    return { ok: true, data: result, message: `Compra #${result.number} registrada: stock actualizado${order}` };
  } catch (e) {
    return toError(e);
  }
}

export async function createWorkshopInvoiceAction(raw: unknown): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.purchasesWrite);
    const input = workshopInvoiceSchema.parse(raw);
    const result = await db.$transaction((tx) => createWorkshopInvoice(tx, input, user.id));
    revalidateAll();
    const replaced = result.replacedProvisional > 0 ? ` Reemplaza la deuda provisoria de ${result.replacedProvisional} recepciones.` : "";
    return {
      ok: true,
      data: { id: result.id, number: result.number },
      message: `Factura de taller registrada (compra #${result.number}) por ${formatMoney(result.total)}.${replaced}`,
    };
  } catch (e) {
    return toError(e);
  }
}

export async function annulPurchaseAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.purchasesWrite);
    const input = annulPurchaseSchema.parse(raw);
    const r = await db.$transaction((tx) => annulPurchase(tx, input, user.id));
    revalidateAll();
    const note =
      r.kind === "MERCADERIA"
        ? " Se descontó el stock ingresado. Los costos de reposición no se revierten: corregilos desde la ficha si hace falta."
        : " Las recepciones vuelven a quedar pendientes de facturar.";
    return { ok: true, data: undefined, message: `Compra #${r.number} anulada.${note}` };
  } catch (e) {
    return toError(e);
  }
}

export async function createPaymentOrderAction(raw: unknown): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.payablesPay);
    const input = paymentOrderSchema.parse(raw);
    const r = await db.$transaction((tx) => createPaymentOrder(tx, input, user.id));
    revalidateAll();
    return { ok: true, data: { id: r.id, number: r.number }, message: r.message };
  } catch (e) {
    return toError(e);
  }
}

export async function createPurchaseOrderAction(raw: unknown): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.purchasesWrite);
    const input = purchaseOrderSchema.parse(raw);
    const r = await db.$transaction((tx) => createPurchaseOrder(tx, input, user.id), { timeout: 30_000 });
    revalidateAll();
    return { ok: true, data: { id: r.id, number: r.number }, message: `Orden de compra #${r.number} por ${formatMoney(r.total.toNumber())} registrada` };
  } catch (e) {
    return toError(e);
  }
}

export async function cancelPurchaseOrderAction(raw: unknown): Promise<ActionResult> {
  try {
    const user = await requireActionUser(PERMISSIONS.purchasesWrite);
    const input = z.object({ orderId: z.string().min(1), reason: z.string().trim().min(5, "Indicá el motivo (mínimo 5 caracteres)").max(300) }).parse(raw);
    const n = await db.$transaction((tx) => cancelPurchaseOrder(tx, input, user.id));
    revalidateAll();
    return { ok: true, data: undefined, message: `Orden de compra #${n} cerrada` };
  } catch (e) {
    return toError(e);
  }
}

export async function createCreditNoteAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.purchasesWrite);
    const input = creditNoteSchema.parse(raw);
    const r = await db.$transaction((tx) => createSupplierCreditNote(tx, input, user.id), { timeout: 30_000 });
    revalidateAll();
    revalidatePath("/maestros", "layout");
    return { ok: true, data: { id: r.id }, message: r.message };
  } catch (e) {
    return toError(e);
  }
}
