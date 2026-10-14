import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EntityForm } from "@/components/masters/entity-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ENTITIES, formFields } from "@/lib/masters/definitions";
import { requirePageUser } from "@/server/auth/session";
import { ADAPTERS } from "@/server/masters/adapters";

export const metadata: Metadata = { title: "Nuevo empleado" };
export const dynamic = "force-dynamic";

export default async function NewEmployeePage() {
  await requirePageUser(PERMISSIONS.payrollWrite);
  const def = ENTITIES.personal;
  const refs = await ADAPTERS.personal.refs();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={def.basePath} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> Empleados
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Nuevo empleado</h1>
      </div>
      <EntityForm entity="personal" id={null} fields={formFields(def)} initial={null} refs={refs} basePath={def.basePath} />
    </div>
  );
}
