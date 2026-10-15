import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { endOfLocalDay, startOfLocalDay } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Auditoría" };
export const dynamic = "force-dynamic";

const ENTITY_LABELS: Record<string, string> = {
  Sale: "Venta",
  Purchase: "Compra",
  CustomerOrder: "Pedido",
  ProductionOrder: "Orden de producción",
  Product: "Producto",
  RawMaterial: "Materia prima",
  Client: "Cliente",
  Supplier: "Proveedor",
  Workshop: "Taller",
  Employee: "Personal",
  User: "Usuario",
  CashRegister: "Caja",
  CashRegisterSession: "Turno de caja",
  Cheque: "Cheque",
  BranchStock: "Stock",
  PriceList: "Lista de precios",
  Quote: "Presupuesto",
  PurchaseOrder: "Orden de compra",
  ExpenseCategory: "Categoría de gasto",
  AccountPayable: "Cuenta a pagar",
  AccountReceivable: "Cuenta a cobrar",
};
const LINKS: Record<string, string> = { Sale: "/ventas/", Purchase: "/compras/", CustomerOrder: "/ventas/pedidos/", ProductionOrder: "/produccion/ordenes/", PurchaseOrder: "/compras/ordenes/" };
const dt = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" });
const LIMIT = 300;

type Props = { searchParams: Promise<{ usuario?: string; entidad?: string; accion?: string; desde?: string; hasta?: string; q?: string }> };

/** Quién hizo qué y cuándo: descuentos, anulaciones, ajustes de stock y caja, cambios de precios y usuarios. */
export default async function AuditPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.usersManage);
  const sp = await searchParams;
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.usuario ? { userId: sp.usuario } : {}),
    ...(sp.entidad ? { entity: sp.entidad } : {}),
    ...(sp.accion ? { action: sp.accion } : {}),
    ...(isDate(sp.desde) || isDate(sp.hasta)
      ? { createdAt: { ...(isDate(sp.desde) ? { gte: startOfLocalDay(sp.desde!) } : {}), ...(isDate(sp.hasta) ? { lte: endOfLocalDay(sp.hasta!) } : {}) } }
      : {}),
    ...(sp.q?.trim() ? { OR: [{ reason: { contains: sp.q.trim(), mode: "insensitive" } }, { entityId: sp.q.trim() }] } : {}),
  };
  const [rows, count, users, entities, actions] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: LIMIT, include: { user: { select: { name: true } } } }),
    db.auditLog.count({ where }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    db.auditLog.findMany({ where: sp.entidad ? { entity: sp.entidad } : {}, distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Auditoría</h1>
        <p className="text-sm text-muted-foreground">Registro de acciones sensibles: descuentos, anulaciones, devoluciones, ajustes de stock y de caja, cambios de precios, usuarios y permisos.</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action="/informes/auditoria" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <NativeSelect name="usuario" defaultValue={sp.usuario ?? ""} aria-label="Usuario">
              <option value="">Todos los usuarios</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="entidad" defaultValue={sp.entidad ?? ""} aria-label="Qué">
              <option value="">Todo</option>
              {entities.map((e) => (
                <option key={e.entity} value={e.entity}>
                  {ENTITY_LABELS[e.entity] ?? e.entity}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="accion" defaultValue={sp.accion ?? ""} aria-label="Acción">
              <option value="">Todas las acciones</option>
              {actions.map((a) => (
                <option key={a.action} value={a.action}>
                  {a.action}
                </option>
              ))}
            </NativeSelect>
            <Input type="date" name="desde" defaultValue={sp.desde ?? ""} aria-label="Desde" />
            <Input type="date" name="hasta" defaultValue={sp.hasta ?? ""} aria-label="Hasta" />
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Motivo o id" aria-label="Buscar" />
            <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
              <Button type="submit">Filtrar</Button>
              <Button asChild variant="ghost">
                <Link href="/informes/auditoria">Limpiar</Link>
              </Button>
              <span className="self-center text-sm text-muted-foreground">
                {count} registros{count > LIMIT ? ` (se muestran los ${LIMIT} más recientes)` : ""}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Fecha</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Qué</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="pr-5">Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const href = LINKS[r.entity] ? LINKS[r.entity] + r.entityId : null;
              const data = r.data ? JSON.stringify(r.data) : "";
              return (
                <TableRow key={r.id} className="align-top">
                  <TableCell className="whitespace-nowrap pl-5 tabular-nums">{dt.format(r.createdAt)}</TableCell>
                  <TableCell>{r.user?.name ?? "Sistema"}</TableCell>
                  <TableCell>
                    {href ? (
                      <Link href={href} className="underline underline-offset-4">
                        {ENTITY_LABELS[r.entity] ?? r.entity}
                      </Link>
                    ) : (
                      (ENTITY_LABELS[r.entity] ?? r.entity)
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.action}</TableCell>
                  <TableCell className="max-w-64 text-sm">{r.reason ?? ""}</TableCell>
                  <TableCell className="max-w-96 pr-5">
                    {data && (
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground">{data.length > 80 ? `${data.slice(0, 80)}…` : data}</summary>
                        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{JSON.stringify(r.data, null, 2)}</pre>
                      </details>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
