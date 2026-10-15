import "server-only";

import { isoLocalDate } from "@/lib/dates";
import { bucketOf, monthBounds, shiftMonth, weekBuckets, WEEKS_PER_MONTH } from "@/lib/finance/periods";
import { MOVEMENT_SIGN } from "@/lib/treasury/cash";
import { db } from "@/server/db";

const round = (n: number) => Math.round(n * 100) / 100;

// ─── Gastos ──────────────────────────────────────────────────────────────

export async function expensesOfPeriod(period: string) {
  const { from, to } = monthBounds(period);
  const [categories, movements] = await Promise.all([
    db.expenseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.cashMovement.findMany({
      where: { type: "EGRESO", expenseCategoryId: { not: null }, createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: "desc" },
      include: { cashRegister: { select: { name: true } }, user: { select: { name: true } }, expenseCategory: { select: { name: true } } },
    }),
  ]);
  const byCategory = new Map<string, number>();
  for (const m of movements) byCategory.set(m.expenseCategoryId!, (byCategory.get(m.expenseCategoryId!) ?? 0) + m.amount.toNumber());
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, fixed: c.fixed, active: c.active, total: round(byCategory.get(c.id) ?? 0) })),
    total: round([...byCategory.values()].reduce((a, v) => a + v, 0)),
    movements: movements.map((m) => ({
      id: m.id,
      date: m.createdAt.toISOString(),
      category: m.expenseCategory?.name ?? "",
      concept: m.concept,
      register: m.cashRegister.name,
      user: m.user.name,
      amount: m.amount.toNumber(),
    })),
  };
}

// ─── Estado de resultados ───────────────────────────────────────────────

export interface IncomeStatement {
  period: string;
  sales: number;
  returns: number;
  netSales: number;
  costOfSales: number;
  grossMargin: number;
  grossMarginPct: number | null;
  expenses: { name: string; amount: number }[];
  expensesTotal: number;
  salaries: number;
  operatingResult: number;
  salesCount: number;
}

/** Ventas netas sin IVA, costo de lo vendido (costo al momento de la venta), gastos y sueldos del mes. */
export async function incomeStatement(period: string): Promise<IncomeStatement> {
  const { from, to } = monthBounds(period);
  const range = { gte: from, lt: to };
  const [sales, returns, soldItems, returnedItems, expenses, salaries] = await Promise.all([
    db.sale.aggregate({ where: { kind: "VENTA", status: { not: "ANULADA" }, createdAt: range }, _sum: { subtotal: true }, _count: true }),
    db.sale.aggregate({ where: { kind: "DEVOLUCION", status: { not: "ANULADA" }, createdAt: range }, _sum: { subtotal: true } }),
    db.saleItem.findMany({ where: { sale: { kind: "VENTA", status: { not: "ANULADA" }, createdAt: range } }, select: { quantity: true, unitCost: true } }),
    // Lo devuelto que volvió al stock deja de ser costo; lo fallado (no vuelve) sigue siendo pérdida.
    db.saleItem.findMany({ where: { restocked: true, sale: { kind: "DEVOLUCION", status: { not: "ANULADA" }, createdAt: range } }, select: { quantity: true, unitCost: true } }),
    db.cashMovement.groupBy({ by: ["expenseCategoryId"], where: { type: "EGRESO", expenseCategoryId: { not: null }, createdAt: range }, _sum: { amount: true } }),
    db.paymentOrder.aggregate({ where: { employeeId: { not: null }, date: range }, _sum: { amount: true } }),
  ]);
  const categories = new Map((await db.expenseCategory.findMany({ select: { id: true, name: true, sortOrder: true } })).map((c) => [c.id, c]));
  const cost = (rows: { quantity: { toNumber(): number }; unitCost: { toNumber(): number } }[]) => rows.reduce((a, r) => a + r.quantity.toNumber() * r.unitCost.toNumber(), 0);

  const gross = sales._sum.subtotal?.toNumber() ?? 0;
  const ret = returns._sum.subtotal?.toNumber() ?? 0;
  const netSales = gross - ret;
  const costOfSales = cost(soldItems) - cost(returnedItems);
  const grossMargin = netSales - costOfSales;
  const expenseRows = expenses
    .map((e) => ({ name: categories.get(e.expenseCategoryId!)?.name ?? "Sin categoría", order: categories.get(e.expenseCategoryId!)?.sortOrder ?? 999, amount: round(e._sum.amount?.toNumber() ?? 0) }))
    .sort((a, b) => a.order - b.order)
    .map(({ name, amount }) => ({ name, amount }));
  const expensesTotal = expenseRows.reduce((a, e) => a + e.amount, 0);
  const salariesTotal = salaries._sum.amount?.toNumber() ?? 0;
  return {
    period,
    sales: round(gross),
    returns: round(ret),
    netSales: round(netSales),
    costOfSales: round(costOfSales),
    grossMargin: round(grossMargin),
    grossMarginPct: netSales > 0 ? Math.round((grossMargin / netSales) * 1000) / 10 : null,
    expenses: expenseRows,
    expensesTotal: round(expensesTotal),
    salaries: round(salariesTotal),
    operatingResult: round(grossMargin - expensesTotal - salariesTotal),
    salesCount: sales._count,
  };
}

// ─── Flujo de fondos proyectado ─────────────────────────────────────────

export interface CashFlowWeek {
  label: string;
  receivables: number;
  cheques: number;
  orders: number;
  payables: number;
  ownCheques: number;
  fixedCosts: number;
  inflow: number;
  outflow: number;
  net: number;
  balance: number;
}

/**
 * Proyección semanal: arranca con el saldo de todas las cajas y cuentas, suma lo
 * que se espera cobrar (cuentas corrientes, cheques en cartera, saldos de pedidos)
 * y resta lo que hay que pagar (proveedores y talleres, cheques propios, gastos
 * fijos y sueldos promedio de los últimos 3 meses). Lo vencido va a la primera semana.
 */
export async function cashFlowProjection(weeks = 8) {
  const today = isoLocalDate();
  const buckets = weekBuckets(today, weeks);
  const horizon = buckets[buckets.length - 1].to;
  const threeMonthsAgo = monthBounds(shiftMonth(today.slice(0, 7), -3)).from;
  const thisMonth = monthBounds(today.slice(0, 7)).from;

  const [registers, movements, receivables, cheques, orders, payables, ownCheques, fixedExpenses, salaries] = await Promise.all([
    db.cashRegister.findMany({ where: { active: true }, select: { id: true, name: true, kind: true } }),
    db.cashMovement.groupBy({ by: ["cashRegisterId", "type"], _sum: { amount: true } }),
    db.accountReceivable.findMany({ where: { status: { in: ["PENDIENTE", "PARCIAL"] }, dueDate: { lt: horizon } }, select: { balance: true, dueDate: true } }),
    db.cheque.findMany({ where: { kind: "TERCERO", status: "EN_CARTERA", paymentDate: { lt: horizon } }, select: { amount: true, paymentDate: true } }),
    db.customerOrder.findMany({ where: { status: { in: ["ABIERTO", "EN_PRODUCCION", "LISTO"] }, promisedDate: { not: null, lt: horizon } }, select: { total: true, promisedDate: true, payments: { select: { amount: true } } } }),
    db.accountPayable.findMany({ where: { status: { in: ["PENDIENTE", "PARCIAL"] }, dueDate: { lt: horizon } }, select: { balance: true, dueDate: true } }),
    db.cheque.findMany({ where: { kind: "PROPIO", status: "EMITIDO", paymentDate: { lt: horizon } }, select: { amount: true, paymentDate: true } }),
    db.cashMovement.aggregate({ where: { type: "EGRESO", expenseCategory: { fixed: true }, createdAt: { gte: threeMonthsAgo, lt: thisMonth } }, _sum: { amount: true } }),
    db.paymentOrder.aggregate({ where: { employeeId: { not: null }, date: { gte: threeMonthsAgo, lt: thisMonth } }, _sum: { amount: true } }),
  ]);

  const balanceOf = (registerId: string) =>
    movements.filter((m) => m.cashRegisterId === registerId).reduce((a, m) => a + MOVEMENT_SIGN[m.type] * (m._sum.amount?.toNumber() ?? 0), 0);
  const startBalances = registers.map((r) => ({ name: r.name, kind: r.kind, balance: round(balanceOf(r.id)) }));
  const start = round(startBalances.reduce((a, r) => a + r.balance, 0));

  const rows = buckets.map(() => ({ receivables: 0, cheques: 0, orders: 0, payables: 0, ownCheques: 0 }));
  const put = (date: Date, key: keyof (typeof rows)[number], amount: number) => {
    const i = bucketOf(buckets, date);
    if (i !== null) rows[i][key] += amount;
  };
  for (const r of receivables) put(r.dueDate, "receivables", r.balance.toNumber());
  for (const c of cheques) put(c.paymentDate, "cheques", c.amount.toNumber());
  for (const o of orders) put(o.promisedDate!, "orders", Math.max(0, o.total.toNumber() - o.payments.reduce((a, p) => a + p.amount.toNumber(), 0)));
  for (const p of payables) put(p.dueDate, "payables", p.balance.toNumber());
  for (const c of ownCheques) put(c.paymentDate, "ownCheques", c.amount.toNumber());

  // Gastos fijos y sueldos: promedio mensual de los 3 meses cerrados, repartido por semana.
  const monthlyFixed = ((fixedExpenses._sum.amount?.toNumber() ?? 0) + (salaries._sum.amount?.toNumber() ?? 0)) / 3;
  const weeklyFixed = round(monthlyFixed / WEEKS_PER_MONTH);

  let balance = start;
  const out: CashFlowWeek[] = rows.map((r, i) => {
    const inflow = r.receivables + r.cheques + r.orders;
    const outflow = r.payables + r.ownCheques + weeklyFixed;
    balance += inflow - outflow;
    return {
      label: buckets[i].label,
      receivables: round(r.receivables),
      cheques: round(r.cheques),
      orders: round(r.orders),
      payables: round(r.payables),
      ownCheques: round(r.ownCheques),
      fixedCosts: weeklyFixed,
      inflow: round(inflow),
      outflow: round(outflow),
      net: round(inflow - outflow),
      balance: round(balance),
    };
  });
  return { start, startBalances, weeks: out, monthlyFixed: round(monthlyFixed) };
}

// ─── Libro IVA ──────────────────────────────────────────────────────────

const SALE_FISCAL = ["FACTURA_A", "FACTURA_B", "NOTA_CREDITO_A", "NOTA_CREDITO_B"] as const;
const IVA_TYPE_LABELS: Record<string, string> = {
  FACTURA_A: "Factura A",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  NOTA_CREDITO_A: "Nota de crédito A",
  NOTA_CREDITO_B: "Nota de crédito B",
  NOTA_CREDITO_C: "Nota de crédito C",
  TICKET_INTERNO: "Sin factura",
};
const voucherNo = (pos: number | null, n: number | string | null) => `${String(pos ?? 0).padStart(5, "0")}-${String(n ?? "").padStart(8, "0")}`;

/** IVA Ventas: comprobantes autorizados por ARCA; las notas de crédito restan. */
export async function ivaSalesBook(from: Date, to: Date) {
  const sales = await db.sale.findMany({
    where: { invoiceType: { in: [...SALE_FISCAL] }, arcaStatus: "AUTORIZADO", createdAt: { gte: from, lt: to } },
    orderBy: [{ createdAt: "asc" }],
    include: { client: true, items: { select: { subtotal: true, vatRate: true } } },
  });
  const rows = sales.map((s) => {
    const sign = s.kind === "DEVOLUCION" ? -1 : 1;
    const by = new Map<number, number>();
    for (const i of s.items) by.set(i.vatRate.toNumber(), (by.get(i.vatRate.toNumber()) ?? 0) + i.subtotal.toNumber());
    const part = (rate: number) => {
      const gross = by.get(rate) ?? 0;
      const net = round(gross / (1 + rate / 100));
      return { net: sign * net, vat: sign * round(gross - net) };
    };
    const r21 = part(21);
    const r105 = part(10.5);
    return {
      date: s.createdAt,
      type: IVA_TYPE_LABELS[s.invoiceType] ?? s.invoiceType,
      number: voucherNo(s.pointOfSale, s.invoiceNumber),
      cae: s.cae,
      client: s.client?.businessName ?? "Consumidor final",
      doc: s.client?.documentNumber ?? null,
      net21: r21.net,
      vat21: r21.vat,
      net105: r105.net,
      vat105: r105.vat,
      exempt: sign * round(by.get(0) ?? 0),
      total: sign * s.total.toNumber(),
    };
  });
  const sum = (k: keyof (typeof rows)[number]) => round(rows.reduce((a, r) => a + (r[k] as number), 0));
  return { rows, totals: { net: round(sum("net21") + sum("net105") + sum("exempt")), vat: round(sum("vat21") + sum("vat105")), vat21: sum("vat21"), vat105: sum("vat105"), total: sum("total") } };
}

/** IVA Compras: facturas y notas de crédito de proveedores y talleres; las NC restan. */
export async function ivaPurchasesBook(from: Date, to: Date) {
  const purchases = await db.purchase.findMany({
    where: { status: { not: "ANULADA" }, invoiceType: { notIn: ["TICKET_INTERNO"] }, date: { gte: from, lt: to } },
    orderBy: [{ date: "asc" }],
    include: { supplier: true, workshop: true },
  });
  const rows = purchases.map((p) => {
    const sign = p.kind === "NOTA_CREDITO" ? -1 : 1;
    return {
      date: p.date,
      type: IVA_TYPE_LABELS[p.invoiceType ?? ""] ?? p.invoiceType ?? "",
      number: voucherNo(p.pointOfSale, p.invoiceNumber),
      creditor: p.supplier?.businessName ?? p.workshop?.name ?? "",
      cuit: p.supplier?.cuit ?? p.workshop?.cuit ?? null,
      net: sign * p.subtotal.toNumber(),
      vat21: sign * p.vat21.toNumber(),
      vat105: sign * p.vat105.toNumber(),
      vat27: sign * p.vat27.toNumber(),
      perceptionIva: sign * p.perceptionIva.toNumber(),
      perceptionIibb: sign * p.perceptionIibb.toNumber(),
      otherTaxes: sign * p.otherTaxes.toNumber(),
      total: sign * p.total.toNumber(),
    };
  });
  const sum = (k: keyof (typeof rows)[number]) => round(rows.reduce((a, r) => a + (r[k] as number), 0));
  return {
    rows,
    totals: { net: sum("net"), vat: round(sum("vat21") + sum("vat105") + sum("vat27")), perceptionIva: sum("perceptionIva"), perceptionIibb: sum("perceptionIibb"), total: sum("total") },
  };
}

// ─── Panel ──────────────────────────────────────────────────────────────

/** Indicadores del día y del mes, y alertas que requieren acción. */
export async function dashboardKpis() {
  const today = isoLocalDate();
  const period = today.slice(0, 7);
  const dayStart = new Date(`${today}T00:00:00-03:00`);
  const { from: monthStart } = monthBounds(period);
  const prev = monthBounds(shiftMonth(period, -1)).from;
  // Mismo tramo del mes anterior (del 1 al mismo día) para comparar en igualdad de días.
  const prevSameDay = new Date(prev.getTime() + (Date.now() - monthStart.getTime()));
  const in7 = new Date(dayStart.getTime() + 8 * 86_400_000);
  const saleWhere = { kind: "VENTA" as const, status: { not: "ANULADA" as const } };

  const [today$, month$, prev$, byBranch, topItems, restock, lateOrders, readyOrders, lateOps, openOps, pendingCae, overdueAr, payablesSoon, ownChequesSoon, chequesToDeposit, credits, statement] =
    await Promise.all([
      db.sale.aggregate({ where: { ...saleWhere, createdAt: { gte: dayStart } }, _sum: { total: true }, _count: true }),
      db.sale.aggregate({ where: { ...saleWhere, createdAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
      db.sale.aggregate({ where: { ...saleWhere, createdAt: { gte: prev, lt: prevSameDay } }, _sum: { total: true }, _count: true }),
      db.sale.groupBy({ by: ["branchId"], where: { ...saleWhere, createdAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
      db.saleItem.groupBy({
        by: ["productId"],
        where: { productId: { not: null }, sale: { ...saleWhere, createdAt: { gte: monthStart } } },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { subtotal: "desc" } },
        take: 8,
      }),
      db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM branch_stocks bs JOIN branches b ON b.id = bs."branchId" WHERE bs."minQty" > 0 AND bs.quantity < bs."minQty" AND b.active`,
      db.customerOrder.count({ where: { status: { in: ["ABIERTO", "EN_PRODUCCION", "LISTO"] }, promisedDate: { lt: dayStart } } }),
      db.customerOrder.count({ where: { status: "LISTO" } }),
      db.productionOrder.count({ where: { status: { in: ["BORRADOR", "EN_PROCESO"] }, dueDate: { lt: dayStart } } }),
      db.productionOrder.count({ where: { status: "EN_PROCESO" } }),
      db.sale.count({ where: { arcaStatus: { in: ["PENDIENTE", "RECHAZADO"] } } }),
      db.accountReceivable.aggregate({ where: { status: { in: ["PENDIENTE", "PARCIAL"] }, dueDate: { lt: dayStart } }, _sum: { balance: true }, _count: true }),
      db.accountPayable.aggregate({ where: { status: { in: ["PENDIENTE", "PARCIAL"] }, dueDate: { lt: in7 } }, _sum: { balance: true }, _count: true }),
      db.cheque.aggregate({ where: { kind: "PROPIO", status: "EMITIDO", paymentDate: { lt: in7 } }, _sum: { amount: true }, _count: true }),
      db.cheque.aggregate({ where: { kind: "TERCERO", status: "EN_CARTERA", paymentDate: { lt: in7 } }, _sum: { amount: true }, _count: true }),
      db.storeCredit.aggregate({ where: { status: "ACTIVO" }, _sum: { balance: true }, _count: true }),
      incomeStatement(period),
    ]);
  const [branches, products] = await Promise.all([
    db.branch.findMany({ where: { id: { in: byBranch.flatMap((b) => (b.branchId ? [b.branchId] : [])) } }, select: { id: true, name: true } }),
    db.product.findMany({ where: { id: { in: topItems.map((t) => t.productId!) } }, select: { id: true, name: true } }),
  ]);
  const monthTotal = month$._sum.total?.toNumber() ?? 0;
  const prevTotal = prev$._sum.total?.toNumber() ?? 0;
  return {
    today: { total: today$._sum.total?.toNumber() ?? 0, count: today$._count },
    month: {
      total: monthTotal,
      count: month$._count,
      avgTicket: month$._count ? round(monthTotal / month$._count) : 0,
      vsPrevPct: prevTotal > 0 ? Math.round(((monthTotal - prevTotal) / prevTotal) * 1000) / 10 : null,
      grossMargin: statement.grossMargin,
      grossMarginPct: statement.grossMarginPct,
      operatingResult: statement.operatingResult,
    },
    byBranch: byBranch
      .map((b) => ({ name: branches.find((x) => x.id === b.branchId)?.name ?? "Sin local", total: b._sum.total?.toNumber() ?? 0, count: b._count }))
      .sort((a, b) => b.total - a.total),
    topProducts: topItems.map((t) => ({ name: products.find((p) => p.id === t.productId)?.name ?? "—", quantity: t._sum.quantity?.toNumber() ?? 0, total: t._sum.subtotal?.toNumber() ?? 0 })),
    alerts: {
      restock: Number(restock[0]?.n ?? 0),
      lateOrders,
      readyOrders,
      lateOps,
      openOps,
      pendingCae,
      overdueReceivables: { amount: overdueAr._sum.balance?.toNumber() ?? 0, count: overdueAr._count },
      payablesSoon: { amount: payablesSoon._sum.balance?.toNumber() ?? 0, count: payablesSoon._count },
      ownChequesSoon: { amount: ownChequesSoon._sum.amount?.toNumber() ?? 0, count: ownChequesSoon._count },
      chequesToDeposit: { amount: chequesToDeposit._sum.amount?.toNumber() ?? 0, count: chequesToDeposit._count },
      storeCredits: { amount: credits._sum.balance?.toNumber() ?? 0, count: credits._count },
    },
  };
}
