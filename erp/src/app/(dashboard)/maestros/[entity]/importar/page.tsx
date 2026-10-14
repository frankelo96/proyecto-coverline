import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ImportPanel } from "@/components/masters/import-panel";
import { ENTITIES, isMasterKey } from "@/lib/masters/definitions";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Importar" };

type Props = { params: Promise<{ entity: string }> };

export default async function ImportMasterPage({ params }: Props) {
  const { entity } = await params;
  if (!isMasterKey(entity) || entity === "clientes" || entity === "personal") notFound();
  const def = ENTITIES[entity];
  await requirePageUser(def.writePermission);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={def.basePath} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> {def.title}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Importar {def.title.toLowerCase()}</h1>
      </div>
      <ImportPanel entity={entity} title={def.title} basePath={def.basePath} matchHelp={def.matchHelp} />
    </div>
  );
}
