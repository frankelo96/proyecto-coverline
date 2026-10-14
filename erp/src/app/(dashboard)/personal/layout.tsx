import { SectionTabs } from "@/components/layout/section-tabs";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";

export default async function PayrollLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePageUser(PERMISSIONS.payrollRead);
  const tabs = [
    { href: "/personal", label: "Sueldos del mes" },
    { href: "/personal/pagar", label: "Registrar pago" },
    { href: "/personal/empleados", label: "Empleados" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <SectionTabs tabs={tabs} label="Personal" />
      {children}
    </div>
  );
}
