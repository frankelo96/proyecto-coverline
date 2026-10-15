import "server-only";

import type { CustomerOrderStatus } from "@/generated/prisma/enums";
import { compareSizes, variantAttrs } from "@/lib/catalog/variants";
import { METHOD_LABELS } from "@/lib/treasury/cash";
import { db } from "@/server/db";
import { voucherLabel } from "@/server/queries/sales.queries";
import { activePriceListRules } from "@/server/services/price-lists.service";
import { BRANCH_ORDER } from "@/server/services/stock.service";

export type OrderFilter = "abiertos" | "listos" | "entregados" | "cancelados" | "todos";
const FILTER_STATUS: Record<OrderFilter, CustomerOrderStatus[] | null> = {
  abiertos: ["ABIERTO", "EN_PRODUCCION", "LISTO"],
  listos: ["LISTO"],
  entregados: ["ENTREGADO"],
  cancelados: ["CANCELADO"],
  todos: null,
};

export async function listOrders(filter: OrderFilter, q: string | null) {
  const statuses = FILTER_STATUS[filter];
  const number = q && /^\d+$/.test(q.trim()) ? Number(q.trim()) : null;
  const orders = await db.customerOrder.findMany({
    where: {
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(number !== null ? { number } : q ? { client: { businessName: { contains: q, mode: "insensitive" } } } : {}),
    },
    orderBy: [{ promisedDate: { sort: "asc", nulls: "last" } }, { number: "desc" }],
    take: 300,
    include: { client: { select: { businessName: true } }, branch: { select: { name: true } }, payments: { select: { amount: true } } },
  });
  return orders.map((o) => {
    const deposited = o.payments.reduce((a, p) => a + p.amount.toNumber(), 0);
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      client: o.client.businessName,
      branch: o.branch?.name ?? null,
      createdAt: o.createdAt.toISOString(),
      promisedDate: o.promisedDate?.toISOString() ?? null,
      total: o.total.toNumber(),
      deposited,
      balance: o.total.toNumber() - deposited,
    };
  });
}

/** Cajas diarias con turno abierto (para cobrar señas y entregas), filtradas por el local del usuario. */
async function openDrawers(userBranchId: string | null) {
  return db.cashRegister.findMany({
    where: { active: true, kind: "CAJA_DIARIA", sessions: { some: { status: "ABIERTA" } }, ...(userBranchId ? { branchId: userBranchId } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, branchId: true },
  });
}

export async function getOrderDetail(id: string, userBranchId: string | null) {
  const o = await db.customerOrder.findUnique({
    where: { id },
    include: {
      client: true,
      branch: { select: { id: true, name: true } },
      quote: { select: { id: true, number: true } },
      items: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { createdAt: "asc" }, include: { cheque: true, storeCredit: { select: { code: true } }, createdBy: { select: { name: true } } } },
      productionOrders: { orderBy: { number: "asc" }, select: { id: true, number: true, status: true, currentStage: true, quantityPlanned: true, quantityFinished: true } },
      sale: { select: { id: true, number: true, invoiceType: true, pointOfSale: true, invoiceNumber: true, arcaStatus: true } },
    },
  });
  if (!o) return null;
  const [drawers, branches] = await Promise.all([openDrawers(userBranchId), db.branch.findMany({ where: { active: true }, orderBy: BRANCH_ORDER, select: { id: true, name: true, kind: true } })]);
  // Stock disponible de cada talle por local (para decidir de dónde sale la entrega).
  const variantIds = o.items.flatMap((i) => (i.variantId ? [i.variantId] : []));
  const stocks = await db.branchStock.findMany({ where: { variantId: { in: variantIds } }, select: { variantId: true, branchId: true, quantity: true } });
  const deposited = o.payments.reduce((a, p) => a + p.amount.toNumber(), 0);
  const fromProduction = o.productionOrders.some((p) => p.status !== "CANCELADA");
  const wholesale = branches.find((b) => b.kind === "MAYORISTA");
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    client: {
      id: o.client.id,
      name: o.client.businessName,
      document: o.client.documentNumber,
      canInvoiceA: o.client.taxCondition === "RESPONSABLE_INSCRIPTO" && o.client.documentType === "CUIT" && !!o.client.documentNumber,
      creditLimit: o.client.creditLimit.toNumber(),
      phone: o.client.whatsapp ?? o.client.phone,
    },
    branch: o.branch,
    quote: o.quote,
    createdAt: o.createdAt.toISOString(),
    promisedDate: o.promisedDate?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    notes: o.notes,
    cancelReason: o.cancelReason,
    subtotal: o.subtotal.toNumber(),
    taxTotal: o.taxTotal.toNumber(),
    total: o.total.toNumber(),
    deposited,
    balance: Math.round((o.total.toNumber() - deposited) * 100) / 100,
    items: o.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      description: i.description,
      quantity: i.quantity.toNumber(),
      unitPrice: i.unitPrice.toNumber(),
      discountPct: i.discountPct.toNumber(),
      total: i.subtotal.toNumber(),
      stocks: Object.fromEntries(stocks.filter((s) => s.variantId === i.variantId).map((s) => [s.branchId, s.quantity.toNumber()])),
    })),
    payments: o.payments.map((p) => ({
      id: p.id,
      date: p.createdAt.toISOString(),
      method: METHOD_LABELS[p.method],
      amount: p.amount.toNumber(),
      detail: p.cheque ? `${p.cheque.bank} N° ${p.cheque.number}` : (p.storeCredit?.code ?? p.reference ?? null),
      user: p.createdBy.name,
    })),
    productionOrders: o.productionOrders,
    sale: o.sale ? { id: o.sale.id, number: o.sale.number, voucher: voucherLabel(o.sale) } : null,
    drawers,
    branches,
    /** Local sugerido para sacar la mercadería: el mayorista si se produjo para el cliente */
    defaultStockBranchId: (fromProduction ? wholesale?.id : null) ?? o.branch?.id ?? branches[0]?.id ?? "",
  };
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;

/** Datos para tomar un pedido: clientes, catálogo con precios base, listas, locales y cajas. */
export async function getOrderFormData(userBranchId: string | null, quoteId: string | null) {
  const [clients, products, priceLists, branches, drawers, quote] = await Promise.all([
    db.client.findMany({ where: { active: true }, orderBy: { businessName: "asc" }, select: { id: true, businessName: true, documentNumber: true, priceListId: true } }),
    db.product.findMany({
      where: { active: true, listPrice: { gt: 0 } },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, listPrice: true, vatRate: true, variants: { where: { active: true }, select: { id: true, size: true, color: true, fabric: true, priceAdjustmentPct: true } } },
    }),
    activePriceListRules(db),
    db.branch.findMany({ where: { active: true, ...(userBranchId ? { id: userBranchId } : {}) }, orderBy: BRANCH_ORDER, select: { id: true, name: true } }),
    openDrawers(userBranchId),
    quoteId ? db.quote.findUnique({ where: { id: quoteId }, include: { items: { orderBy: { sortOrder: "asc" } } } }) : null,
  ]);
  return {
    clients: clients.map((c) => ({ id: c.id, name: c.businessName, document: c.documentNumber, priceListId: c.priceListId })),
    products: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      netPrice: p.listPrice.toNumber(),
      vatRate: p.vatRate.toNumber(),
      variants: [...p.variants]
        .sort((a, b) => (a.color ?? "").localeCompare(b.color ?? "", "es") || (a.fabric ?? "").localeCompare(b.fabric ?? "", "es") || compareSizes(a.size, b.size))
        .map((v) => ({ id: v.id, label: `T.${v.size}${variantAttrs(v) ? ` · ${variantAttrs(v)}` : ""}`, sizeAdjustmentPct: v.priceAdjustmentPct.toNumber() })),
    })),
    priceLists,
    branches,
    drawers,
    quote: quote
      ? {
          id: quote.id,
          number: quote.number,
          clientId: quote.clientId,
          notes: quote.notes,
          // Precio del presupuesto (neto con bonificación) llevado a final con IVA.
          items: quote.items.map((i) => ({
            productId: i.productId,
            description: i.description,
            quantity: i.quantity.toNumber(),
            unitPrice: Math.round(i.unitPrice.toNumber() * (1 + i.vatRate.toNumber() / 100) * 100) / 100,
            discountPct: i.discountPct.toNumber(),
          })),
        }
      : null,
  };
}

export type OrderFormData = Awaited<ReturnType<typeof getOrderFormData>>;
