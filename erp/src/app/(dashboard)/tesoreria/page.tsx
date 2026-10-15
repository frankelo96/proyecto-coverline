import { Banknote, Building2, Landmark, Store, Vault, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ManualMovementForm, TransferForm } from "@/components/treasury/treasury-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CashRegisterKind } from "@/generated/prisma/enums";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/format";
import { REGISTER_KIND_LABELS } from "@/lib/treasury/cash";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getChequesSummary, listRegistersOverview } from "@/server/queries/treasury.queries";

export const metadata: Metadata = { title: "Tesorería" };
export const dynamic = "force-dynamic";

const ICONS: Record<CashRegisterKind, typeof Banknote> = {
  CAJA_DIARIA: Store,
  CAJA_ADMINISTRATIVA: Building2,
  CAJA_RESGUARDO: Vault,
  BILLETERA_VIRTUAL: Wallet,
  BANCO: Landmark,
};

export default async function TreasuryPage() {
  const user = await requirePageUser(PERMISSIONS.cashRead);
  const [registers, cheques, categories] = await Promise.all([
    listRegistersOverview(),
    getChequesSummary(),
    db.expenseCategory.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const canManage = hasPermission(user.permissions, PERMISSIONS.cashManage);
  const options = registers.map((r) => ({ id: r.id, name: r.name, usable: !r.requiresSession || r.openSession !== null }));
  const cash = registers.filter((r) => r.kind !== "BANCO" && r.kind !== "BILLETERA_VIRTUAL").reduce((a, r) => a + r.balance, 0);
  const banks = registers.filter((r) => r.kind === "BANCO" || r.kind === "BILLETERA_VIRTUAL").reduce((a, r) => a + r.balance, 0);

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-ink p-4 text-ink-foreground">
          <dt className="text-xs text-ink-muted">Efectivo (locales + caja negra)</dt>
          <dd className="font-mono text-2xl font-semibold tabular-nums">{formatMoney(cash, { round: true })}</dd>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Bancos y billeteras</dt>
          <dd className="font-mono text-2xl font-semibold tabular-nums">{formatMoney(banks, { round: true })}</dd>
        </div>
        <Link href="/tesoreria/cheques" className="rounded-lg border bg-card p-4 hover:border-foreground/40">
          <dt className="text-xs text-muted-foreground">Cheques de terceros en cartera ({cheques.inPortfolio.count})</dt>
          <dd className="font-mono text-2xl font-semibold tabular-nums">{formatMoney(cheques.inPortfolio.amount, { round: true })}</dd>
        </Link>
        <Link href="/tesoreria/cheques?tipo=propios" className="rounded-lg border bg-card p-4 hover:border-foreground/40">
          <dt className="text-xs text-muted-foreground">Cheques propios a debitar ({cheques.ownPending.count})</dt>
          <dd className="font-mono text-2xl font-semibold tabular-nums">{formatMoney(cheques.ownPending.amount, { round: true })}</dd>
          {cheques.ownNext7Days.count > 0 && <dd className="text-xs font-medium text-accent-strong">{formatMoney(cheques.ownNext7Days.amount, { round: true })} en los próximos 7 días</dd>}
        </Link>
      </dl>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {registers.map((r) => {
          const Icon = ICONS[r.kind];
          return (
            <Link key={r.id} href={`/tesoreria/cajas/${r.id}`} className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Card className={cn("h-full transition-colors hover:border-foreground/40", r.kind === "CAJA_RESGUARDO" && "border-ink")}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
                      <div>
                        <p className="font-semibold">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{REGISTER_KIND_LABELS[r.kind]}</p>
                      </div>
                    </div>
                    {r.requiresSession && <Badge variant={r.openSession ? "success" : "outline"}>{r.openSession ? "Turno abierto" : "Cerrada"}</Badge>}
                  </div>
                  <p className={cn("font-mono text-2xl font-semibold tabular-nums", r.balance < 0 && "text-destructive")}>{formatMoney(r.balance)}</p>
                  {r.openSession && <p className="text-xs text-muted-foreground">Turno de {r.openSession.openedBy}</p>}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {canManage && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TransferForm registers={options} />
          <ManualMovementForm registers={options} categories={categories} />
        </div>
      )}
    </div>
  );
}
