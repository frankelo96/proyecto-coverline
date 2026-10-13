import { SectionTabs } from "@/components/layout/section-tabs";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";

export default async function PurchasesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requirePageUser();
  const tabs = [
    { href: "/compras", label: "Comprobantes de compra", permission: PERMISSIONS.purchasesRead },
    { href: "/compras/cuentas", label: "Cuentas a pagar", permission: PERMISSIONS.payablesRead },
  ].filter((t) => hasPermission(user.permissions, t.permission));
  return (
    <div className="flex flex-col gap-6">
      <SectionTabs tabs={tabs.map(({ href, label }) => ({ href, label }))} label="Compras" />
      {children}
    </div>
  );
}
