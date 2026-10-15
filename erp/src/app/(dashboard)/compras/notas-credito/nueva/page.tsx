import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CreditNoteForm } from "@/components/purchasing/credit-note-form";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getMerchandiseFormData } from "@/server/queries/purchasing.queries";

export const metadata: Metadata = { title: "Nota de crédito de proveedor" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ proveedor?: string }> };

export default async function NewCreditNotePage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.purchasesWrite);
  const { proveedor } = await searchParams;
  const data = await getMerchandiseFormData();
  const supplier = data.suppliers.find((s) => s.id === proveedor) ?? null;
  const payables = supplier
    ? await db.accountPayable.findMany({ where: { supplierId: supplier.id, status: { in: ["PENDIENTE", "PARCIAL"] } }, orderBy: { dueDate: "asc" } })
    : [];
  return (
    <div className="flex flex-col gap-4">
      <Link href="/compras" className="inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" /> Compras
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Nota de crédito de proveedor{supplier ? ` — ${supplier.name}` : ""}</h1>
        <p className="text-sm text-muted-foreground">Devolución de mercadería o bonificación. Baja la deuda con el proveedor; lo que sobra queda como saldo a favor.</p>
      </div>
      <form action="/compras/notas-credito/nueva" className="flex max-w-lg gap-2">
        <NativeSelect name="proveedor" defaultValue={supplier?.id ?? ""} aria-label="Proveedor">
          <option value="" disabled>
            Elegí el proveedor…
          </option>
          {data.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Elegir
        </Button>
      </form>
      {supplier && (
        <CreditNoteForm
          key={supplier.id}
          data={data}
          supplierId={supplier.id}
          payables={payables.map((p) => ({ id: p.id, description: p.description, balance: p.balance.toNumber(), dueDate: p.dueDate.toISOString() }))}
        />
      )}
    </div>
  );
}
