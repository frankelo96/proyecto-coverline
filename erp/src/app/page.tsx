import { redirect } from "next/navigation";

import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";

/** Inicio según el rol: cada usuario cae en la primera sección que puede usar. */
const HOMES = [
  { href: "/pos", permission: PERMISSIONS.posSell },
  { href: "/tesoreria", permission: PERMISSIONS.cashRead },
  { href: "/produccion/ordenes", permission: PERMISSIONS.productionRead },
  { href: "/compras", permission: PERMISSIONS.purchasesRead },
];

export default async function HomePage() {
  const user = await requirePageUser();
  redirect(HOMES.find((h) => hasPermission(user.permissions, h.permission))?.href ?? "/sin-acceso");
}
