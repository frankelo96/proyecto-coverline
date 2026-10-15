/**
 * Vales de cambio / saldo a favor. Se emiten en una devolución (en lugar de
 * devolver el dinero) y se usan como medio de pago en el POS, total o parcialmente.
 */
import { randomInt } from "node:crypto";

import Decimal from "decimal.js";

import { Prisma } from "@/generated/prisma/client";
import { formatMoney } from "@/lib/format";
import { SaleError } from "@/lib/pos/sale-math";

type Tx = Prisma.TransactionClient;
const D = (v: Decimal.Value) => new Prisma.Decimal(v.toString());

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Código de 8 caracteres sin letras que se confunden (0/O, 1/I), en dos grupos: "7K3M-9QX2". */
export function newStoreCreditCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Normaliza lo que tipea el vendedor: mayúsculas, sin espacios, con guion en el medio. */
export function normalizeStoreCreditCode(raw: string) {
  const s = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

export async function issueStoreCredit(tx: Tx, data: { amount: number; clientId: string | null; originSaleId: string | null; userId: string; notes?: string | null }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newStoreCreditCode();
    const exists = await tx.storeCredit.findUnique({ where: { code }, select: { id: true } });
    if (exists) continue;
    return tx.storeCredit.create({
      data: {
        code,
        clientId: data.clientId,
        originSaleId: data.originSaleId,
        amount: D(data.amount),
        balance: D(data.amount),
        notes: data.notes ?? null,
        createdById: data.userId,
      },
    });
  }
  throw new SaleError("No se pudo generar el código del vale, probá de nuevo");
}

/** Vale vigente por código, bloqueado para que dos cajas no lo usen a la vez. */
export async function lockStoreCredit(tx: Tx, rawCode: string) {
  const code = normalizeStoreCreditCode(rawCode);
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM store_credits WHERE code = ${code} FOR UPDATE`;
  if (rows.length === 0) throw new SaleError(`No existe el vale ${code}`);
  return tx.storeCredit.findUniqueOrThrow({ where: { id: rows[0].id } });
}

/** Descuenta un importe del vale (pago en el POS o cobranza). */
export async function redeemStoreCredit(tx: Tx, rawCode: string, amount: number) {
  const credit = await lockStoreCredit(tx, rawCode);
  if (credit.status !== "ACTIVO") throw new SaleError(`El vale ${credit.code} está ${credit.status === "USADO" ? "usado" : "anulado"}`);
  if (credit.expiresAt && credit.expiresAt < new Date()) throw new SaleError(`El vale ${credit.code} está vencido`);
  const balance = new Decimal(credit.balance.toString());
  if (balance.lt(amount - 0.005)) throw new SaleError(`El vale ${credit.code} tiene ${formatMoney(balance.toNumber())} disponibles`);
  const left = Decimal.max(balance.minus(amount), 0);
  await tx.storeCredit.update({ where: { id: credit.id }, data: { balance: D(left), status: left.lte(0) ? "USADO" : "ACTIVO" } });
  return credit;
}

/** Devuelve saldo al vale (al anular la venta en que se usó). */
export async function restoreStoreCredit(tx: Tx, creditId: string, amount: number) {
  await tx.$queryRaw`SELECT id FROM store_credits WHERE id = ${creditId} FOR UPDATE`;
  const credit = await tx.storeCredit.findUniqueOrThrow({ where: { id: creditId } });
  const balance = Decimal.min(new Decimal(credit.balance.toString()).plus(amount), new Decimal(credit.amount.toString()));
  await tx.storeCredit.update({ where: { id: credit.id }, data: { balance: D(balance), status: credit.status === "ANULADO" ? "ANULADO" : "ACTIVO" } });
}
