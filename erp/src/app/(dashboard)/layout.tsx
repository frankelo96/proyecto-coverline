import { AppHeader, type NavItem } from "@/components/layout/app-header";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";

/** Rutas habilitadas con el permiso que las muestra. Cada módulo nuevo se suma acá. */
const NAV: (NavItem & { permission: string; hideIf?: string })[] = [
  { href: "/pos", label: "POS", permission: PERMISSIONS.posSell },
  { href: "/ventas", label: "Ventas", permission: PERMISSIONS.posSell },
  { href: "/crm", label: "CRM", permission: PERMISSIONS.crmRead },
  { href: "/tesoreria", label: "Tesorería", permission: PERMISSIONS.cashRead },
  { href: "/tesoreria/cobranzas", label: "Cobranzas", permission: PERMISSIONS.receivablesCollect, hideIf: PERMISSIONS.cashRead },
  { href: "/produccion", label: "Producción", permission: PERMISSIONS.productionRead },
  { href: "/compras", label: "Compras", permission: PERMISSIONS.purchasesRead },
  { href: "/compras/cuentas", label: "Cuentas a pagar", permission: PERMISSIONS.payablesRead, hideIf: PERMISSIONS.purchasesRead },
  { href: "/maestros", label: "Maestros", permission: PERMISSIONS.mastersRead },
];

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requirePageUser();
  const items = NAV.filter((n) => hasPermission(user.permissions, n.permission) && !(n.hideIf && hasPermission(user.permissions, n.hideIf))).map(({ href, label }) => ({
    href,
    label,
  }));
  return (
    <div className="min-h-screen">
      <AppHeader items={items} userName={user.name} roleName={user.roleName} />
      <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-12 sm:px-8">{children}</main>
    </div>
  );
}
