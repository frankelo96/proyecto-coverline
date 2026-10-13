import type { Metadata } from "next";

import { MasterList } from "@/components/masters/master-list";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; inactivos?: string; aviso?: string }> };

export default async function ClientsPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.crmRead);
  const sp = await searchParams;
  return (
    <MasterList
      entity="clientes"
      q={sp.q}
      inactive={sp.inactivos === "1"}
      aviso={sp.aviso}
      canWrite={hasPermission(user.permissions, PERMISSIONS.crmWrite)}
      description="buscá por nombre, CUIT/DNI, teléfono, localidad o etiqueta"
    />
  );
}
