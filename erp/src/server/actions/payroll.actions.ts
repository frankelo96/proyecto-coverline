"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PurchasingError } from "@/lib/purchasing/math";
import { TreasuryError } from "@/lib/treasury/cash";
import { ChequeError } from "@/lib/treasury/cheques";
import { salaryPaymentSchema } from "@/lib/validations/payroll";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { createSalaryPayment } from "@/server/services/purchasing.service";

function toError(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Datos inválidos" };
  if (error instanceof PurchasingError || error instanceof AuthorizationError || error instanceof TreasuryError || error instanceof ChequeError) {
    return { ok: false, error: error.message };
  }
  console.error("[payroll.actions]", error);
  return { ok: false, error: "No se pudo completar la operación. Intentá nuevamente." };
}

/** Registra un pago de sueldo, adelanto, aguinaldo, etc.: sale de la caja o cuenta elegida. */
export async function createSalaryPaymentAction(raw: unknown): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const user = await requireActionUser(PERMISSIONS.payrollWrite);
    const input = salaryPaymentSchema.parse(raw);
    const r = await db.$transaction((tx) => createSalaryPayment(tx, input, user.id));
    revalidatePath("/personal", "layout");
    revalidatePath("/tesoreria", "layout");
    return { ok: true, data: { id: r.id, number: r.number }, message: r.message };
  } catch (e) {
    return toError(e);
  }
}
