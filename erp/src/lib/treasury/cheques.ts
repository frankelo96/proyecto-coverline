/**
 * Ciclo de vida de cheques y eCheqs — puro.
 *
 *  Terceros (recibidos de clientes):
 *    EN_CARTERA → DEPOSITADO (en una cuenta) | COBRADO (por ventanilla, a una caja)
 *               | ENDOSADO (entregado a un proveedor/taller) | RECHAZADO | ANULADO
 *    DEPOSITADO / ENDOSADO → RECHAZADO (vuelve como deuda del cliente)
 *  Propios (emitidos por Coverline):
 *    EMITIDO → DEBITADO (sale del banco) | RECHAZADO | ANULADO
 */
import type { ChequeFormat, ChequeKind, ChequeStatus } from "@/generated/prisma/enums";

export class ChequeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChequeError";
  }
}

export const CHEQUE_STATUS_LABELS: Record<ChequeStatus, string> = {
  EN_CARTERA: "En cartera",
  DEPOSITADO: "Depositado",
  COBRADO: "Cobrado",
  ENDOSADO: "Endosado",
  EMITIDO: "Emitido",
  DEBITADO: "Debitado",
  RECHAZADO: "Rechazado",
  ANULADO: "Anulado",
};

export const CHEQUE_FORMAT_LABELS: Record<ChequeFormat, string> = { FISICO: "Cheque", ECHEQ: "eCheq" };

const TRANSITIONS: Record<ChequeKind, Partial<Record<ChequeStatus, ChequeStatus[]>>> = {
  TERCERO: {
    EN_CARTERA: ["DEPOSITADO", "COBRADO", "ENDOSADO", "RECHAZADO", "ANULADO"],
    DEPOSITADO: ["RECHAZADO"],
    ENDOSADO: ["RECHAZADO"],
  },
  PROPIO: {
    EMITIDO: ["DEBITADO", "RECHAZADO", "ANULADO"],
  },
};

export function canTransition(kind: ChequeKind, from: ChequeStatus, to: ChequeStatus) {
  return TRANSITIONS[kind][from]?.includes(to) ?? false;
}

export function assertTransition(kind: ChequeKind, from: ChequeStatus, to: ChequeStatus) {
  if (!canTransition(kind, from, to)) {
    throw new ChequeError(`Un cheque ${kind === "TERCERO" ? "de terceros" : "propio"} ${CHEQUE_STATUS_LABELS[from].toLowerCase()} no puede pasar a ${CHEQUE_STATUS_LABELS[to].toLowerCase()}`);
  }
}

/** Plazo máximo legal de un cheque de pago diferido. */
export const MAX_DEFERRED_DAYS = 360;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function validateChequeDates(issueDate: Date, paymentDate: Date) {
  if (Number.isNaN(issueDate.getTime()) || Number.isNaN(paymentDate.getTime())) throw new ChequeError("Fechas del cheque inválidas");
  const days = (dayStart(paymentDate) - dayStart(issueDate)) / 86_400_000;
  if (days < 0) throw new ChequeError("La fecha de cobro no puede ser anterior a la de emisión");
  if (days > MAX_DEFERRED_DAYS) throw new ChequeError(`El pago diferido no puede superar ${MAX_DEFERRED_DAYS} días`);
}

/** Un cheque no se puede depositar ni cobrar antes de su fecha de pago. */
export function assertCollectable(paymentDate: Date, today = new Date()) {
  if (dayStart(paymentDate) > dayStart(today)) {
    throw new ChequeError(`El cheque recién se puede cobrar desde el ${paymentDate.toLocaleDateString("es-AR")}`);
  }
}

export function daysUntil(paymentDate: Date, today = new Date()) {
  return Math.round((dayStart(paymentDate) - dayStart(today)) / 86_400_000);
}

export function chequeLabel(c: { format: ChequeFormat; bank: string; number: string }) {
  return `${CHEQUE_FORMAT_LABELS[c.format]} ${c.bank} N° ${c.number}`;
}
