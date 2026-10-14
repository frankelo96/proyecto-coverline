import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActiveToggle } from "@/components/masters/active-toggle";
import { EntityForm } from "@/components/masters/entity-form";
import { FlashNotice } from "@/components/ui/flash-notice";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ENTITIES, formFields } from "@/lib/masters/definitions";
import { requirePageUser } from "@/server/auth/session";
import { ADAPTERS } from "@/server/masters/adapters";

export const metadata: Metadata = { title: "Editar empleado" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> };

export default async function EditEmployeePage({ params, searchParams }: Props) {
  await requirePageUser(PERMISSIONS.payrollWrite);
  const { id } = await params;
  const { aviso } = await searchParams;
  const [values, refs] = await Promise.all([ADAPTERS.personal.get(id), ADAPTERS.personal.refs()]);
  if (!values) notFound();
  const def = ENTITIES.personal;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href={`${def.basePath}/${id}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft aria-hidden="true" className="size-4" /> {String(values.name)}
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Editar empleado</h1>
        </div>
        <ActiveToggle entity="personal" id={id} active={values.active !== false} />
      </div>
      <FlashNotice message={aviso} />
      <EntityForm entity="personal" id={id} fields={formFields(def)} initial={values} refs={refs} basePath={def.basePath} />
    </div>
  );
}
