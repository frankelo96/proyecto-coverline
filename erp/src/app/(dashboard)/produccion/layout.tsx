import { SectionTabs } from "@/components/layout/section-tabs";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";

export default async function ProductionLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requirePageUser();
  const tabs = [
    { href: "/produccion/ordenes", label: "Órdenes", permission: PERMISSIONS.productionRead },
    { href: "/produccion/talleres", label: "Talleres", permission: PERMISSIONS.workshopsRead },
    { href: "/produccion/fichas", label: "Fichas técnicas", permission: PERMISSIONS.productionRead },
  ].filter((t) => hasPermission(user.permissions, t.permission));
  return (
    <div className="flex flex-col gap-6">
      <SectionTabs tabs={tabs.map(({ href, label }) => ({ href, label }))} label="Producción" />
      {children}
    </div>
  );
}
