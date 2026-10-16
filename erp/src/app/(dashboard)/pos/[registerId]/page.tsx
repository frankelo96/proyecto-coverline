import { ChevronLeft, LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PosTerminal } from "@/components/pos/pos-terminal";
import { DrawerActions, OpenSessionForm } from "@/components/pos/session-forms";
import { Button } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/flash-notice";
import { formatMoney } from "@/lib/format";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getTerminalData } from "@/server/queries/treasury.queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ registerId: string }>; searchParams: Promise<{ aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { registerId } = await params;
  const data = await getTerminalData(registerId);
  return { title: data ? `POS ${data.register.branchName}` : "POS" };
}

export default async function TerminalPage({ params, searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.posSell);
  const { registerId } = await params;
  const data = await getTerminalData(registerId);
  if (!data) notFound();
  if (user.branchId && data.register.branchId !== user.branchId) redirect("/pos");
  const canSession = hasPermission(user.permissions, PERMISSIONS.cashSession);
  const { aviso } = await searchParams;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Link href="/pos" className="inline-flex min-h-8 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft aria-hidden="true" className="size-4" /> Cajas
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{data.session ? "Nueva venta · " : ""}{data.register.branchName}</h1>
          {data.session && (
            <p className="text-sm text-muted-foreground">
              {data.register.name} · turno de {data.session.openedBy} desde las{" "}
              {new Date(data.session.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Lo único de caja que ve el puesto de atención al público: el total del día del local. */}
          <div className="flex gap-4 rounded-lg border bg-card px-4 py-2 text-sm" aria-label="Resumen del día">
            <div>
              <p className="text-xs text-muted-foreground">Vendido hoy ({data.today.salesCount})</p>
              <p className="font-mono font-semibold tabular-nums">{formatMoney(data.today.sold)}</p>
            </div>
            <div className="border-l pl-4">
              <p className="text-xs text-muted-foreground">Gastos del cajón hoy</p>
              <p className="font-mono font-semibold tabular-nums">{formatMoney(data.today.spent)}</p>
            </div>
          </div>
        {data.session && canSession && (
          <Button asChild variant="outline">
            <Link href={`/pos/${data.register.id}/cierre`}>
              <LockKeyhole /> Cerrar turno
            </Link>
          </Button>
        )}
        </div>
      </div>

      {!data.session ? (
        canSession ? (
          <OpenSessionForm registerId={data.register.id} registerName={data.register.name} />
        ) : (
          <p className="text-muted-foreground">La caja está cerrada. Pedile a un encargado que abra el turno.</p>
        )
      ) : (
        <>
          <FlashNotice message={aviso} />
          {canSession && <DrawerActions registerId={data.register.id} vaults={data.vaults} />}
          <PosTerminal data={data} canDiscount={hasPermission(user.permissions, PERMISSIONS.posDiscount)} />
        </>
      )}
    </div>
  );
}
