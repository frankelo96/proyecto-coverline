import "server-only";

import { renderTicketText, type TicketWidth } from "@/lib/pos/ticket";
import { METHOD_LABELS } from "@/lib/treasury/cash";
import { getSaleForTicket } from "@/server/queries/treasury.queries";

export const parseWidth = (v: string | null | undefined): TicketWidth => (v === "58" ? 58 : 80);

export async function buildTicketText(saleId: string, width: TicketWidth) {
  const s = await getSaleForTicket(saleId);
  if (!s) return null;
  const voucher = s.invoiceType === "TICKET_INTERNO" ? "Ticket no fiscal" : `${s.voucherLabel} ${String(s.pointOfSale ?? 0).padStart(5, "0")}`;
  const text = renderTicketText(
    {
      businessName: "Coverline Uniformes",
      branchName: s.branchName,
      branchAddress: s.branchAddress,
      voucherLabel: voucher,
      number: s.voucherNumber,
      date: s.date,
      cashier: s.cashier,
      clientName: s.clientName,
      items: s.items,
      discountTotal: s.discountTotal,
      showVat: s.invoiceType === "FACTURA_A",
      subtotal: s.subtotal,
      taxTotal: s.taxTotal,
      total: s.total,
      payments: s.payments.map((p) => ({ label: `${METHOD_LABELS[p.method]}${p.detail ? ` ${p.detail}` : ""}`, amount: p.amount })),
      change: s.change,
      footer: s.caePending ? "Comprobante pendiente de autorizacion ARCA. Gracias por su compra." : "Gracias por su compra. Cambios dentro de los 30 dias con ticket.",
    },
    width,
  );
  return { text, number: s.number };
}
