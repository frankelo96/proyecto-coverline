import { SectionTabs } from "@/components/layout/section-tabs";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";

export default async function MastersLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requirePageUser(PERMISSIONS.mastersRead);
  const tabs = [
    { href: "/maestros/productos", label: "Productos" },
    { href: "/maestros/materiales", label: "Materias primas y avíos" },
    { href: "/maestros/proveedores", label: "Proveedores" },
    { href: "/maestros/talleres", label: "Talleres" },
    { href: "/maestros/listas-precios", label: "Listas de precios" },
    { href: "/maestros/precios", label: "Aumento de precios" },
    { href: "/maestros/stock", label: "Stock por local" },
    { href: "/maestros/etiquetas", label: "Etiquetas" },
    { href: "/maestros/tienda-web", label: "Tienda web" },
    ...(hasPermission(user.permissions, PERMISSIONS.usersManage) ? [{ href: "/maestros/usuarios", label: "Usuarios" }] : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      <SectionTabs tabs={tabs} label="Maestros" />
      {children}
    </div>
  );
}
