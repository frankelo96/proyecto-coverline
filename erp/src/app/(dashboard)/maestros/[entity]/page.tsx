import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { MasterList } from "@/components/masters/master-list";
import { hasPermission } from "@/lib/auth/permissions";
import { ENTITIES, isMasterKey } from "@/lib/masters/definitions";
import { requirePageUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ entity: string }>; searchParams: Promise<{ q?: string; inactivos?: string; aviso?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { entity } = await params;
  return { title: isMasterKey(entity) ? ENTITIES[entity].title : "Maestros" };
}

export default async function MasterListPage({ params, searchParams }: Props) {
  const { entity } = await params;
  if (entity === "clientes") redirect("/crm/clientes");
  if (entity === "personal") redirect("/personal/empleados");
  if (!isMasterKey(entity)) notFound();
  const def = ENTITIES[entity];
  const user = await requirePageUser(def.readPermission);
  const sp = await searchParams;
  return <MasterList entity={entity} q={sp.q} inactive={sp.inactivos === "1"} aviso={sp.aviso} canWrite={hasPermission(user.permissions, def.writePermission)} />;
}
