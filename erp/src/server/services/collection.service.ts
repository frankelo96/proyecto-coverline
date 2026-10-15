/**
 * Registro de cobros (venta POS y cobranza de cuenta corriente): decide a qué
 * caja/cuenta va cada medio, crea los cheques en cartera y deja el Payment.
 */
import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import type { CashRegisterKind, PaymentMethod } from "@/generated/prisma/enums";
import { destinationRegister, METHOD_LABELS } from "@/lib/treasury/cash";
import type { CollectionPayment } from "@/lib/validations/treasury";
import { receiveThirdPartyCheque } from "@/server/services/cheque.service";
import { redeemStoreCredit } from "@/server/services/store-credit.service";
import { addMovement, lockRegister } from "@/server/services/treasury.service";

type Tx = Prisma.TransactionClient;
const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());

export interface CollectionContext {
  drawerId: string;
  clientId: string | null;
  userId: string;
  concept: string;
  link: { saleId?: string; receiptId?: string };
  /** Efectivo que queda en caja (recibido − vuelto). Por defecto, la suma de pagos en efectivo. */
  cashKept?: number;
}

export async function registerCollections(tx: Tx, payments: CollectionPayment[], ctx: CollectionContext) {
  const registers = await tx.cashRegister.findMany({ where: { active: true } });
  const drawer = registers.find((r) => r.id === ctx.drawerId);
  if (!drawer) throw new Error("Caja inexistente");
  const asDest = (r: (typeof registers)[number]) => ({ id: r.id, kind: r.kind as CashRegisterKind, defaultForMethods: r.defaultForMethods as PaymentMethod[], active: r.active });

  const cashTotal = payments.filter((p) => p.method === "EFECTIVO").reduce((a, p) => a.plus(p.amount), new Decimal(0));
  const cashKept = new Decimal(ctx.cashKept ?? cashTotal.toNumber());
  let cashMovementId: string | null = null;
  if (cashKept.gt(0)) {
    const register = await lockRegister(tx, drawer.id);
    const mov = await addMovement(tx, { register, type: "INGRESO", method: "EFECTIVO", amount: cashKept, concept: ctx.concept, userId: ctx.userId, ...ctx.link });
    cashMovementId = mov.id;
  }

  const created = [];
  for (const p of payments) {
    let chequeId: string | null = null;
    let registerId: string | null = null;
    let movementId: string | null = null;
    let storeCreditId: string | null = null;
    let reference = p.reference;
    if (p.method === "EFECTIVO") {
      registerId = drawer.id;
      movementId = cashMovementId;
      cashMovementId = null; // el movimiento único de efectivo queda ligado al primer pago en efectivo
    } else if (p.method === "CHEQUE" || p.method === "ECHEQ") {
      const cheque = await receiveThirdPartyCheque(tx, { ...p.cheque!, format: p.method === "ECHEQ" ? "ECHEQ" : p.cheque!.format }, p.amount, ctx.clientId, ctx.userId);
      chequeId = cheque.id;
    } else if (p.method === "VALE") {
      const credit = await redeemStoreCredit(tx, p.reference ?? "", p.amount);
      storeCreditId = credit.id;
      reference = credit.code;
    } else if (p.method !== "CUENTA_CORRIENTE") {
      const dest = destinationRegister(p.method, asDest(drawer), registers.map(asDest))!;
      const register = await lockRegister(tx, dest.id);
      const ref = p.reference ? ` (${p.reference})` : "";
      const mov = await addMovement(tx, { register, type: "INGRESO", method: p.method, amount: p.amount, concept: `${ctx.concept} — ${METHOD_LABELS[p.method]}${ref}`, userId: ctx.userId, ...ctx.link });
      registerId = register.id;
      movementId = mov.id;
    }
    created.push(
      await tx.payment.create({
        data: {
          method: p.method,
          amount: D(p.amount),
          reference,
          cardBrand: p.cardBrand,
          installments: p.installments,
          saleId: ctx.link.saleId ?? null,
          receiptId: ctx.link.receiptId ?? null,
          chequeId,
          cashRegisterId: registerId,
          cashMovementId: movementId,
          storeCreditId,
          createdById: ctx.userId,
        },
      }),
    );
  }
  return created;
}
