/**
 * Cobranzas de cuenta corriente de clientes (recibos).
 */
import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import { allocatePayment, PurchasingError } from "@/lib/purchasing/math";
import { SaleError } from "@/lib/pos/sale-math";
import type { ReceiptInput } from "@/lib/validations/treasury";
import { registerCollections } from "@/server/services/collection.service";
import { lockRegister, openSessionOf } from "@/server/services/treasury.service";

type Tx = Prisma.TransactionClient;
const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());

export async function createReceipt(tx: Tx, input: ReceiptInput, userId: string) {
  const client = await tx.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new SaleError("Cliente inexistente");
  const register = await lockRegister(tx, input.registerId);
  const session = register.requiresSession ? await openSessionOf(tx, register.id) : null;

  await tx.$queryRaw`SELECT id FROM accounts_receivable WHERE id IN (${Prisma.join(input.receivableIds)}) FOR UPDATE`;
  const debts = await tx.accountReceivable.findMany({ where: { id: { in: input.receivableIds } } });
  if (debts.length !== new Set(input.receivableIds).size) throw new SaleError("Alguna deuda no existe");
  for (const d of debts) {
    if (d.clientId !== client.id) throw new SaleError("Hay deudas de otro cliente");
    if (d.status !== "PENDIENTE" && d.status !== "PARCIAL") throw new SaleError(`"${d.description}" no tiene saldo pendiente`);
  }

  const total = input.payments.reduce((a, p) => a.plus(p.amount), new Decimal(0));
  let allocations: { payableId: string; amount: number }[];
  try {
    allocations = allocatePayment(total.toNumber(), debts.map((d) => ({ id: d.id, balance: d.balance.toNumber(), dueDate: d.dueDate })));
  } catch (e) {
    if (e instanceof PurchasingError) throw new SaleError(e.message.replace("comprobantes", "deudas"));
    throw e;
  }

  const receipt = await tx.receipt.create({
    data: { clientId: client.id, amount: D(total), sessionId: session?.id ?? null, notes: input.notes, createdById: userId },
    select: { id: true, number: true },
  });

  await registerCollections(tx, input.payments, {
    drawerId: register.id,
    clientId: client.id,
    userId,
    concept: `Recibo #${receipt.number} — ${client.businessName}`,
    link: { receiptId: receipt.id },
  });

  for (const a of allocations) {
    const d = debts.find((x) => x.id === a.payableId)!;
    const balance = new Decimal(d.balance.toString()).minus(a.amount);
    await tx.receiptAllocation.create({ data: { receiptId: receipt.id, accountReceivableId: d.id, amount: D(a.amount) } });
    await tx.accountReceivable.update({ where: { id: d.id }, data: { balance: D(balance), status: balance.lte(0) ? "CANCELADO" : "PARCIAL" } });
  }
  return { ...receipt, total: total.toNumber() };
}
