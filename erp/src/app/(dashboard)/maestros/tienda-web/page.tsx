import type { Metadata } from "next";
import Link from "next/link";

import { BridgeControls } from "@/components/woo/bridge-controls";
import { LinkCell } from "@/components/woo/link-cell";
import { WooControls } from "@/components/woo/woo-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney, formatNumber } from "@/lib/format";
import { ORDER_STATUS_LABELS, webQuantity } from "@/lib/woo/stock";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { webStockByVariant } from "@/server/services/stock.service";
import { wooConfig } from "@/server/woo/config";
import { PLUGIN_VERSION } from "@/server/woo/wordpress-plugin";

export const metadata: Metadata = { title: "Tienda web" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "sin-vincular", label: "Sin vincular" },
  { key: "errores", label: "Con error" },
];

type Props = { searchParams: Promise<{ ver?: string }> };

/** El plugin se conecta cada 5 minutos: más de media hora sin contacto es para revisar. */
const isStale = (d: Date | null) => !!d && Date.now() - d.getTime() > 30 * 60_000;

const dt = (d: Date | null) => (d ? d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default async function WebStorePage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.mastersRead);
  const canWrite = hasPermission(user.permissions, PERMISSIONS.mastersWrite);
  const cfg = wooConfig();
  const { ver } = await searchParams;
  const filter = FILTERS.find((f) => f.key === ver) ?? FILTERS[0];

  const [links, counts, runs, orders, skus, branch, localStock, bridge] = await Promise.all([
    db.wooLink.findMany({
      where: filter.key === "sin-vincular" ? { variantId: null } : filter.key === "errores" ? { lastError: { not: null } } : {},
      orderBy: [{ variantId: { sort: "asc", nulls: "first" } }, { wooName: "asc" }],
      take: 500,
      include: { variant: { select: { sku: true } } },
    }),
    db.wooLink.groupBy({ by: ["linkedBy"], _count: true }),
    db.wooSyncRun.findMany({ orderBy: { startedAt: "desc" }, take: 6 }),
    db.wooOrder.findMany({ orderBy: { orderDate: "desc" }, take: 10 }),
    db.productVariant.findMany({ where: { active: true }, select: { sku: true }, orderBy: { sku: "asc" } }),
    Promise.resolve(cfg.ordersBranch),
    webStockByVariant(db),
    db.wooBridge.findUnique({ where: { id: "default" } }),
  ]);
  const stale = isStale(bridge?.lastSeenAt ?? null);
  const modeLabel = cfg.mode === "activo" ? "Activa" : cfg.mode === "solo-lectura" ? "Modo prueba (solo lectura)" : "Desactivada";
  const modeBadge = cfg.mode === "activo" ? ("success" as const) : cfg.mode === "solo-lectura" ? ("accent" as const) : ("outline" as const);
  const stockOf = (variantId: string | null) => (variantId ? (localStock.get(variantId) ?? 0) : 0);
  const total = counts.reduce((a, c) => a + c._count, 0);
  const unlinked = counts.find((c) => c.linkedBy === null)?._count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Tienda web (WooCommerce)</h1>
        <p className="text-sm text-muted-foreground">
          La web publica el <strong className="text-foreground">stock de los locales (Recta Martinolli + Villa Allende, sin el mayorista) menos {cfg.safetyStock} unidades</strong> de
          margen de seguridad. En escolar cada colegio está en su local, así que la web muestra lo que hay en ese local; en los demás rubros, el stock general de los dos. Los
          pedidos pagados en la web descuentan{" "}
          {branch ? (
            <>
              de <strong className="text-foreground">{branch}</strong>
            </>
          ) : (
            "del local que tiene el artículo (el de más stock)"
          )}
          ; si se cancelan, vuelve. Los precios no se tocan.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Conexión {bridge ? "por plugin de WordPress" : cfg.configured ? "directa (API)" : ""}
            <Badge variant={modeBadge}>{modeLabel}</Badge>
          </CardTitle>
          <CardDescription>
            {bridge ? (
              bridge.lastSeenAt ? (
                <>
                  Último contacto del plugin: <strong className={stale ? "text-destructive" : "text-foreground"}>{dt(bridge.lastSeenAt)}</strong>
                  {bridge.siteUrl && <> · {bridge.siteUrl}</>}
                  {bridge.pluginVersion && <> · plugin v{bridge.pluginVersion}</>}
                  {bridge.pluginVersion && bridge.pluginVersion !== PLUGIN_VERSION && (
                    <strong className="block text-destructive">
                      Hay una versión nueva del plugin (v{PLUGIN_VERSION}, carga los códigos de barras en la tienda): descargala y subila en WordPress (Plugins → Añadir nuevo → Subir plugin → Reemplazar).
                    </strong>
                  )}
                  {stale && " · hace más de media hora que no se conecta: revisá que el plugin esté activo y que el sitio tenga visitas (WordPress ejecuta las tareas automáticas cuando alguien entra)."}
                </>
              ) : (
                "Esperando la primera conexión del plugin: instalalo y activalo en WordPress (pasos abajo)."
              )
            ) : cfg.configured ? (
              <>
                {cfg.url} · sincronización automática cada {cfg.intervalMinutes} min
              </>
            ) : (
              "La tienda todavía no está conectada."
            )}
            {cfg.mode === "solo-lectura" && " En modo prueba no se escribe nada en la tienda ni se descuenta stock: sirve para revisar los vínculos antes de activarla."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 text-sm">
          {canWrite && <BridgeControls connected={!!bridge} />}
          {(!bridge || !bridge.lastSeenAt) && (
            <ol className="list-inside list-decimal space-y-1.5">
              <li>Tocá «Descargar plugin para WordPress» (ya trae la dirección del ERP y la clave; no lo compartas).</li>
              <li>
                En WordPress: <strong>Plugins → Añadir nuevo → Subir plugin</strong>, elegí el archivo <code>coverline-erp-stock.zip</code>, <strong>Instalar ahora</strong> y{" "}
                <strong>Activar</strong>.
              </li>
              <li>
                En WordPress: <strong>Ajustes → Coverline ERP → Sincronizar ahora</strong>. En unos segundos aparece acá la lista de productos para revisar los vínculos.
              </li>
              <li>
                Cuando esté todo bien, en Render cambiá <code>WOO_SYNC_MODE</code> a <code>activo</code>. Desde ahí el plugin publica el stock y el ERP descuenta los pedidos web.
              </li>
            </ol>
          )}
          {!bridge && (
            <p className="text-muted-foreground">
              El plugin se conecta desde la tienda hacia el ERP, así que funciona aunque el hosting bloquee las conexiones de otros países. No hace falta cargar claves de
              WooCommerce.
            </p>
          )}
          {!bridge && cfg.configured && canWrite && (
            <div className="flex flex-col gap-2 border-t pt-4">
              <p className="font-medium">Conexión directa por API (alternativa)</p>
              <WooControls mode={cfg.mode} />
            </div>
          )}
        </CardContent>
      </Card>

      {total > 0 && (
        <Card>
          <CardHeader className="gap-3">
            <CardTitle>
              Artículos de la tienda: {total} · vinculados {total - unlinked} · sin vincular{" "}
              <span className={unlinked ? "text-destructive" : undefined}>{unlinked}</span>
            </CardTitle>
            <CardDescription>
              Se vinculan solos cuando el SKU de la variación en WooCommerce es igual al SKU (o código de barras) de la variante del ERP. Los que no coinciden se vinculan a
              mano escribiendo el SKU del ERP.
            </CardDescription>
            <nav aria-label="Filtro" className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={f.key === "todos" ? "/maestros/tienda-web" : `/maestros/tienda-web?ver=${f.key}`}
                  aria-current={f === filter ? "page" : undefined}
                  className={cn("flex h-9 items-center rounded-md border px-3 text-sm", f === filter ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted")}
                >
                  {f.label}
                </Link>
              ))}
            </nav>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 py-0">
            <datalist id="erp-skus">
              {skus.map((s) => (
                <option key={s.sku} value={s.sku} />
              ))}
            </datalist>
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Artículo en la web</TableHead>
                  <TableHead>SKU web</TableHead>
                  <TableHead>Variante del ERP</TableHead>
                  <TableHead className="text-right">Stock locales</TableHead>
                  <TableHead className="text-right">En la web</TableHead>
                  <TableHead className="pr-5">Última publicación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="pl-5">
                      {l.wooName}
                      {l.linkedBy === "MANUAL" && (
                        <Badge variant="outline" className="ml-2">
                          Manual
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.wooSku ?? <span className="text-destructive">sin SKU</span>}</TableCell>
                    <TableCell>
                      <LinkCell linkId={l.id} current={l.variant?.sku ?? null} datalistId="erp-skus" canWrite={canWrite} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{l.variant ? formatNumber(stockOf(l.variantId)) : "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {l.variant ? (
                        <>
                          {l.lastPushedQty ?? "—"}
                          {l.lastPushedQty !== webQuantity(stockOf(l.variantId), cfg.safetyStock) && (
                            <span className="block text-xs text-muted-foreground">→ {webQuantity(stockOf(l.variantId), cfg.safetyStock)}</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="pr-5 text-sm">
                      {dt(l.lastPushedAt)}
                      {l.lastError && <span className="block text-xs text-destructive">{l.lastError}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Últimos pedidos web</CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <Table>
              <TableBody>
                {orders.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="px-5 py-6 text-center text-sm text-muted-foreground">Todavía no se leyeron pedidos.</TableCell>
                  </TableRow>
                )}
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="pl-5">
                      #{o.number}
                      <span className="block text-xs text-muted-foreground">{o.customer ?? "—"}</span>
                    </TableCell>
                    <TableCell>{dt(o.orderDate)}</TableCell>
                    <TableCell>
                      <Badge variant={o.deducted ? "success" : "outline"}>{ORDER_STATUS_LABELS[o.status] ?? o.status}</Badge>
                    </TableCell>
                    <TableCell className="pr-5 text-right font-mono tabular-nums">{formatMoney(o.total.toNumber())}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Últimas sincronizaciones</CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <Table>
              <TableBody>
                {runs.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="px-5 py-6 text-center text-sm text-muted-foreground">Sin sincronizaciones todavía.</TableCell>
                  </TableRow>
                )}
                {runs.map((r) => {
                  const s = r.summary as { push?: { sent: number; pending: number }; orders?: { deducted: number } } | null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-5">{dt(r.startedAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.trigger === "puente" ? "plugin" : r.trigger} · {r.mode}
                      </TableCell>
                      <TableCell className="pr-5 text-sm">
                        {r.ok ? (
                          <span className="text-success">
                            {r.mode === "activo" ? `${s?.push?.sent ?? 0} publicados · ${s?.orders?.deducted ?? 0} pedidos` : `${s?.push?.pending ?? 0} cambiarían`}
                          </span>
                        ) : (
                          <span className="text-destructive">{r.error ?? "Con errores"}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
