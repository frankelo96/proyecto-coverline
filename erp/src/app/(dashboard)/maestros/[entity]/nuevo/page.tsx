import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EntityForm } from "@/components/masters/entity-form";
import { ENTITIES, formFields, isMasterKey } from "@/lib/masters/definitions";
import { requirePageUser } from "@/server/auth/session";
import { ADAPTERS } from "@/server/masters/adapters";

export const metadata: Metadata = { title: "Alta" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ entity: string }> };

export default async function NewMasterPage({ params }: Props) {
  const { entity } = await params;
  if (!isMasterKey(entity) || entity === "clientes" || entity === "personal") notFound();
  const def = ENTITIES[entity];
  await requirePageUser(def.writePermission);
  const refs = await ADAPTERS[entity].refs();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={def.basePath} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> {def.title}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{def.newLabel}</h1>
        {entity === "productos" && <p className="text-sm text-muted-foreground">Después de crearlo vas a poder cargar los talles, el stock y la ficha técnica.</p>}
      </div>
      <EntityForm entity={entity} id={null} fields={formFields(def)} initial={null} refs={refs} basePath={def.basePath} />
    </div>
  );
}
