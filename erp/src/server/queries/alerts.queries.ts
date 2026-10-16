import "server-only";

import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isoLocalDate, startOfLocalDay } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { db } from "@/server/db";

export interface AlertItem {
  key: string;
  text: string;
  href: string;
  /** urgente: vencido o atrasado; aviso: para tener en cuenta */
  level: "urgente" | "aviso";
}

/**
 * Avisos automáticos para la campana del encabezado: se calculan al abrir cada
 * pantalla, según los permisos del usuario y, si tiene un local asignado, solo
 * de su local. Cada aviso lleva a la pantalla donde se resuelve.
 */
export async function getAlerts(user: { permissions: string[]; branchId: string | null }): Promise<AlertItem[]> {
  const can = (p: string) => hasPermission(user.permissions, p);
  const dayStart = startOfLocalDay(isoLocalDate());
  const in7 = new Date(dayStart.getTime() + 8 * 86_400_000);
  const branch = user.branchId;
  const out: AlertItem[] = [];
  const jobs: Promise<void>[] = [];
  const add = (cond: boolean, job: () => Promise<AlertItem | null>) => {
    if (cond) jobs.push(job().then((a) => void (a && out.push(a))));
  };

  add(can(PERMISSIONS.mastersRead), async () => {
    const [{ n }] = branch
      ? await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM branch_stocks bs WHERE bs."branchId" = ${branch} AND bs."minQty" > 0 AND bs.quantity < bs."minQty"`
      : await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM branch_stocks bs JOIN branches b ON b.id = bs."branchId" WHERE bs."minQty" > 0 AND bs.quantity < bs."minQty" AND b.active`;
    const c = Number(n);
    return c ? { key: "stock", text: `${c} talles por debajo del stock mínimo`, href: "/maestros/stock/reposicion", level: "aviso" } : null;
  });
  add(can(PERMISSIONS.posSell), async () => {
    const c = await db.customerOrder.count({ where: { status: "LISTO", ...(branch ? { branchId: branch } : {}) } });
    return c ? { key: "listos", text: `${c} pedidos listos para entregar: avisar al cliente`, href: "/ventas/pedidos?filtro=listos", level: "aviso" } : null;
  });
  add(can(PERMISSIONS.posSell), async () => {
    const c = await db.customerOrder.count({ where: { status: { in: ["ABIERTO", "EN_PRODUCCION", "LISTO"] }, promisedDate: { lt: dayStart }, ...(branch ? { branchId: branch } : {}) } });
    return c ? { key: "pedidos-vencidos", text: `${c} pedidos con fecha de entrega vencida`, href: "/ventas/pedidos", level: "urgente" } : null;
  });
  add(can(PERMISSIONS.productionRead), async () => {
    const c = await db.productionOrder.count({ where: { status: { in: ["BORRADOR", "EN_PROCESO"] }, dueDate: { lt: dayStart } } });
    return c ? { key: "op", text: `${c} órdenes de producción atrasadas`, href: "/produccion/ordenes", level: "urgente" } : null;
  });
  add(can(PERMISSIONS.cashRead), async () => {
    const c = await db.sale.count({ where: { arcaStatus: { in: ["PENDIENTE", "RECHAZADO"] } } });
    return c ? { key: "cae", text: `${c} comprobantes sin CAE de ARCA`, href: "/ventas?filtro=pendientes", level: "urgente" } : null;
  });
  add(can(PERMISSIONS.receivablesRead) || can(PERMISSIONS.cashRead), async () => {
    const r = await db.accountReceivable.aggregate({ where: { status: { in: ["PENDIENTE", "PARCIAL"] }, dueDate: { lt: dayStart } }, _sum: { balance: true }, _count: true });
    return r._count ? { key: "cobrar", text: `${formatMoney(r._sum.balance?.toNumber() ?? 0)} vencidos de clientes (${r._count})`, href: "/tesoreria/cobranzas", level: "urgente" } : null;
  });
  add(can(PERMISSIONS.payablesRead), async () => {
    const r = await db.accountPayable.aggregate({ where: { status: { in: ["PENDIENTE", "PARCIAL"] }, dueDate: { lt: in7 } }, _sum: { balance: true }, _count: true });
    return r._count ? { key: "pagar", text: `${formatMoney(r._sum.balance?.toNumber() ?? 0)} a pagar en los próximos 7 días o vencido (${r._count})`, href: "/compras/cuentas", level: "aviso" } : null;
  });
  add(can(PERMISSIONS.cashRead), async () => {
    const r = await db.cheque.aggregate({ where: { kind: "PROPIO", status: "EMITIDO", paymentDate: { lt: in7 } }, _sum: { amount: true }, _count: true });
    return r._count ? { key: "cheques-propios", text: `${formatMoney(r._sum.amount?.toNumber() ?? 0)} en cheques propios que se debitan esta semana (${r._count})`, href: "/tesoreria/cheques", level: "aviso" } : null;
  });
  add(can(PERMISSIONS.cashRead), async () => {
    const r = await db.cheque.aggregate({ where: { kind: "TERCERO", status: "EN_CARTERA", paymentDate: { lt: in7 } }, _sum: { amount: true }, _count: true });
    return r._count ? { key: "cheques-terceros", text: `${formatMoney(r._sum.amount?.toNumber() ?? 0)} en cheques de terceros para depositar esta semana (${r._count})`, href: "/tesoreria/cheques", level: "aviso" } : null;
  });

  await Promise.all(jobs);
  const order = ["pedidos-vencidos", "op", "cae", "cobrar", "listos", "stock", "pagar", "cheques-propios", "cheques-terceros"];
  return out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
