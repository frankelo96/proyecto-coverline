import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CloseSessionForm } from "@/components/pos/session-forms";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getTerminalData } from "@/server/queries/treasury.queries";

export const metadata: Metadata = { title: "Cierre de turno" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ registerId: string }> };

export default async function CloseSessionPage({ params }: Props) {
  await requirePageUser(PERMISSIONS.cashSession);
  const { registerId } = await params;
  const data = await getTerminalData(registerId);
  if (!data) notFound();
  if (!data.session) redirect(`/pos/${registerId}`);
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/pos/${registerId}`} className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Volver al POS
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Cerrar turno — {data.register.branchName}</h1>
      <CloseSessionForm sessionId={data.session.id} vaults={data.vaults} />
    </div>
  );
}
