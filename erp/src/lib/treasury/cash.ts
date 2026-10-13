/**
 * Reglas de cajas y tesorería — puras.
 */
import Decimal from "decimal.js";

import type { CashMovementType, CashRegisterKind, PaymentMethod } from "@/generated/prisma/enums";

export class TreasuryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TreasuryError";
  }
}

export const REGISTER_KIND_LABELS: Record<CashRegisterKind, string> = {
  CAJA_DIARIA: "Caja diaria",
  CAJA_ADMINISTRATIVA: "Caja administrativa",
  CAJA_RESGUARDO: "Caja negra (resguardo)",
  BILLETERA_VIRTUAL: "Billetera virtual",
  BANCO: "Banco",
};

export const MOVEMENT_LABELS: Record<CashMovementType, string> = {
  APERTURA: "Apertura",
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
  AJUSTE: "Ajuste",
  AJUSTE_SOBRANTE: "Sobrante de caja",
  AJUSTE_FALTANTE: "Faltante de caja",
  TRANSFERENCIA_ENTRADA: "Transferencia recibida",
  TRANSFERENCIA_SALIDA: "Transferencia enviada",
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Tarjeta de débito",
  TARJETA_CREDITO: "Tarjeta de crédito",
  MERCADO_PAGO: "Mercado Pago",
  MODO: "MODO",
  TRANSFERENCIA: "Transferencia",
  CUENTA_CORRIENTE: "Cuenta corriente",
  CHEQUE: "Cheque",
  ECHEQ: "eCheq",
  MIXTO: "Varios medios",
};

/** Signo de cada tipo de movimiento sobre el saldo de la caja. APERTURA y AJUSTE (histórico) no mueven saldo. */
export const MOVEMENT_SIGN: Record<CashMovementType, -1 | 0 | 1> = {
  APERTURA: 0,
  AJUSTE: 0,
  INGRESO: 1,
  AJUSTE_SOBRANTE: 1,
  TRANSFERENCIA_ENTRADA: 1,
  EGRESO: -1,
  AJUSTE_FALTANTE: -1,
  TRANSFERENCIA_SALIDA: -1,
};

export function balanceOf(movements: { type: CashMovementType; amount: number | string }[]): number {
  return movements
    .reduce((acc, m) => acc.plus(new Decimal(m.amount.toString()).mul(MOVEMENT_SIGN[m.type])), new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber();
}

/**
 * Diferencia entre lo contado y lo esperado. >0 sobrante, <0 faltante. Se
 * registra como movimiento de ajuste para que el saldo del sistema quede igual
 * a lo que hay físicamente en la caja.
 */
export function countAdjustment(expected: number, counted: number): { difference: number; type: CashMovementType | null; amount: number } {
  if (!(counted >= 0)) throw new TreasuryError("El efectivo contado no puede ser negativo");
  const diff = new Decimal(counted).minus(expected).toDecimalPlaces(2);
  if (diff.isZero()) return { difference: 0, type: null, amount: 0 };
  return { difference: diff.toNumber(), type: diff.gt(0) ? "AJUSTE_SOBRANTE" : "AJUSTE_FALTANTE", amount: diff.abs().toNumber() };
}

/** Medios de cobro que van al cajón de la caja diaria del turno. El resto se acredita en su cuenta. */
export const DRAWER_METHODS: PaymentMethod[] = ["EFECTIVO"];

/** Medios que no mueven caja: generan deuda (cuenta corriente) o un cheque en cartera. */
export const NON_REGISTER_METHODS: PaymentMethod[] = ["CUENTA_CORRIENTE", "CHEQUE", "ECHEQ"];

/** Resuelve en qué caja/cuenta se acredita un medio de cobro. */
export function destinationRegister<R extends { id: string; kind: CashRegisterKind; defaultForMethods: PaymentMethod[]; active: boolean }>(
  method: PaymentMethod,
  drawer: R,
  registers: R[],
): R | null {
  if (NON_REGISTER_METHODS.includes(method)) return null;
  if (DRAWER_METHODS.includes(method)) return drawer;
  const found = registers.find((r) => r.active && r.defaultForMethods.includes(method));
  if (!found) throw new TreasuryError(`No hay una cuenta configurada para cobrar con ${METHOD_LABELS[method]}`);
  return found;
}
