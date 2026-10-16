import { ChevronLeft, Printer, Image as ImageIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CostSheetEditor } from "@/components/production/cost-sheet-editor";
import { MaterialRulesEditor, type RuleLine } from "@/components/production/material-rules-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { compareSizes } from "@/lib/catalog/variants";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCostSheetEditorData } from "@/server/queries/production.queries";
import { CostingServiceError } from "@/server/services/costing.service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ productId: string }> };

async function loadData(productId: string) {
  try {
    return await getCostSheetEditorData(productId);
  } catch (error) {
    if (error instanceof CostingServiceError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productId } = await params;
  const data = await loadData(productId);
  return { title: `Escandallo ${data.product.sku}` };
}

export default async function CostSheetPage({ params }: Props) {
  const user = await requirePageUser(PERMISSIONS.productionRead);
  const { productId } = await params;
  const data = await loadData(productId);
  const canEdit = hasPermission(user.permissions, PERMISSIONS.productionCostWrite);
  const [bom, rules, materials, variants] = await Promise.all([
    db.productBOM.findMany({ where: { productId }, include: { rawMaterial: true }, orderBy: { sortOrder: "asc" } }),
    db.productMaterialRule.findMany({ where: { productId } }),
    db.rawMaterial.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, type: true } }),
    db.productVariant.findMany({ where: { productId, active: true }, select: { size: true, color: true, fabric: true } }),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/produccion/fichas"
          className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-4" /> Fichas técnicas
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/produccion/fichas/${productId}/imprimir?costos=0`} target="_blank" rel="noreferrer">
              <Printer /> Ficha de producto (para taller)
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/produccion/fichas/${productId}/imprimir`} target="_blank" rel="noreferrer">
              <Printer /> Escandallo con costos
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/produccion/fichas/${productId}/descriptiva`} target="_blank" rel="noreferrer">
              <ImageIcon /> Ficha descriptiva con fotos
            </a>
          </Button>
        </div>
      </div>
      <CostSheetEditor key={data.product.id} data={data} canEdit={canEdit} />
      <Card>
        <CardHeader>
          <CardTitle>Consumo por talle y material según color o tela</CardTitle>
          <CardDescription>
            El costo de la ficha usa el material y el consumo de referencia. Al lanzar una orden de producción se descuenta lo que corresponde a cada talle, color y tela
            (por ejemplo, la tela bordó para las prendas bordó y más metros para los talles grandes).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MaterialRulesEditor
            key={rules.map((r) => r.updatedAt.getTime()).join(",")}
            productId={productId}
            canEdit={hasPermission(user.permissions, PERMISSIONS.productionWrite)}
            lines={bom.map((b) => {
              const rule = rules.find((r) => r.rawMaterialId === b.rawMaterialId);
              return {
                rawMaterialId: b.rawMaterialId,
                name: b.rawMaterial.name,
                type: b.rawMaterial.type,
                uom: b.rawMaterial.uom,
                quantity: b.quantity.toNumber(),
                sizeQuantities: (rule?.sizeQuantities as Record<string, number> | null) ?? {},
                alternatives: (rule?.alternatives as RuleLine["alternatives"] | null) ?? [],
              };
            })}
            materials={materials}
            colors={[...new Set(variants.map((v) => v.color).filter((c): c is string => !!c))]}
            fabrics={[...new Set(variants.map((v) => v.fabric).filter((f): f is string => !!f))]}
            sizes={[...new Set(variants.sort((a, b) => compareSizes(a.size, b.size)).map((v) => v.size))]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
