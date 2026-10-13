import { describe, expect, it } from "vitest";

import {
  assertCanCancel,
  assertCanCloseCut,
  assertCanCloseQuality,
  assertCanReceive,
  assertCanSend,
  assertCanSkipPersonalization,
  isStageComplete,
  nextStage,
  stageBalance,
  WorkflowError,
  type OrderLike,
  type RemitLike,
} from "./workflow";

const order = (over: Partial<OrderLike> = {}): OrderLike => ({
  status: "EN_PROCESO",
  currentStage: "EN_TALLER_CONFECCION",
  quantityInProcess: 100,
  requiresPersonalization: false,
  remits: [],
  ...over,
});

const envio = (workshopId: string, pieces: number): RemitLike => ({
  type: "ENVIO",
  stage: "EN_TALLER_CONFECCION",
  workshopId,
  pieces,
  wasteQty: 0,
});
const recepcion = (workshopId: string, pieces: number, wasteQty = 0): RemitLike => ({
  type: "RECEPCION",
  stage: "EN_TALLER_CONFECCION",
  workshopId,
  pieces,
  wasteQty,
});

describe("stageBalance", () => {
  it("calcula piezas en talleres y sin enviar con merma", () => {
    // 100 cortadas; 60 a A, 40 a B; A devuelve 55 + 5 merma (en proceso baja a 95)
    const o = order({ quantityInProcess: 95, remits: [envio("A", 60), envio("B", 40), recepcion("A", 55, 5)] });
    const b = stageBalance(o, "EN_TALLER_CONFECCION");
    expect(b).toMatchObject({ sent: 100, received: 55, waste: 5, atWorkshops: 40, unsent: 0 });
    expect([...b.byWorkshop]).toEqual([["B", 40]]);
  });

  it("ignora remitos de otras etapas", () => {
    const o = order({ remits: [{ ...envio("A", 30), stage: "EN_PERSONALIZACION" }] });
    expect(stageBalance(o, "EN_TALLER_CONFECCION").unsent).toBe(100);
  });
});

describe("transiciones", () => {
  it("decide si pasa por personalización", () => {
    expect(nextStage("EN_TALLER_CONFECCION", true)).toBe("EN_PERSONALIZACION");
    expect(nextStage("EN_TALLER_CONFECCION", false)).toBe("CONTROL_CALIDAD_PLANCHADO");
    expect(nextStage("CONTROL_CALIDAD_PLANCHADO", true)).toBe("LISTO_ENTREGA");
  });

  it("cierra la etapa solo cuando volvió todo", () => {
    const partial = order({ remits: [envio("A", 100), recepcion("A", 70)] });
    expect(isStageComplete(partial)).toBe(false);
    const done = order({ quantityInProcess: 98, remits: [envio("A", 100), recepcion("A", 98, 2)] });
    expect(isStageComplete(done)).toBe(true);
  });
});

describe("validaciones", () => {
  it("no permite enviar más de lo disponible ni a un taller de otro rubro", () => {
    const o = order({ remits: [envio("A", 80)] });
    expect(() => assertCanSend(o, 30, ["CONFECCION"])).toThrow(/20 piezas/);
    expect(() => assertCanSend(o, 10, ["BORDADO"])).toThrow(WorkflowError);
    expect(() => assertCanSend(o, 20, ["CONFECCION"])).not.toThrow();
  });

  it("no permite recibir más de lo que tiene el taller", () => {
    const o = order({ remits: [envio("A", 50)] });
    expect(() => assertCanReceive(o, "A", 48, 3)).toThrow(/50 piezas/);
    expect(() => assertCanReceive(o, "B", 1, 0)).toThrow(WorkflowError);
    expect(() => assertCanReceive(o, "A", 48, 2)).not.toThrow();
  });

  it("corte: no más que lo planificado", () => {
    const o = order({ currentStage: "CORTE_INTERNO" });
    expect(() => assertCanCloseCut(o, 101)).toThrow(WorkflowError);
    expect(() => assertCanCloseCut(o, 97)).not.toThrow();
  });

  it("personalización: solo se omite si no se envió nada", () => {
    const o = order({ currentStage: "EN_PERSONALIZACION" });
    expect(() => assertCanSkipPersonalization(o)).not.toThrow();
    const sent = order({ currentStage: "EN_PERSONALIZACION", remits: [{ ...envio("X", 5), stage: "EN_PERSONALIZACION" }] });
    expect(() => assertCanSkipPersonalization(sent)).toThrow(WorkflowError);
  });

  it("calidad: aprobadas ≤ en proceso", () => {
    const o = order({ currentStage: "CONTROL_CALIDAD_PLANCHADO", quantityInProcess: 10 });
    const planned = new Map([["S", 5], ["M", 5]]);
    expect(() => assertCanCloseQuality(o, [{ variantId: "S", quantity: 6 }, { variantId: "M", quantity: 5 }], planned)).toThrow(/10 en proceso/);
    expect(() => assertCanCloseQuality(o, [{ variantId: "S", quantity: 5 }, { variantId: "M", quantity: 4 }], planned)).not.toThrow();
  });

  it("no cancela con piezas en talleres", () => {
    expect(() => assertCanCancel(order({ remits: [envio("A", 10)] }))).toThrow(/talleres/);
    expect(() => assertCanCancel(order())).not.toThrow();
  });
});
