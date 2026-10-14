import type { Metadata } from "next";
import Link from "next/link";

import { ExportButtons } from "@/components/documents/export-buttons";
import { ChequeActions } from "@/components/treasury/cheque-actions";
import { FlashNotice } from "@/components/ui/flash-notice";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ChequeKind, ChequeStatus } from "@/generated/prisma/enums";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { CHEQUE_STATUS_LABELS, daysUntil } from "@/lib/treasury/cheques";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { listCheques, listRegisterOptions } from "@/server/queries/treasury.queries";

export const metadata: Metadata = { title: "Cheques" };
export const dynamic = "force-dynamic";

const VIEWS: { key: string; label: string; kind: ChequeKind; statuses: ChequeStatus[] | null }[] = [
  { key: "cartera", label: "Terceros en cartera", kind: "TERCERO", statuses: ["EN_CARTERA"] },
  { key: "terceros", label: "Terceros (todos)", kind: "TERCERO", statuses: null },
  { key: "propios", label: "Propios a debitar", kind: "PROPIO", statuses: ["EMITIDO"] },
  { key: "propios-todos", label: "Propios (todos)", kind: "PROPIO", statuses: null },
];

type Props = { searchParams: Promise<{ tipo?: string; aviso?: string }> };

const STATUS_VARIANT: Partial<Record<ChequeStatus, "success" | "destructive" | "accent" | "outline" | "default">> = {
  EN_CARTERA: "default",
  EMITIDO: "accent",
  DEPOSITADO: "success",
  COBRADO: "success",
  DEBITADO: "success",
  ENDOSADO: "outline",
  RECHAZADO: "destructive",
  ANULADO: "outline",
};

export default async function ChequesPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.cashRead);
  const { tipo, aviso } = await searchParams;
  const view = VIEWS.find((v) => v.key === tipo) ?? VIEWS[0];
  const [cheques, registers] = await Promise.all([listCheques(view.kind, view.statuses), listRegisterOptions()]);
  const canManage = hasPermission(user.permissions, PERMISSIONS.chequesManage);
  const banks = registers.filter((r) => r.kind === "BANCO");
  const cash = registers.filter((r) => r.kind !== "BANCO" && r.kind !== "BILLETERA_VIRTUAL" && (!r.requiresSession || r.hasOpenSession));
  const total = cheques.reduce((a, c) => a + c.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Vista" className="flex flex-wrap gap-1.5">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/tesoreria/cheques?tipo=${v.key}`}
              scroll={false}
              aria-current={v === view ? "page" : undefined}
              className={cn("flex h-9 items-center rounded-md border px-3 text-sm", v === view ? "border-foreground bg-secondary font-medium" : "border-input bg-card hover:bg-muted")}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <ExportButtons report="cheques" label="Exportar cheques" />
      </div>
      <FlashNotice message={aviso} />
      <p className="text-sm text-muted-foreground">
        {cheques.length} cheques · {formatMoney(total)}
      </p>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Cheque</TableHead>
              <TableHead>{view.kind === "TERCERO" ? "Librador / cliente" : "Entregado a"}</TableHead>
              <TableHead>Fecha de cobro</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>Estado</TableHead>
              {canManage && <TableHead className="pr-5">Acción</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cheques.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No hay cheques en esta vista.
                </TableCell>
              </TableRow>
            )}
            {cheques.map((c) => {
              const days = daysUntil(new Date(c.paymentDate));
              return (
                <TableRow key={c.id}>
                  <TableCell className="pl-5">
                    <span className="font-medium">{c.label}</span>
                    <span className="block text-xs text-muted-foreground">Emitido {new Date(c.issueDate).toLocaleDateString("es-AR")}</span>
                  </TableCell>
                  <TableCell>
                    {view.kind === "TERCERO" ? (
                      <>
                        {c.issuerName}
                        {c.clientName && c.clientName !== c.issuerName && <span className="block text-xs text-muted-foreground">Entregó {c.clientName}</span>}
                        {c.deliveredTo && <span className="block text-xs text-muted-foreground">Endosado a {c.deliveredTo}</span>}
                      </>
                    ) : (
                      <>
                        {c.deliveredTo ?? "—"}
                        {c.registerName && <span className="block text-xs text-muted-foreground">{c.registerName}</span>}
                      </>
                    )}
                    {c.paymentOrderId && (
                      <Link href={`/compras/pagos/${c.paymentOrderId}`} target="_blank" className="block text-xs underline underline-offset-4">
                        Orden de pago #{c.paymentOrderNumber}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(c.paymentDate).toLocaleDateString("es-AR")}
                    {(c.status === "EN_CARTERA" || c.status === "EMITIDO") && (
                      <span className={cn("block text-xs", days <= 0 ? "font-medium text-accent-strong" : "text-muted-foreground")}>
                        {days < 0 ? `vencido hace ${-days} días` : days === 0 ? "vence hoy" : `en ${days} días`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(c.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>{CHEQUE_STATUS_LABELS[c.status]}</Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="pr-5">
                      <ChequeActions chequeId={c.id} kind={c.kind} status={c.status} collectable={days <= 0} banks={banks} cashRegisters={cash} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Los cheques de terceros se reciben en ventas y cobranzas; se endosan desde la orden de pago a proveedores y talleres. Los propios y eCheqs se emiten en la orden de pago y
        recién descuentan del banco al marcarlos debitados.
      </p>
    </div>
  );
}
