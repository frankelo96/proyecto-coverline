import { SectionTabs } from "@/components/layout/section-tabs";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";

export default async function ReportsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requirePageUser(PERMISSIONS.reportsRead);
  const can = (p: string) => hasPermission(user.permissions, p);
  const tabs = [
    ...(can(PERMISSIONS.cashRead) ? [{ href: "/informes/panel", label: "Panel" }] : []),
    ...(can(PERMISSIONS.cashRead) ? [{ href: "/informes/resultados", label: "Estado de resultados" }] : []),
    ...(can(PERMISSIONS.cashRead) ? [{ href: "/informes/iva", label: "Libro IVA" }] : []),
    ...(can(PERMISSIONS.usersManage) ? [{ href: "/informes/auditoria", label: "Auditoría" }] : []),
    { href: "/informes", label: "Exportar e importar" },
  ];
  return (
    <div className="flex flex-col gap-6">
      {tabs.length > 1 && <SectionTabs tabs={tabs} label="Informes" />}
      {children}
    </div>
  );
}
