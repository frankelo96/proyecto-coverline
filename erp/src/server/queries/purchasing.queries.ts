import "server-only";

import type {
  AccountStatus,
  CashRegisterKind,

  ProductionStage,
  ProductSourcing,
  PurchaseItemType,
  PurchaseKind,
  PurchaseStatus,
  RawMaterialType,
  TaxCondition,
  UnitOfMeasure,
} from "@/generated/prisma/enums";
import { variantLabel } from "@/lib/catalog/variants";
import { agingSummary, purchasableUoms, type AgingBucket } from "@/lib/purchasing/math";
import { db } from "@/server/db";
import { compareSizes } from "@/server/queries/production-orders.queries";
import { chequeLabel } from "@/lib/treasury/cheques";
import { periodLabel, SALARY_CONCEPT_LABELS } from "@/lib/validations/payroll";
import { PAYMENT_METHOD_LABELS } from "@/lib/validations/purchasing";
import { invoiceLabel } from "@/server/services/purchasing.service";
import { registerBalance } from "@/server/services/treasury.service";

const OPEN: AccountStatus[] = ["PENDIENTE", "PARCIAL"];

// ---------------------------------------------------------------------------
// Listado y detalle de compras
// ---------------------------------------------------------------------------

export interface PurchaseRow {
  id: string;
  number: number;
  kind: PurchaseKind;
  status: PurchaseStatus;
  date: string;
  creditorName: string;
  voucher: string;
  itemTypes: PurchaseItemType[];
  total: number;
  balance: number;
}

export async function listPurchases(kind: PurchaseKind | null): Promise<PurchaseRow[]> {
  const rows = await db.purchase.findMany({
    where: kind ? { kind } : undefined,
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: 500,
    include: {
      supplier: { select: { businessName: true } },
      workshop: { select: { name: true } },
      items: { select: { itemType: true } },
      payables: { select: { balance: true, status: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    number: p.number,
    kind: p.kind,
    status: p.status,
    date: p.date.toISOString(),
    creditorName: p.supplier?.businessName ?? p.workshop?.name ?? "—",
    voucher: invoiceLabel(p),
    itemTypes: [...new Set(p.items.map((i) => i.itemType))],
    total: p.total.toNumber(),
    balance: p.payables.filter((x) => x.status !== "ANULADO").reduce((a, x) => a + x.balance.toNumber(), 0),
  }));
}

export async function getPurchaseDetail(id: string) {
  const p = await db.purchase.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, businessName: true, cuit: true } },
      workshop: { select: { id: true, name: true, cuit: true } },
      createdBy: { select: { name: true } },
      items: {
        orderBy: { id: "asc" },
        include: { workshopRemit: { select: { productionOrderId: true } } },
      },
      payables: { include: { payments: { include: { paymentOrder: { select: { id: true, number: true } } } } } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    number: p.number,
    kind: p.kind,
    status: p.status,
    voucher: invoiceLabel(p),
    invoiceType: p.invoiceType,
    remitNumber: p.remitNumber,
    date: p.date.toISOString(),
    dueDate: p.dueDate?.toISOString() ?? null,
    creditor: p.supplier
      ? { type: "proveedor" as const, id: p.supplier.id, name: p.supplier.businessName, cuit: p.supplier.cuit }
      : { type: "taller" as const, id: p.workshop!.id, name: p.workshop!.name, cuit: p.workshop!.cuit },
    createdBy: p.createdBy?.name ?? null,
    notes: p.notes,
    totals: {
      subtotal: p.subtotal.toNumber(),
      vat21: p.vat21.toNumber(),
      vat105: p.vat105.toNumber(),
      vat27: p.vat27.toNumber(),
      perceptionIva: p.perceptionIva.toNumber(),
      perceptionIibb: p.perceptionIibb.toNumber(),
      otherTaxes: p.otherTaxes.toNumber(),
      total: p.total.toNumber(),
    },
    items: p.items.map((i) => ({
      id: i.id,
      itemType: i.itemType,
      description: i.description,
      quantity: i.quantity.toNumber(),
      uom: i.uom,
      unitCost: i.unitCost.toNumber(),
      vatRate: i.vatRate.toNumber(),
      subtotal: i.subtotal.toNumber(),
      stockQuantity: i.stockQuantity?.toNumber() ?? null,
      stockUnitCost: i.stockUnitCost?.toNumber() ?? null,
      previousUnitCost: i.previousUnitCost?.toNumber() ?? null,
      updatedCost: i.updatedCost,
      productionOrderId: i.workshopRemit?.productionOrderId ?? null,
    })),
    balance: p.payables.filter((x) => x.status !== "ANULADO").reduce((a, x) => a + x.balance.toNumber(), 0),
    payments: p.payables.flatMap((x) =>
      x.payments.map((pay) => ({
        id: pay.id,
        amount: pay.amount.toNumber(),
        date: pay.createdAt.toISOString(),
        method: pay.method,
        orderId: pay.paymentOrder?.id ?? null,
        orderNumber: pay.paymentOrder?.number ?? null,
      })),
    ),
  };
}

export type PurchaseDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseDetail>>>;

// ---------------------------------------------------------------------------
// Formularios de carga
// ---------------------------------------------------------------------------

export interface MerchandiseFormData {
  suppliers: { id: string; name: string; paymentTermDays: number; taxCondition: TaxCondition }[];
  materials: {
    id: string;
    code: string;
    name: string;
    type: RawMaterialType;
    uom: UnitOfMeasure;
    uoms: UnitOfMeasure[];
    metersPerKg: number | null;
    currentCost: number;
    stockQty: number;
    supplierId: string | null;
    usedInProducts: number;
  }[];
  variants: {
    id: string;
    label: string;
    productName: string;
    size: string;
    sourcing: ProductSourcing;
    currentCost: number;
  }[];
}

export async function getMerchandiseFormData(): Promise<MerchandiseFormData> {
  const [suppliers, materials, products] = await Promise.all([
    db.supplier.findMany({ where: { active: true }, orderBy: { businessName: "asc" } }),
    db.rawMaterial.findMany({
      where: { active: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { _count: { select: { bomLines: true } } },
    }),
    db.product.findMany({
      where: { active: true },
      orderBy: [{ sourcing: "desc" }, { name: "asc" }],
      include: { variants: { where: { active: true } } },
    }),
  ]);
  return {
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.businessName, paymentTermDays: s.paymentTermDays, taxCondition: s.taxCondition })),
    materials: materials.map((m) => {
      const mpk = m.metersPerKg?.toNumber() ?? null;
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        type: m.type,
        uom: m.uom,
        uoms: purchasableUoms(m.uom, mpk),
        metersPerKg: mpk,
        currentCost: m.currentCost.toNumber(),
        stockQty: m.stockQty.toNumber(),
        supplierId: m.supplierId,
        usedInProducts: m._count.bomLines,
      };
    }),
    variants: products.flatMap((p) =>
      [...p.variants]
        .sort((a, b) => compareSizes(a.size, b.size))
        .map((v) => ({
          id: v.id,
          label: `${v.sku} · ${variantLabel(p.name, v)}`,
          productName: p.name,
          size: v.size,
          sourcing: p.sourcing,
          currentCost: p.currentCost.toNumber(),
        })),
    ),
  };
}

export interface PendingReception {
  id: string;
  number: number;
  date: string;
  stage: ProductionStage;
  orderNumber: number;
  productName: string;
  pieces: number;
  laborUnitCost: number;
  laborTotal: number;
}

export interface WorkshopInvoiceFormData {
  workshops: { id: string; name: string; taxCondition: TaxCondition; paymentTermDays: number; pending: PendingReception[] }[];
}

export async function getWorkshopInvoiceFormData(): Promise<WorkshopInvoiceFormData> {
  const workshops = await db.workshop.findMany({
    where: { active: true, isInternal: false },
    orderBy: { name: "asc" },
    include: {
      remits: {
        where: { type: "RECEPCION", purchaseId: null, pieces: { gt: 0 } },
        orderBy: { number: "asc" },
        include: { productionOrder: { select: { number: true, product: { select: { name: true } } } } },
      },
    },
  });
  return {
    workshops: workshops.map((w) => ({
      id: w.id,
      name: w.name,
      taxCondition: w.taxCondition,
      paymentTermDays: w.paymentTermDays,
      pending: w.remits.map((r) => ({
        id: r.id,
        number: r.number,
        date: r.date.toISOString(),
        stage: r.stage,
        orderNumber: r.productionOrder.number,
        productName: r.productionOrder.product.name,
        pieces: r.pieces,
        laborUnitCost: r.laborUnitCost.toNumber(),
        laborTotal: r.laborTotal.toNumber(),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Cuentas corrientes de proveedores y talleres
// ---------------------------------------------------------------------------

export type CreditorType = "proveedor" | "taller";

export interface CreditorRow {
  type: CreditorType;
  id: string;
  name: string;
  cuit: string | null;
  balance: number;
  overdue: number;
  aging: Record<AgingBucket, number>;
  nextDue: string | null;
}

export async function listCreditors(): Promise<CreditorRow[]> {
  const [suppliers, workshops] = await Promise.all([
    db.supplier.findMany({
      where: { active: true },
      include: { payables: { where: { status: { in: OPEN } }, select: { balance: true, dueDate: true } } },
    }),
    db.workshop.findMany({
      where: { active: true, isInternal: false },
      include: { payables: { where: { status: { in: OPEN } }, select: { balance: true, dueDate: true } } },
    }),
  ]);
  const build = (type: CreditorType, id: string, name: string, cuit: string | null, payables: { balance: { toNumber(): number }; dueDate: Date }[]): CreditorRow => {
    const items = payables.map((p) => ({ balance: p.balance.toNumber(), dueDate: p.dueDate }));
    const aging = agingSummary(items);
    const next = items.filter((p) => p.dueDate >= new Date()).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
    const balance = items.reduce((a, p) => a + p.balance, 0);
    return { type, id, name, cuit, balance, overdue: balance - aging.A_VENCER, aging, nextDue: next?.dueDate.toISOString() ?? null };
  };
  return [
    ...suppliers.map((s) => build("proveedor", s.id, s.businessName, s.cuit, s.payables)),
    ...workshops.map((w) => build("taller", w.id, w.name, w.cuit, w.payables)),
  ].sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, "es"));
}

export interface StatementLine {
  key: string;
  date: string;
  kind: "DOCUMENTO" | "PAGO";
  description: string;
  debit: number;
  credit: number;
  running: number;
  href: string | null;
}

export interface CreditorStatement {
  type: CreditorType;
  id: string;
  name: string;
  cuit: string | null;
  phone: string | null;
  paymentTermDays: number;
  balance: number;
  aging: Record<AgingBucket, number>;
  open: { id: string; description: string; issueDate: string; dueDate: string; amount: number; balance: number; status: AccountStatus; provisional: boolean }[];
  lines: StatementLine[];
  registers: { id: string; name: string; kind: CashRegisterKind; requiresSession: boolean; hasOpenSession: boolean; balance: number }[];
  /** Cheques de terceros en cartera disponibles para endosar. */
  cheques: { id: string; label: string; issuerName: string; amount: number; paymentDate: string }[];
}

export async function getCreditorStatement(type: CreditorType, id: string): Promise<CreditorStatement | null> {
  const isSupplier = type === "proveedor";
  const creditor = isSupplier
    ? await db.supplier.findUnique({ where: { id } })
    : await db.workshop.findUnique({ where: { id } });
  if (!creditor) return null;

  const whereOwner = isSupplier ? { supplierId: id } : { workshopId: id };
  const [payables, orders, sources] = await Promise.all([
    db.accountPayable.findMany({ where: { ...whereOwner, status: { not: "ANULADO" } }, orderBy: { issueDate: "asc" } }),
    db.paymentOrder.findMany({
      where: whereOwner,
      orderBy: { date: "asc" },
      include: { cashRegister: { select: { name: true } }, items: { include: { cashRegister: { select: { name: true } } } } },
    }),
    getPaymentSources(),
  ]);

  // Extracto: documentos (debe) y órdenes de pago (haber) con saldo corrido.
  const events = [
    ...payables.map((p) => ({
      key: `d-${p.id}`,
      at: p.issueDate,
      kind: "DOCUMENTO" as const,
      description: p.description,
      debit: p.amount.toNumber(),
      credit: 0,
      href: p.purchaseId ? `/compras/${p.purchaseId}` : null,
    })),
    ...orders.map((o) => ({
      key: `p-${o.id}`,
      at: o.date,
      kind: "PAGO" as const,
      description: `Orden de pago #${o.number} — ${
        o.items.length
          ? o.items.map((i) => (i.chequeId ? (i.reference ?? "Cheque") : `${PAYMENT_METHOD_LABELS[i.method]} ${i.cashRegister?.name ?? ""}`.trim())).join(" + ")
          : (o.cashRegister?.name ?? "")
      }${o.reference ? ` (${o.reference})` : ""}`,
      debit: 0,
      credit: o.amount.toNumber(),
      href: `/compras/pagos/${o.id}`,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  let running = 0;
  const lines: StatementLine[] = events.map((e) => {
    running = Math.round((running + e.debit - e.credit) * 100) / 100;
    return { key: e.key, date: e.at.toISOString(), kind: e.kind, description: e.description, debit: e.debit, credit: e.credit, running, href: e.href };
  });

  const open = payables.filter((p) => OPEN.includes(p.status));
  return {
    type,
    id,
    name: "businessName" in creditor ? creditor.businessName : creditor.name,
    cuit: creditor.cuit,
    phone: creditor.phone,
    paymentTermDays: creditor.paymentTermDays,
    balance: open.reduce((a, p) => a + p.balance.toNumber(), 0),
    aging: agingSummary(open.map((p) => ({ balance: p.balance.toNumber(), dueDate: p.dueDate }))),
    open: open
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map((p) => ({
        id: p.id,
        description: p.description,
        issueDate: p.issueDate.toISOString(),
        dueDate: p.dueDate.toISOString(),
        amount: p.amount.toNumber(),
        balance: p.balance.toNumber(),
        status: p.status,
        provisional: p.workshopRemitId !== null,
      })),
    lines,
    ...sources,
  };
}

export type PaymentSources = Pick<CreditorStatement, "registers" | "cheques">;

/** Cajas y cuentas con su saldo, y cheques de terceros en cartera: de dónde puede salir un pago. */
export async function getPaymentSources(): Promise<PaymentSources> {
  const [registers, cheques] = await Promise.all([
    db.cashRegister.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { sessions: { where: { status: "ABIERTA" }, select: { id: true } } },
    }),
    db.cheque.findMany({ where: { kind: "TERCERO", status: "EN_CARTERA" }, orderBy: { paymentDate: "asc" } }),
  ]);
  return {
    registers: await Promise.all(
      registers.map(async (r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        requiresSession: r.requiresSession,
        hasOpenSession: r.sessions.length > 0,
        balance: await registerBalance(db, r.id),
      })),
    ),
    cheques: cheques.map((c) => ({ id: c.id, label: chequeLabel(c), issuerName: c.issuerName, amount: c.amount.toNumber(), paymentDate: c.paymentDate.toISOString() })),
  };
}

export async function getPaymentOrderForPrint(id: string) {
  const o = await db.paymentOrder.findUnique({
    where: { id },
    include: {
      supplier: { select: { businessName: true, cuit: true } },
      workshop: { select: { name: true, cuit: true } },
      employee: { select: { name: true, cuil: true, position: true } },
      cashRegister: { select: { name: true } },
      createdBy: { select: { name: true } },
      items: { include: { cashRegister: { select: { name: true } }, cheque: true } },
      payments: { include: { accountPayable: { select: { description: true, dueDate: true } } } },
    },
  });
  if (!o) return null;
  const instruments = o.items.length
    ? o.items.map((i) => ({
        label: i.cheque
          ? `${i.cheque.kind === "PROPIO" ? "Cheque propio" : "Cheque de terceros"} ${chequeLabel(i.cheque)} — vto. ${i.cheque.paymentDate.toLocaleDateString("es-AR")}${i.cheque.kind === "TERCERO" ? ` — librador ${i.cheque.issuerName}` : ""}`
          : `${PAYMENT_METHOD_LABELS[i.method]} — ${i.cashRegister?.name ?? ""}${i.reference ? ` (${i.reference})` : ""}`,
        amount: i.amount.toNumber(),
      }))
    : [{ label: `${PAYMENT_METHOD_LABELS[o.method ?? "MIXTO"]} — ${o.cashRegister?.name ?? ""}${o.reference ? ` (${o.reference})` : ""}`, amount: o.amount.toNumber() }];
  return {
    number: o.number,
    date: o.date.toISOString(),
    creditorName: o.supplier?.businessName ?? o.workshop?.name ?? o.employee?.name ?? "",
    creditorCuit: o.supplier?.cuit ?? o.workshop?.cuit ?? null,
    /** Pago de sueldo: empleado, puesto y concepto del mes */
    salary: o.employee
      ? {
          cuil: o.employee.cuil,
          position: o.employee.position,
          concept: `${SALARY_CONCEPT_LABELS[o.salaryConcept ?? "SUELDO"]} ${periodLabel(o.salaryPeriod ?? "")}`,
        }
      : null,
    amount: o.amount.toNumber(),
    notes: o.notes,
    createdBy: o.createdBy.name,
    instruments,
    lines: o.payments.map((p) => ({
      description: p.accountPayable?.description ?? "—",
      dueDate: p.accountPayable?.dueDate.toISOString() ?? null,
      amount: p.amount.toNumber(),
    })),
  };
}
