import type { Metadata } from "next";

import { Reconciliation } from "@/components/treasury/reconciliation";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Conciliación" };
export const dynamic = "force-dynamic";

export default async function ReconciliationPage() {
  await requirePageUser(PERMISSIONS.cashManage);
  const [registers, pending] = await Promise.all([
    db.cashRegister.findMany({ where: { active: true, kind: { in: ["BANCO", "BILLETERA_VIRTUAL"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.cashMovement.groupBy({ by: ["cashRegisterId"], where: { reconciledAt: null, cashRegister: { kind: { in: ["BANCO", "BILLETERA_VIRTUAL"] } } }, _count: true }),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Compará el extracto del banco o de Mercado Pago con lo registrado en el sistema. Así detectás comisiones, impuestos y cobros que faltan cargar.
        {pending.length > 0 && ` Movimientos sin conciliar: ${pending.map((p) => `${registers.find((r) => r.id === p.cashRegisterId)?.name ?? ""} ${p._count}`).join(" · ")}.`}
      </p>
      {registers.length === 0 ? <p className="text-sm text-muted-foreground">No hay cuentas bancarias ni billeteras virtuales activas.</p> : <Reconciliation registers={registers} />}
    </div>
  );
}
