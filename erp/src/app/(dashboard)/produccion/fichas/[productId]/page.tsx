import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CostSheetEditor } from "@/components/production/cost-sheet-editor";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
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
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/produccion/fichas"
        className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> Fichas técnicas
      </Link>
      <CostSheetEditor key={data.product.id} data={data} canEdit={canEdit} />
    </div>
  );
}
