import { SectionTabs } from "@/components/layout/section-tabs";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";

const TABS = [
  { href: "/crm/clientes", label: "Clientes" },
  { href: "/crm/oportunidades", label: "Oportunidades" },
  { href: "/crm/presupuestos", label: "Presupuestos" },
  { href: "/crm/campanas", label: "Campañas" },
];

export default async function CrmLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePageUser(PERMISSIONS.crmRead);
  return (
    <div className="flex flex-col gap-6">
      <SectionTabs tabs={TABS} label="CRM" />
      {children}
    </div>
  );
}
