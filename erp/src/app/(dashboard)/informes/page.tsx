import { DatabaseBackup, FileSpreadsheet, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { ENTITIES, ENTITY_KEYS } from "@/lib/masters/definitions";
import { todayIso } from "@/lib/purchasing/labels";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { REPORTS } from "@/server/reports/reports";

export const metadata: Metadata = { title: "Informes" };
export const dynamic = "force-dynamic";

/** Centro de exportación: informes en Excel/CSV, bases de datos e importaciones. */
export default async function ReportsPage() {
  const user = await requirePageUser();
  const can = (p: string) => hasPermission(user.permissions, p);
  const reports = Object.entries(REPORTS).filter(([, r]) => can(r.permission));
  const needs = new Set(reports.flatMap(([, r]) => r.params ?? []));
  const [clients, suppliers, workshops, registers] = await Promise.all([
    needs.has("cliente") ? db.client.findMany({ where: { active: true }, orderBy: { businessName: "asc" }, select: { id: true, businessName: true } }) : [],
    needs.has("acreedor") ? db.supplier.findMany({ where: { active: true }, orderBy: { businessName: "asc" }, select: { id: true, businessName: true } }) : [],
    needs.has("acreedor") ? db.workshop.findMany({ where: { active: true, isInternal: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    needs.has("caja") ? db.cashRegister.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);
  const today = todayIso();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const masters = ENTITY_KEYS.filter((k) => can(ENTITIES[k].readPermission));
  const imports = ENTITY_KEYS.filter((k) => can(ENTITIES[k].writePermission));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Informes, exportación e importación</h1>
        <p className="text-sm text-muted-foreground">Todo se descarga en Excel (o CSV) y se puede abrir con Excel, Google Sheets o LibreOffice.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map(([key, r]) => (
          <Card key={key} className="flex flex-col">
            <CardHeader>
              <CardTitle className="leading-snug">{r.label}</CardTitle>
              <CardDescription>{r.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <form action={`/api/reportes/${key}`} className="flex flex-col gap-3">
                {r.params?.includes("cliente") && (
                  <NativeSelect name="id" aria-label="Cliente" required defaultValue="">
                    <option value="" disabled>
                      Elegí el cliente…
                    </option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.businessName}
                      </option>
                    ))}
                  </NativeSelect>
                )}
                {r.params?.includes("acreedor") && (
                  <NativeSelect name="ref" aria-label="Proveedor o taller" required defaultValue="">
                    <option value="" disabled>
                      Elegí proveedor o taller…
                    </option>
                    <optgroup label="Proveedores">
                      {suppliers.map((x) => (
                        <option key={x.id} value={`proveedor:${x.id}`}>
                          {x.businessName}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Talleres">
                      {workshops.map((x) => (
                        <option key={x.id} value={`taller:${x.id}`}>
                          {x.name}
                        </option>
                      ))}
                    </optgroup>
                  </NativeSelect>
                )}
                {r.params?.includes("caja") && (
                  <NativeSelect name="id" aria-label="Caja o cuenta" required defaultValue="">
                    <option value="" disabled>
                      Elegí la caja o cuenta…
                    </option>
                    {registers.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
                {r.params?.includes("rango") && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`${key}-desde`} className="text-xs">
                        Desde
                      </Label>
                      <Input id={`${key}-desde`} type="date" name="desde" defaultValue={yearStart} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`${key}-hasta`} className="text-xs">
                        Hasta
                      </Label>
                      <Input id={`${key}-hasta`} type="date" name="hasta" defaultValue={today} />
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="w-28 shrink-0">
                    <NativeSelect name="formato" aria-label="Formato" defaultValue="xlsx">
                      <option value="xlsx">Excel</option>
                      <option value="csv">CSV</option>
                    </NativeSelect>
                  </div>
                  <Button type="submit" variant="outline" className="flex-1">
                    <FileSpreadsheet /> Descargar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {masters.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bases de datos (maestros)</CardTitle>
              <CardDescription>Se exportan en el mismo formato que se importan: se pueden editar en Excel y volver a subir.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {masters.map((k) => (
                <Button key={k} asChild variant="outline" size="sm">
                  <a href={`/api/exportar/${k}`}>
                    <FileSpreadsheet /> {ENTITIES[k].title}
                  </a>
                </Button>
              ))}
            </CardContent>
          </Card>
        )}
        {imports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Importar desde Excel o CSV</CardTitle>
              <CardDescription>Con plantilla descargable y vista previa antes de guardar.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {imports.map((k) => (
                <Button key={k} asChild variant="outline" size="sm">
                  <Link href={`${ENTITIES[k].basePath}/importar`}>
                    <Upload /> {ENTITIES[k].title}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {can(PERMISSIONS.usersManage) && (
        <Card>
          <CardHeader>
            <CardTitle>Respaldo completo</CardTitle>
            <CardDescription>
              Un Excel con todas las bases (clientes, productos con variantes, materiales, proveedores, talleres, saldos de cuentas corrientes) y los informes del año: ventas,
              compras, presupuestos, cheques y stock. Conviene descargarlo una vez por semana.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/api/respaldo">
                <DatabaseBackup /> Descargar respaldo
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
