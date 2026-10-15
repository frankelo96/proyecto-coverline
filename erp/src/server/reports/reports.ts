import "server-only";

import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { variantAttrs } from "@/lib/catalog/variants";
import { effectiveQuoteStatus } from "@/lib/crm/quote-math";
import { CATEGORY_LABELS, CLIENT_TYPE_LABELS, QUOTE_STATUS_LABELS } from "@/lib/masters/labels";
import { AGING_BUCKETS, AGING_LABELS } from "@/lib/purchasing/math";
import { ITEM_TYPE_LABELS, PURCHASE_KIND_LABELS, TAX_CONDITION_LABELS } from "@/lib/purchasing/labels";
import { METHOD_LABELS, MOVEMENT_LABELS, MOVEMENT_SIGN, REGISTER_KIND_LABELS } from "@/lib/treasury/cash";
import { CHEQUE_FORMAT_LABELS, CHEQUE_STATUS_LABELS } from "@/lib/treasury/cheques";
import { periodLabel, periodOf, SALARY_CONCEPT_LABELS } from "@/lib/validations/payroll";
import { PAYMENT_METHOD_LABELS, PURCHASE_INVOICE_LABELS } from "@/lib/validations/purchasing";
import { webQuantity } from "@/lib/woo/stock";
import { db } from "@/server/db";
import { getCreditorStatement, listCreditors } from "@/server/queries/purchasing.queries";
import { voucherLabel } from "@/server/queries/sales.queries";
import { getClientAccount, listClientBalances } from "@/server/queries/treasury.queries";
import { BRANCH_ORDER } from "@/server/services/stock.service";
import { wooConfig } from "@/server/woo/config";
import { isoLocalDate } from "@/lib/dates";

export type CellValue = string | number | Date | null;

export interface ReportColumn {
  key: string;
  label: string;
  type?: "text" | "money" | "number" | "date";
  /** Suma la columna en la fila de totales */
  total?: boolean;
}

export interface Report {
  title: string;
  filename: string;
  columns: ReportColumn[];
  rows: Record<string, CellValue>[];
}

export class ReportError extends Error {}

const parseDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : null);
const stamp = (d = new Date()) => isoLocalDate(d);

/** Rango ?desde=&hasta= (por defecto: del 1° del mes a hoy). */
function range(p: URLSearchParams) {
  const now = new Date();
  const from = parseDate(p.get("desde")) ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const to = parseDate(p.get("hasta")) ?? now;
  return { from, toEnd: new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1), label: `${stamp(from)}-a-${stamp(to)}` };
}

const agingColumns: ReportColumn[] = AGING_BUCKETS.map((b) => ({ key: b, label: AGING_LABELS[b], type: "money", total: true }));

// ─── Definiciones ─────────────────────────────────────────────────────────

interface ReportDef {
  label: string;
  description: string;
  permission: string;
  /** Parámetros que acepta (para armar el formulario de /informes) */
  params?: ("rango" | "cliente" | "acreedor" | "caja")[];
  build: (p: URLSearchParams) => Promise<Report>;
}

export const REPORTS: Record<string, ReportDef> = {
  "clientes-saldos": {
    label: "Cuentas corrientes de clientes (saldos)",
    description: "Saldo de cada cliente con antigüedad de la deuda.",
    permission: PERMISSIONS.receivablesCollect,
    async build() {
      const rows = await listClientBalances();
      const docs = new Map((await db.client.findMany({ select: { id: true, documentNumber: true } })).map((c) => [c.id, c.documentNumber]));
      return {
        title: "Saldos de clientes",
        filename: `saldos-clientes-${stamp()}`,
        columns: [
          { key: "name", label: "Cliente" },
          { key: "doc", label: "CUIT/DNI" },
          { key: "creditLimit", label: "Límite de crédito", type: "money" },
          { key: "balance", label: "Saldo", type: "money", total: true },
          { key: "overdue", label: "Vencido", type: "money", total: true },
          ...agingColumns,
        ],
        rows: rows.map((r) => ({ name: r.name, doc: docs.get(r.id) ?? null, creditLimit: r.creditLimit, balance: r.balance, overdue: r.overdue, ...r.aging })),
      };
    },
  },
  "cliente-extracto": {
    label: "Extracto de cuenta corriente de un cliente",
    description: "Facturas, notas de crédito y cobranzas con saldo acumulado.",
    permission: PERMISSIONS.receivablesCollect,
    params: ["cliente"],
    async build(p) {
      const acc = await getClientAccount(p.get("id") ?? "");
      if (!acc) throw new ReportError("Elegí un cliente");
      return {
        title: `Cuenta ${acc.client.name}`,
        filename: `cuenta-${slug(acc.client.name)}-${stamp()}`,
        columns: [
          { key: "date", label: "Fecha", type: "date" },
          { key: "description", label: "Concepto" },
          { key: "debit", label: "Debe", type: "money", total: true },
          { key: "credit", label: "Haber", type: "money", total: true },
          { key: "running", label: "Saldo", type: "money" },
        ],
        rows: acc.lines.map((l) => ({ date: new Date(l.at), description: l.description, debit: l.debit || null, credit: l.credit || null, running: l.running })),
      };
    },
  },
  "acreedores-saldos": {
    label: "Cuentas a pagar: proveedores y talleres (saldos)",
    description: "Lo que se le debe a cada proveedor y taller, con antigüedad.",
    permission: PERMISSIONS.payablesRead,
    async build() {
      const rows = await listCreditors();
      return {
        title: "Saldos a pagar",
        filename: `saldos-proveedores-talleres-${stamp()}`,
        columns: [
          { key: "type", label: "Tipo" },
          { key: "name", label: "Proveedor / taller" },
          { key: "cuit", label: "CUIT" },
          { key: "balance", label: "Saldo", type: "money", total: true },
          { key: "overdue", label: "Vencido", type: "money", total: true },
          ...agingColumns,
          { key: "nextDue", label: "Próximo vencimiento", type: "date" },
        ],
        rows: rows.map((r) => ({
          type: r.type === "proveedor" ? "Proveedor" : "Taller",
          name: r.name,
          cuit: r.cuit,
          balance: r.balance,
          overdue: r.overdue,
          ...r.aging,
          nextDue: r.nextDue ? new Date(r.nextDue) : null,
        })),
      };
    },
  },
  "acreedor-extracto": {
    label: "Extracto de un proveedor o taller",
    description: "Facturas y pagos con saldo acumulado.",
    permission: PERMISSIONS.payablesRead,
    params: ["acreedor"],
    async build(p) {
      // Acepta ?tipo=&id= o ?ref=tipo:id (selector de /informes).
      const [refTipo, refId] = (p.get("ref") ?? "").split(":");
      const tipo = (p.get("tipo") ?? refTipo) === "taller" ? "taller" : "proveedor";
      const st = await getCreditorStatement(tipo, p.get("id") ?? refId ?? "");
      if (!st) throw new ReportError("Elegí un proveedor o taller");
      return {
        title: `Cuenta ${st.name}`,
        filename: `cuenta-${slug(st.name)}-${stamp()}`,
        columns: [
          { key: "date", label: "Fecha", type: "date" },
          { key: "description", label: "Concepto" },
          { key: "debit", label: "Debe (facturas)", type: "money", total: true },
          { key: "credit", label: "Haber (pagos)", type: "money", total: true },
          { key: "running", label: "Saldo", type: "money" },
        ],
        rows: st.lines.map((l) => ({ date: new Date(l.date), description: l.description, debit: l.debit || null, credit: l.credit || null, running: l.running })),
      };
    },
  },
  cheques: {
    label: "Cheques (recibidos y propios)",
    description: "Cartera, depositados, endosados, propios emitidos y rechazados.",
    permission: PERMISSIONS.cashRead,
    async build() {
      const cheques = await db.cheque.findMany({
        orderBy: { paymentDate: "asc" },
        include: { client: { select: { businessName: true } }, cashRegister: { select: { name: true } }, paymentOrder: { select: { number: true } } },
      });
      return {
        title: "Cheques",
        filename: `cheques-${stamp()}`,
        columns: [
          { key: "kind", label: "Tipo" },
          { key: "format", label: "Formato" },
          { key: "status", label: "Estado" },
          { key: "bank", label: "Banco" },
          { key: "number", label: "Número" },
          { key: "issuer", label: "Librador" },
          { key: "client", label: "Recibido de" },
          { key: "deliveredTo", label: "Entregado a" },
          { key: "issueDate", label: "Emisión", type: "date" },
          { key: "paymentDate", label: "Fecha de cobro", type: "date" },
          { key: "amount", label: "Importe", type: "money", total: true },
        ],
        rows: cheques.map((c) => ({
          kind: c.kind === "TERCERO" ? "De terceros" : "Propio",
          format: CHEQUE_FORMAT_LABELS[c.format],
          status: CHEQUE_STATUS_LABELS[c.status],
          bank: c.bank,
          number: c.number,
          issuer: c.issuerName,
          client: c.client?.businessName ?? null,
          deliveredTo: c.deliveredTo ?? (c.paymentOrder ? `OP #${c.paymentOrder.number}` : null),
          issueDate: c.issueDate,
          paymentDate: c.paymentDate,
          amount: c.amount.toNumber(),
        })),
      };
    },
  },
  "caja-movimientos": {
    label: "Movimientos de caja o cuenta",
    description: "Ingresos, egresos y transferencias de una caja (diaria, caja negra, Banco Macro, Mercado Pago).",
    permission: PERMISSIONS.cashRead,
    params: ["caja", "rango"],
    async build(p) {
      const register = await db.cashRegister.findUnique({ where: { id: p.get("id") ?? "" } });
      if (!register) throw new ReportError("Elegí una caja o cuenta");
      const r = range(p);
      const movements = await db.cashMovement.findMany({
        where: { cashRegisterId: register.id, createdAt: { gte: r.from, lt: r.toEnd } },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { name: true } } },
      });
      return {
        title: `${register.name} (${REGISTER_KIND_LABELS[register.kind]})`,
        filename: `movimientos-${slug(register.name)}-${r.label}`,
        columns: [
          { key: "date", label: "Fecha", type: "date" },
          { key: "type", label: "Tipo" },
          { key: "method", label: "Medio" },
          { key: "concept", label: "Concepto" },
          { key: "user", label: "Usuario" },
          { key: "in", label: "Ingreso", type: "money", total: true },
          { key: "out", label: "Egreso", type: "money", total: true },
        ],
        rows: movements
          .filter((m) => MOVEMENT_SIGN[m.type] !== 0)
          .map((m) => ({
            date: m.createdAt,
            type: MOVEMENT_LABELS[m.type],
            method: METHOD_LABELS[m.method],
            concept: m.concept,
            user: m.user.name,
            in: MOVEMENT_SIGN[m.type] > 0 ? m.amount.toNumber() : null,
            out: MOVEMENT_SIGN[m.type] < 0 ? m.amount.toNumber() : null,
          })),
      };
    },
  },
  ventas: {
    label: "Ventas y devoluciones",
    description: "Comprobantes del período con cliente, neto, IVA y medios de cobro.",
    // Datos de todos los locales con CUIT de clientes: lo descarga tesorería/administración, no cada vendedor.
    permission: PERMISSIONS.cashRead,
    params: ["rango"],
    async build(p) {
      const r = range(p);
      const sales = await db.sale.findMany({
        where: { createdAt: { gte: r.from, lt: r.toEnd } },
        orderBy: { createdAt: "asc" },
        include: { client: true, branch: { select: { name: true } }, user: { select: { name: true } }, payments: { select: { method: true, amount: true } } },
      });
      return {
        title: "Ventas",
        filename: `ventas-${r.label}`,
        columns: [
          { key: "date", label: "Fecha", type: "date" },
          { key: "number", label: "N° interno", type: "number" },
          { key: "kind", label: "Tipo" },
          { key: "voucher", label: "Comprobante" },
          { key: "cae", label: "CAE" },
          { key: "branch", label: "Local" },
          { key: "user", label: "Vendedor" },
          { key: "client", label: "Cliente" },
          { key: "doc", label: "CUIT/DNI" },
          { key: "tax", label: "Condición IVA" },
          { key: "net", label: "Neto", type: "money", total: true },
          { key: "vat", label: "IVA", type: "money", total: true },
          { key: "total", label: "Total", type: "money", total: true },
          { key: "methods", label: "Medios de cobro" },
          { key: "status", label: "Estado" },
        ],
        rows: sales.map((s) => {
          // Una venta anulada figura con importe 0 (queda el registro).
          const sign = s.status === "ANULADA" ? 0 : s.kind === "DEVOLUCION" ? -1 : 1;
          return {
            date: s.createdAt,
            number: s.number,
            kind: s.kind === "DEVOLUCION" ? "Devolución" : "Venta",
            voucher: voucherLabel(s),
            cae: s.cae,
            branch: s.branch?.name ?? null,
            user: s.user.name,
            client: s.client?.businessName ?? "Consumidor final",
            doc: s.client?.documentNumber ?? null,
            tax: s.client ? TAX_CONDITION_LABELS[s.client.taxCondition] : "Consumidor final",
            net: sign * s.subtotal.toNumber(),
            vat: sign * s.taxTotal.toNumber(),
            total: sign * s.total.toNumber(),
            methods: s.payments.map((x) => `${METHOD_LABELS[x.method]} ${x.amount.toNumber().toLocaleString("es-AR")}`).join(" · "),
            status: s.status === "ANULADA" ? "Anulada" : null,
          };
        }),
      };
    },
  },
  sueldos: {
    label: "Sueldos pagados",
    description: "Pagos al personal (sueldos, adelantos, aguinaldo, extras) de los meses del período, con medio de pago.",
    permission: PERMISSIONS.payrollRead,
    params: ["rango"],
    async build(p) {
      const r = range(p);
      const from = periodOf(new Date(r.from.getTime() + 12 * 3_600_000));
      const to = periodOf(new Date(r.toEnd.getTime() - 12 * 3_600_000));
      const orders = await db.paymentOrder.findMany({
        where: { employeeId: { not: null }, salaryPeriod: { gte: from, lte: to } },
        orderBy: [{ salaryPeriod: "asc" }, { date: "asc" }],
        include: { employee: { include: { branch: { select: { name: true } } } }, items: { include: { cashRegister: { select: { name: true } } } } },
      });
      return {
        title: "Sueldos pagados",
        filename: `sueldos-${from}-a-${to}`,
        columns: [
          { key: "period", label: "Mes" },
          { key: "date", label: "Fecha de pago", type: "date" },
          { key: "number", label: "N° de pago", type: "number" },
          { key: "employee", label: "Empleado" },
          { key: "cuil", label: "CUIL" },
          { key: "position", label: "Puesto" },
          { key: "branch", label: "Local / sector" },
          { key: "concept", label: "Concepto" },
          { key: "method", label: "Medio de pago" },
          { key: "amount", label: "Importe", type: "money", total: true },
          { key: "notes", label: "Observaciones" },
        ],
        rows: orders.map((o) => ({
          period: o.salaryPeriod ? periodLabel(o.salaryPeriod) : null,
          date: o.date,
          number: o.number,
          employee: o.employee?.name ?? null,
          cuil: o.employee?.cuil ?? null,
          position: o.employee?.position ?? null,
          branch: o.employee?.branch?.name ?? null,
          concept: SALARY_CONCEPT_LABELS[o.salaryConcept ?? "SUELDO"],
          method: o.items.map((i) => `${PAYMENT_METHOD_LABELS[i.method]}${i.cashRegister ? ` (${i.cashRegister.name})` : ""}`).join(" + ") || (o.method ? PAYMENT_METHOD_LABELS[o.method] : null),
          amount: o.amount.toNumber(),
          notes: o.notes,
        })),
      };
    },
  },
  compras: {
    label: "Compras (mercadería y talleres)",
    description: "Comprobantes de compra del período con IVA y saldo pendiente.",
    permission: PERMISSIONS.purchasesRead,
    params: ["rango"],
    async build(p) {
      const r = range(p);
      const purchases = await db.purchase.findMany({
        where: { date: { gte: r.from, lt: r.toEnd } },
        orderBy: { date: "asc" },
        include: { supplier: true, workshop: true, items: { select: { itemType: true } }, payables: { select: { balance: true } } },
      });
      return {
        title: "Compras",
        filename: `compras-${r.label}`,
        columns: [
          { key: "date", label: "Fecha", type: "date" },
          { key: "number", label: "N° interno", type: "number" },
          { key: "kind", label: "Tipo" },
          { key: "items", label: "Rubros" },
          { key: "creditor", label: "Proveedor / taller" },
          { key: "cuit", label: "CUIT" },
          { key: "voucher", label: "Comprobante" },
          { key: "net", label: "Neto", type: "money", total: true },
          { key: "vat", label: "IVA", type: "money", total: true },
          { key: "total", label: "Total", type: "money", total: true },
          { key: "balance", label: "Saldo a pagar", type: "money", total: true },
          { key: "status", label: "Estado" },
        ],
        rows: purchases.map((x) => ({
          date: x.date,
          number: x.number,
          kind: PURCHASE_KIND_LABELS[x.kind],
          items: [...new Set(x.items.map((i) => ITEM_TYPE_LABELS[i.itemType]))].join(", "),
          creditor: x.supplier?.businessName ?? x.workshop?.name ?? null,
          cuit: x.supplier?.cuit ?? x.workshop?.cuit ?? null,
          voucher:
            x.invoiceType && x.invoiceNumber
              ? `${PURCHASE_INVOICE_LABELS[x.invoiceType as keyof typeof PURCHASE_INVOICE_LABELS] ?? x.invoiceType} ${String(x.pointOfSale ?? 0).padStart(5, "0")}-${x.invoiceNumber.padStart(8, "0")}`
              : (x.remitNumber ?? null),
          net: x.subtotal.toNumber(),
          vat: x.taxTotal.toNumber(),
          total: x.total.toNumber(),
          balance: x.status === "ANULADA" ? 0 : x.payables.reduce((a, b) => a + b.balance.toNumber(), 0),
          status: x.status === "ANULADA" ? "Anulada" : null,
        })),
      };
    },
  },
  presupuestos: {
    label: "Presupuestos",
    description: "Presupuestos del período con estado y total.",
    permission: PERMISSIONS.crmRead,
    params: ["rango"],
    async build(p) {
      const r = range(p);
      const quotes = await db.quote.findMany({
        where: { createdAt: { gte: r.from, lt: r.toEnd } },
        orderBy: { number: "asc" },
        include: { client: { select: { businessName: true, type: true } }, lead: { select: { name: true, company: true } }, user: { select: { name: true } } },
      });
      return {
        title: "Presupuestos",
        filename: `presupuestos-${r.label}`,
        columns: [
          { key: "number", label: "Número", type: "number" },
          { key: "date", label: "Fecha", type: "date" },
          { key: "validUntil", label: "Vence", type: "date" },
          { key: "party", label: "Cliente / oportunidad" },
          { key: "type", label: "Tipo de cliente" },
          { key: "user", label: "Vendedor" },
          { key: "status", label: "Estado" },
          { key: "net", label: "Neto", type: "money", total: true },
          { key: "total", label: "Total", type: "money", total: true },
        ],
        rows: quotes.map((q) => ({
          number: q.number,
          date: q.createdAt,
          validUntil: q.validUntil,
          party: q.client?.businessName ?? q.lead?.company ?? q.lead?.name ?? null,
          type: q.client ? CLIENT_TYPE_LABELS[q.client.type] : null,
          user: q.user.name,
          status: QUOTE_STATUS_LABELS[effectiveQuoteStatus(q.status, q.validUntil)],
          net: q.subtotal.toNumber(),
          total: q.total.toNumber(),
        })),
      };
    },
  },
  stock: {
    label: "Stock de productos y materiales",
    description: "Existencias por variante (color, tela, talle) y de telas/avíos, valorizadas a costo.",
    permission: PERMISSIONS.mastersRead,
    async build() {
      const [variants, materials, branches] = await Promise.all([
        db.productVariant.findMany({ where: { active: true }, include: { product: true, branchStocks: true }, orderBy: { sku: "asc" } }),
        db.rawMaterial.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
        db.branch.findMany({ where: { active: true }, orderBy: BRANCH_ORDER }),
      ]);
      return {
        title: "Stock",
        filename: `stock-${stamp()}`,
        columns: [
          { key: "kind", label: "Tipo" },
          { key: "category", label: "Rubro" },
          { key: "sku", label: "SKU / código" },
          { key: "name", label: "Descripción" },
          { key: "variant", label: "Color · tela" },
          { key: "size", label: "Talle" },
          { key: "unit", label: "Unidad" },
          ...branches.map((b) => ({ key: `b_${b.id}`, label: `Stock ${b.name}`, type: "number" as const, total: true })),
          { key: "stock", label: "Stock total", type: "number", total: true },
          { key: "web", label: "Stock web", type: "number", total: true },
          { key: "cost", label: "Costo unitario", type: "money" },
          { key: "value", label: "Valorizado", type: "money", total: true },
        ],
        rows: [
          ...variants.map((v) => ({
            kind: "Producto",
            category: CATEGORY_LABELS[v.product.category],
            sku: v.sku,
            name: v.product.name,
            variant: variantAttrs(v) || null,
            size: v.size,
            unit: "u",
            ...Object.fromEntries(branches.map((b) => [`b_${b.id}`, v.branchStocks.find((x) => x.branchId === b.id)?.quantity.toNumber() ?? 0])),
            stock: v.stockQty.toNumber(),
            web: webQuantity(
              v.branchStocks.filter((x) => branches.some((b) => b.id === x.branchId && b.kind === "LOCAL")).reduce((a, x) => a + x.quantity.toNumber(), 0),
              wooConfig().safetyStock,
            ),
            cost: v.product.currentCost.toNumber(),
            value: Math.round(v.stockQty.toNumber() * v.product.currentCost.toNumber() * 100) / 100,
          })),
          ...materials.map((m) => ({
            kind: "Material",
            category: m.type,
            sku: m.code,
            name: m.name,
            variant: m.color,
            size: null,
            unit: m.uom.toLowerCase(),
            stock: m.stockQty.toNumber(),
            cost: m.currentCost.toNumber(),
            value: Math.round(m.stockQty.toNumber() * m.currentCost.toNumber() * 100) / 100,
          })),
        ],
      };
    },
  },
};

export const canRunReport = (key: string, permissions: string[]) => !!REPORTS[key] && hasPermission(permissions, REPORTS[key].permission);

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
