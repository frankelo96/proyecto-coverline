import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { WorkshopInvoiceForm } from "@/components/purchasing/workshop-invoice-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getWorkshopInvoiceFormData } from "@/server/queries/purchasing.queries";

export const metadata: Metadata = { title: "Factura de taller" };
export const dynamic = "force-dynamic";

export default async function NewWorkshopInvoicePage() {
  await requirePageUser(PERMISSIONS.purchasesWrite);
  const data = await getWorkshopInvoiceFormData();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/compras" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Compras
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Factura de taller</h1>
        <p className="text-sm text-muted-foreground">Servicios de confección y personalización (bordado, estampado, sublimación) facturados sobre las recepciones con remito.</p>
      </div>
      <WorkshopInvoiceForm data={data} />
    </div>
  );
}
