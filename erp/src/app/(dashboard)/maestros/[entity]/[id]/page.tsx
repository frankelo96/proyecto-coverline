import { ChevronLeft, Receipt, Ruler } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActiveToggle } from "@/components/masters/active-toggle";
import { EntityForm } from "@/components/masters/entity-form";
import { VariantsEditor } from "@/components/masters/variants-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/flash-notice";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { ENTITIES, formFields, isEntityKey } from "@/lib/masters/definitions";
import { formatMoney } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { ADAPTERS } from "@/server/masters/adapters";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ entity: string; id: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { entity, id } = await params;
  if (!isEntityKey(entity)) return {};
  const v = await ADAPTERS[entity].get(id);
  return { title: v ? String(v.name ?? v.businessName ?? "Editar") : "Editar" };
}

export default async function EditMasterPage({ params, searchParams }: Props) {
  const { entity, id } = await params;
  if (!isEntityKey(entity) || entity === "clientes") notFound();
  const def = ENTITIES[entity];
  const user = await requirePageUser(def.readPermission);
  const adapter = ADAPTERS[entity];
  const [values, refs] = await Promise.all([adapter.get(id), adapter.refs()]);
  if (!values) notFound();
  const canWrite = hasPermission(user.permissions, def.writePermission);
  const { aviso } = await searchParams;
  const title = String(values.name ?? values.businessName);

  const variants =
    entity === "productos" ? await db.productVariant.findMany({ where: { productId: id }, orderBy: [{ color: "asc" }, { createdAt: "asc" }] }) : [];
  const product = entity === "productos" ? await db.product.findUnique({ where: { id }, select: { currentCost: true, sourcing: true } }) : null;
  const creditorType = entity === "proveedores" ? "proveedor" : entity === "talleres" ? "taller" : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href={def.basePath} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft aria-hidden="true" className="size-4" /> {def.title}
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight">
            {title}
            {values.active === false && <Badge variant="outline">Inactivo</Badge>}
          </h1>
          {product && (
            <p className="text-sm text-muted-foreground">
              Costo actual {formatMoney(product.currentCost.toNumber())}
              {product.sourcing === "FABRICADO" ? " (según ficha técnica)" : " (último precio de compra)"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {entity === "productos" && hasPermission(user.permissions, PERMISSIONS.productionRead) && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/produccion/fichas/${id}`}>
                <Ruler /> Ficha técnica y costo
              </Link>
            </Button>
          )}
          {creditorType && hasPermission(user.permissions, PERMISSIONS.payablesRead) && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/compras/cuentas/${creditorType}/${id}`}>
                <Receipt /> Cuenta corriente
              </Link>
            </Button>
          )}
          {canWrite && <ActiveToggle entity={entity} id={id} active={values.active !== false} />}
        </div>
      </div>
      <FlashNotice message={aviso} />
      <EntityForm entity={entity} id={id} fields={formFields(def)} initial={values} refs={refs} basePath={def.basePath} after="stay" readOnly={!canWrite} />
      {entity === "productos" && (
        <VariantsEditor
          key={variants.map((v) => `${v.id}${v.updatedAt.getTime()}`).join("|")}
          productId={id}
          canWrite={canWrite}
          initial={variants.map((v) => ({
            id: v.id,
            size: v.size,
            color: v.color ?? "",
            sku: v.sku,
            barcode: v.barcode ?? "",
            stockQty: String(v.stockQty.toNumber()).replace(".", ","),
            priceAdjustmentPct: String(v.priceAdjustmentPct.toNumber()).replace(".", ","),
            active: v.active,
          }))}
        />
      )}
    </div>
  );
}
