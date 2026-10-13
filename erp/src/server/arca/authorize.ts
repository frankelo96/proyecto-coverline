import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { CBTE_TIPO, parseArcaDate, voucherNumber } from "@/lib/arca/codes";
import { ArcaError, buildFecaeRequest, receiverFor } from "@/lib/arca/invoice";
import { db } from "@/server/db";

import { consultVoucher, lastAuthorized, requestCae } from "./client";
import { arcaConfig, arcaEnabled } from "./config";

/** Un intento colgado (proceso caído) se puede retomar pasado este tiempo. */
const LOCK_MS = 2 * 60_000;
/** ARCA admite fechar comprobantes de productos hasta 5 días antes; se usa margen (mismo criterio en el QR). */
const MAX_BACKDATE_DAYS = 4;

export interface AuthorizeResult {
  ok: boolean;
  status: "AUTORIZADO" | "RECHAZADO" | "PENDIENTE";
  message: string;
}

/**
 * Pide el CAE de una factura o nota de crédito.
 *  1. Toma un bloqueo optimista (evita dos pedidos simultáneos del mismo comprobante).
 *  2. Si un intento anterior pidió un número y ARCA ya lo autorizó (respuesta perdida), lo recupera.
 *  3. Si no, pide último autorizado + 1 y guarda el número antes de enviarlo.
 */
export async function authorizeSale(saleId: string): Promise<AuthorizeResult> {
  if (!arcaEnabled()) return { ok: false, status: "PENDIENTE", message: "Facturación electrónica no configurada: el comprobante queda pendiente de CAE" };

  const claimed = await db.sale.updateMany({
    where: { id: saleId, arcaStatus: { in: ["PENDIENTE", "RECHAZADO"] }, OR: [{ arcaLockedAt: null }, { arcaLockedAt: { lt: new Date(Date.now() - LOCK_MS) } }] },
    data: { arcaLockedAt: new Date(), arcaAttempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    const s = await db.sale.findUnique({ where: { id: saleId }, select: { arcaStatus: true } });
    if (s?.arcaStatus === "AUTORIZADO") return { ok: true, status: "AUTORIZADO", message: "El comprobante ya estaba autorizado" };
    return { ok: false, status: "PENDIENTE", message: "El comprobante se está autorizando en otra operación; reintentá en un momento" };
  }

  const sale = await db.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { items: true, client: true, originalSale: { select: { invoiceType: true, pointOfSale: true, invoiceNumber: true, createdAt: true, arcaStatus: true } } },
  });
  const release = (data: Prisma.SaleUpdateInput) => db.sale.update({ where: { id: sale.id }, data: { ...data, arcaLockedAt: null } });

  try {
    const cfg = arcaConfig();
    const cbteTipo = CBTE_TIPO[sale.invoiceType];
    if (!cbteTipo || !sale.pointOfSale) throw new ArcaError("El comprobante no es electrónico");
    if (sale.kind === "DEVOLUCION" && sale.originalSale?.arcaStatus !== "AUTORIZADO") throw new ArcaError("La factura original todavía no tiene CAE");

    const total = sale.total.toNumber();
    const receiver = receiverFor(sale.invoiceType, sale.client);
    const backdated = Date.now() - sale.createdAt.getTime() > MAX_BACKDATE_DAYS * 86_400_000;
    const date = backdated ? new Date() : sale.createdAt;

    // Recuperación: el intento anterior pudo haber sido autorizado sin que llegara la respuesta.
    if (sale.arcaRequestedNumber) {
      const last = await lastAuthorized(sale.pointOfSale, cbteTipo);
      if (last >= sale.arcaRequestedNumber) {
        const prev = await consultVoucher(sale.pointOfSale, cbteTipo, sale.arcaRequestedNumber);
        if (prev.found && prev.cae && Math.abs(prev.total - total) < 0.01 && prev.docNro === receiver.docNro) {
          await release({
            invoiceNumber: sale.arcaRequestedNumber,
            cae: prev.cae,
            caeDueDate: prev.caeDueDate ? parseArcaDate(prev.caeDueDate) : null,
            arcaStatus: "AUTORIZADO",
            arcaError: null,
            arcaAuthorizedAt: new Date(),
          });
          return { ok: true, status: "AUTORIZADO", message: `CAE ${prev.cae} recuperado para ${voucherNumber(sale.pointOfSale, sale.arcaRequestedNumber)}` };
        }
      }
    }

    const number = (await lastAuthorized(sale.pointOfSale, cbteTipo)) + 1;
    await db.sale.update({ where: { id: sale.id }, data: { arcaRequestedNumber: number } });
    const req = buildFecaeRequest({
      invoiceType: sale.invoiceType,
      pointOfSale: sale.pointOfSale,
      number,
      date,
      receiver,
      lines: sale.items.map((i) => ({ total: i.subtotal.toNumber(), vatRate: i.vatRate.toNumber() })),
      expectedTotal: total,
      issuerCuit: cfg.cuit,
      associated:
        sale.kind === "DEVOLUCION" && sale.originalSale?.invoiceNumber && sale.originalSale.pointOfSale
          ? { invoiceType: sale.originalSale.invoiceType, pointOfSale: sale.originalSale.pointOfSale, number: sale.originalSale.invoiceNumber, date: sale.originalSale.createdAt }
          : null,
    });
    const res = await requestCae(req);
    const notes = [...res.errors, ...res.observations];

    if (res.approved && res.cae) {
      await release({
        invoiceNumber: number,
        cae: res.cae,
        caeDueDate: res.caeDueDate ? parseArcaDate(res.caeDueDate) : null,
        arcaStatus: "AUTORIZADO",
        arcaError: null,
        arcaObservations: notes.length ? (notes as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        arcaAuthorizedAt: new Date(),
      });
      return { ok: true, status: "AUTORIZADO", message: `CAE ${res.cae} · ${voucherNumber(sale.pointOfSale, number)}` };
    }
    const reason = notes.map((n) => `${n.code}: ${n.message}`).join(" · ") || "ARCA rechazó el comprobante";
    await release({ arcaStatus: "RECHAZADO", arcaError: reason, arcaRequestedNumber: null, arcaObservations: notes as unknown as Prisma.InputJsonValue });
    return { ok: false, status: "RECHAZADO", message: `ARCA rechazó el comprobante: ${reason}` };
  } catch (e) {
    // Errores de validación local: el comprobante queda rechazado hasta corregir los datos.
    if (e instanceof ArcaError) {
      await release({ arcaStatus: "RECHAZADO", arcaError: e.message, arcaRequestedNumber: null });
      return { ok: false, status: "RECHAZADO", message: e.message };
    }
    // Errores de red o del servicio: queda pendiente y conserva el número pedido para recuperar.
    const message = e instanceof Error ? e.message : "Error desconocido";
    console.error("[arca.authorize]", sale.id, message);
    await release({ arcaError: message });
    return { ok: false, status: "PENDIENTE", message: `No se pudo autorizar (queda pendiente de CAE): ${message}` };
  }
}
