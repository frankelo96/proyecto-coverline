/**
 * Reglas del flujo de producción — puras, sin I/O.
 *
 * Etapas: CORTE_INTERNO → EN_TALLER_CONFECCION → [EN_PERSONALIZACION] →
 *         CONTROL_CALIDAD_PLANCHADO → LISTO_ENTREGA
 *
 * En las etapas externas (confección y personalización) las piezas salen y
 * vuelven con remitos. Para la etapa actual S:
 *   enviadas(S)  = Σ remitos ENVIO
 *   recibidas(S) = Σ remitos RECEPCION (piezas buenas)
 *   merma(S)     = Σ merma declarada en RECEPCION
 *   en talleres  = enviadas − recibidas − merma
 *   sin enviar   = en proceso − enviadas + merma
 * La etapa se cierra sola cuando no quedan piezas sin enviar ni en talleres.
 */
import type {
  ProductionOrderStatus,
  ProductionStage,
  WorkshopRemitType,
  WorkshopType,
} from "@/generated/prisma/enums";

export const STAGE_ORDER: ProductionStage[] = [
  "CORTE_INTERNO",
  "EN_TALLER_CONFECCION",
  "EN_PERSONALIZACION",
  "CONTROL_CALIDAD_PLANCHADO",
  "LISTO_ENTREGA",
];

export const STAGE_LABELS: Record<ProductionStage, string> = {
  CORTE_INTERNO: "Corte interno",
  EN_TALLER_CONFECCION: "Taller de confección",
  EN_PERSONALIZACION: "Personalización",
  CONTROL_CALIDAD_PLANCHADO: "Calidad y planchado",
  LISTO_ENTREGA: "Listo / stock",
};

export const STATUS_LABELS: Record<ProductionOrderStatus, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};

/** Tipos de taller que pueden recibir piezas en cada etapa externa. */
export const STAGE_WORKSHOP_TYPES: Partial<Record<ProductionStage, WorkshopType[]>> = {
  EN_TALLER_CONFECCION: ["CONFECCION"],
  EN_PERSONALIZACION: ["BORDADO", "ESTAMPADO", "SUBLIMACION"],
};

export const isExternalStage = (stage: ProductionStage) => stage in STAGE_WORKSHOP_TYPES;

export interface RemitLike {
  type: WorkshopRemitType;
  stage: ProductionStage;
  workshopId: string;
  pieces: number;
  wasteQty: number;
}

export interface OrderLike {
  status: ProductionOrderStatus;
  currentStage: ProductionStage;
  quantityInProcess: number;
  requiresPersonalization: boolean;
  remits: RemitLike[];
}

export interface StageBalance {
  sent: number;
  received: number;
  waste: number;
  atWorkshops: number;
  unsent: number;
  /** Piezas en poder de cada taller (solo > 0). */
  byWorkshop: Map<string, number>;
}

export function stageBalance(order: Pick<OrderLike, "quantityInProcess" | "remits">, stage: ProductionStage): StageBalance {
  let sent = 0;
  let received = 0;
  let waste = 0;
  const byWorkshop = new Map<string, number>();
  for (const r of order.remits) {
    if (r.stage !== stage) continue;
    const delta = r.type === "ENVIO" ? r.pieces : -(r.pieces + r.wasteQty);
    if (r.type === "ENVIO") sent += r.pieces;
    else {
      received += r.pieces;
      waste += r.wasteQty;
    }
    byWorkshop.set(r.workshopId, (byWorkshop.get(r.workshopId) ?? 0) + delta);
  }
  for (const [id, qty] of byWorkshop) if (qty <= 0) byWorkshop.delete(id);
  return {
    sent,
    received,
    waste,
    atWorkshops: sent - received - waste,
    unsent: order.quantityInProcess - sent + waste,
    byWorkshop,
  };
}

/** Siguiente etapa al completar la actual. */
export function nextStage(stage: ProductionStage, requiresPersonalization: boolean): ProductionStage {
  switch (stage) {
    case "CORTE_INTERNO":
      return "EN_TALLER_CONFECCION";
    case "EN_TALLER_CONFECCION":
      return requiresPersonalization ? "EN_PERSONALIZACION" : "CONTROL_CALIDAD_PLANCHADO";
    case "EN_PERSONALIZACION":
      return "CONTROL_CALIDAD_PLANCHADO";
    case "CONTROL_CALIDAD_PLANCHADO":
    case "LISTO_ENTREGA":
      return "LISTO_ENTREGA";
  }
}

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

const positiveInt = (n: number, label: string) => {
  if (!Number.isInteger(n) || n < 0) throw new WorkflowError(`${label} debe ser un entero mayor o igual a 0`);
};

function assertInProcess(order: OrderLike) {
  if (order.status !== "EN_PROCESO") throw new WorkflowError("La orden no está en proceso");
}

export function assertCanStart(order: Pick<OrderLike, "status">) {
  if (order.status !== "BORRADOR") throw new WorkflowError("Solo se pueden iniciar órdenes en borrador");
}

/** Cierre del corte: piezas cortadas efectivas (≤ planificadas). */
export function assertCanCloseCut(order: OrderLike, cutPieces: number) {
  assertInProcess(order);
  if (order.currentStage !== "CORTE_INTERNO") throw new WorkflowError("La orden no está en corte");
  positiveInt(cutPieces, "Las piezas cortadas");
  if (cutPieces === 0) throw new WorkflowError("Tiene que haber al menos una pieza cortada");
  if (cutPieces > order.quantityInProcess) throw new WorkflowError("No se pueden cortar más piezas que las planificadas");
}

export function assertCanSend(order: OrderLike, pieces: number, workshopTypes: WorkshopType[]) {
  assertInProcess(order);
  const allowed = STAGE_WORKSHOP_TYPES[order.currentStage];
  if (!allowed) throw new WorkflowError("En esta etapa no se envían piezas a talleres");
  if (!workshopTypes.some((t) => allowed.includes(t))) {
    throw new WorkflowError("El taller elegido no realiza el proceso de esta etapa");
  }
  positiveInt(pieces, "Las piezas");
  if (pieces === 0) throw new WorkflowError("Indicá cuántas piezas se envían");
  const { unsent } = stageBalance(order, order.currentStage);
  if (pieces > unsent) throw new WorkflowError(`Solo quedan ${unsent} piezas sin enviar`);
}

export function assertCanReceive(order: OrderLike, workshopId: string, pieces: number, waste: number) {
  assertInProcess(order);
  if (!isExternalStage(order.currentStage)) throw new WorkflowError("En esta etapa no se reciben piezas de talleres");
  positiveInt(pieces, "Las piezas recibidas");
  positiveInt(waste, "La merma");
  if (pieces + waste === 0) throw new WorkflowError("Indicá piezas recibidas o merma");
  const held = stageBalance(order, order.currentStage).byWorkshop.get(workshopId) ?? 0;
  if (pieces + waste > held) throw new WorkflowError(`El taller tiene ${held} piezas de esta orden`);
}

/** ¿La etapa externa actual quedó cerrada (nada sin enviar ni en talleres)? */
export function isStageComplete(order: OrderLike): boolean {
  if (!isExternalStage(order.currentStage)) return false;
  const b = stageBalance(order, order.currentStage);
  return b.unsent === 0 && b.atWorkshops === 0;
}

export function assertCanSkipPersonalization(order: OrderLike) {
  assertInProcess(order);
  if (order.currentStage !== "EN_PERSONALIZACION") throw new WorkflowError("La orden no está en personalización");
  if (stageBalance(order, "EN_PERSONALIZACION").sent > 0) {
    throw new WorkflowError("Ya se enviaron piezas a personalizar; registrá la recepción");
  }
}

/** Cierre de calidad: piezas aprobadas por variante. El resto es merma. */
export function assertCanCloseQuality(
  order: OrderLike,
  approved: { variantId: string; quantity: number }[],
  plannedByVariant: Map<string, number>,
) {
  assertInProcess(order);
  if (order.currentStage !== "CONTROL_CALIDAD_PLANCHADO") throw new WorkflowError("La orden no está en control de calidad");
  let total = 0;
  for (const a of approved) {
    positiveInt(a.quantity, "Las piezas aprobadas");
    if (!plannedByVariant.has(a.variantId)) throw new WorkflowError("Talle inexistente en la orden");
    total += a.quantity;
  }
  if (total > order.quantityInProcess) {
    throw new WorkflowError(`Se aprobaron ${total} piezas pero hay ${order.quantityInProcess} en proceso`);
  }
}

export function assertCanCancel(order: OrderLike) {
  if (order.status === "COMPLETADA" || order.status === "CANCELADA") throw new WorkflowError("La orden ya está cerrada");
  if (isExternalStage(order.currentStage) && stageBalance(order, order.currentStage).atWorkshops > 0) {
    throw new WorkflowError("Hay piezas en talleres: registrá su recepción antes de cancelar");
  }
}
