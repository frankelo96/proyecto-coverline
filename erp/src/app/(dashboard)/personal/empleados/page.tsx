import type { Metadata } from "next";

import { MasterList } from "@/components/masters/master-list";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Empleados" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; inactivos?: string; aviso?: string }> };

export default async function EmployeesPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.payrollRead);
  const sp = await searchParams;
  return (
    <MasterList
      entity="personal"
      q={sp.q}
      inactive={sp.inactivos === "1"}
      aviso={sp.aviso}
      canWrite={hasPermission(user.permissions, PERMISSIONS.payrollWrite)}
      description="buscá por nombre, CUIL, puesto o teléfono"
    />
  );
}
