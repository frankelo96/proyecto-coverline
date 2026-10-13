import { describe, expect, it } from "vitest";

import { balanceOf, countAdjustment, destinationRegister, TreasuryError } from "../treasury/cash";
import { assertCollectable, assertTransition, ChequeError, validateChequeDates } from "../treasury/cheques";
import { computeSaleTotals, finalUnitPrice, planPayments, SaleError } from "./sale-math";
import { renderTicketText, type TicketData } from "./ticket";

describe("finalUnitPrice", () => {
  it("aplica IVA y ajuste de talle", () => {
    expect(finalUnitPrice(24000, 21)).toBe(29040);
    expect(finalUnitPrice(24000, 21, 10)).toBe(31944);
  });
});

describe("computeSaleTotals", () => {
  it("desglosa neto e IVA con descuentos de línea y general", () => {
    const t = computeSaleTotals(
      [
        { quantity: 2, unitPrice: 29040, discountPct: 0, vatRate: 21 },
        { quantity: 1, unitPrice: 12100, discountPct: 10, vatRate: 21 },
      ],
      5,
    );
    // (58080 + 10890) × 0.95 = 65521.50
    expect(t.total).toBe(65521.5);
    expect(t.gross).toBe(70180);
    expect(t.discountTotal).toBe(4658.5);
    expect(t.subtotal + t.taxTotal).toBeCloseTo(t.total, 2);
    expect(t.vat21).toBe(t.taxTotal);
  });

  it("admite cantidades fraccionadas", () => {
    expect(computeSaleTotals([{ quantity: 1.5, unitPrice: 9000, discountPct: 0, vatRate: 21 }]).total).toBe(13500);
  });

  it("rechaza venta vacía", () => {
    expect(() => computeSaleTotals([])).toThrow(SaleError);
  });
});

describe("planPayments", () => {
  it("calcula vuelto solo con efectivo", () => {
    expect(planPayments(65521.5, [{ method: "EFECTIVO", amount: 70000 }])).toEqual({ paid: 70000, change: 4478.5, cashKept: 65521.5, onAccount: 0 });
  });

  it("combina medios y cuenta corriente", () => {
    const p = planPayments(100000, [
      { method: "TARJETA_DEBITO", amount: 40000 },
      { method: "CUENTA_CORRIENTE", amount: 30000 },
      { method: "EFECTIVO", amount: 35000 },
    ]);
    expect(p).toEqual({ paid: 105000, change: 5000, cashKept: 30000, onAccount: 30000 });
  });

  it("no permite que tarjeta o cheque generen vuelto ni pagar de menos", () => {
    expect(() => planPayments(1000, [{ method: "CHEQUE", amount: 1500 }])).toThrow(/superan/);
    expect(() => planPayments(1000, [{ method: "EFECTIVO", amount: 500 }])).toThrow(/Faltan/);
  });
});

describe("caja", () => {
  it("calcula saldo con signos por tipo", () => {
    expect(
      balanceOf([
        { type: "INGRESO", amount: 5000000 },
        { type: "TRANSFERENCIA_SALIDA", amount: 4900000 },
        { type: "AJUSTE_FALTANTE", amount: 500 },
        { type: "APERTURA", amount: 100000 },
      ]),
    ).toBe(99500);
  });

  it("arqueo: sobrante y faltante", () => {
    expect(countAdjustment(100000, 100500)).toEqual({ difference: 500, type: "AJUSTE_SOBRANTE", amount: 500 });
    expect(countAdjustment(100000, 99000)).toEqual({ difference: -1000, type: "AJUSTE_FALTANTE", amount: 1000 });
    expect(countAdjustment(100000, 100000).type).toBeNull();
  });

  it("destino del cobro: efectivo al cajón, transferencias al banco, cheques a cartera", () => {
    const drawer = { id: "rm", kind: "CAJA_DIARIA" as const, defaultForMethods: [], active: true };
    const bank = { id: "bco", kind: "BANCO" as const, defaultForMethods: ["TRANSFERENCIA" as const], active: true };
    expect(destinationRegister("EFECTIVO", drawer, [drawer, bank])?.id).toBe("rm");
    expect(destinationRegister("TRANSFERENCIA", drawer, [drawer, bank])?.id).toBe("bco");
    expect(destinationRegister("CHEQUE", drawer, [drawer, bank])).toBeNull();
    expect(() => destinationRegister("MODO", drawer, [drawer, bank])).toThrow(TreasuryError);
  });
});

describe("cheques", () => {
  it("respeta el ciclo de vida", () => {
    expect(() => assertTransition("TERCERO", "EN_CARTERA", "ENDOSADO")).not.toThrow();
    expect(() => assertTransition("TERCERO", "ENDOSADO", "DEPOSITADO")).toThrow(ChequeError);
    expect(() => assertTransition("PROPIO", "EMITIDO", "DEBITADO")).not.toThrow();
    expect(() => assertTransition("PROPIO", "DEBITADO", "ANULADO")).toThrow(ChequeError);
  });

  it("valida fechas y cobro anticipado", () => {
    expect(() => validateChequeDates(new Date("2026-10-01"), new Date("2027-12-01"))).toThrow(/360/);
    expect(() => validateChequeDates(new Date("2026-10-10"), new Date("2026-10-01"))).toThrow(ChequeError);
    expect(() => assertCollectable(new Date("2026-11-01"), new Date("2026-10-13"))).toThrow(/desde/);
    expect(() => assertCollectable(new Date("2026-10-13"), new Date("2026-10-13T18:00:00"))).not.toThrow();
  });
});

describe("ticket térmico", () => {
  const data: TicketData = {
    businessName: "Coverline Uniformes",
    branchName: "Local Recta Martinolli",
    branchAddress: null,
    voucherLabel: "Ticket",
    number: 42,
    date: new Date("2026-10-13T15:30:00"),
    cashier: "Ana",
    clientName: null,
    items: [{ description: "Chomba piqué bordada T.M", quantity: 2, unitPrice: 29040, discountPct: 0, total: 58080 }],
    discountTotal: 0,
    showVat: false,
    subtotal: 48000,
    taxTotal: 10080,
    total: 58080,
    payments: [{ label: "Efectivo", amount: 60000 }],
    change: 1920,
    footer: "Gracias por su compra",
  };
  it("respeta el ancho de columnas y quita acentos", () => {
    for (const w of [58, 80] as const) {
      const lines = renderTicketText(data, w).split("\n");
      expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(w === 58 ? 32 : 48);
    }
    const text = renderTicketText(data, 80);
    expect(text).toContain("Chomba pique bordada");
    expect(text).toMatch(/TOTAL \$ +58\.080,00/);
    expect(text).toMatch(/Su vuelto +1\.920,00/);
  });
});
