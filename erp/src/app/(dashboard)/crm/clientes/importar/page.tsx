import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ImportPanel } from "@/components/masters/import-panel";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ENTITIES } from "@/lib/masters/definitions";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Importar clientes" };

export default async function ImportClientsPage() {
  await requirePageUser(PERMISSIONS.crmWrite);
  const def = ENTITIES.clientes;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={def.basePath} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" /> Clientes
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Importar clientes</h1>
      </div>
      <ImportPanel entity="clientes" title={def.title} basePath={def.basePath} matchHelp={def.matchHelp} />
    </div>
  );
}
