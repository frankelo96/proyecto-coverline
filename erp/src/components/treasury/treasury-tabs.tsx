"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/tesoreria", label: "Cajas y cuentas" },
  { href: "/tesoreria/cheques", label: "Cheques" },
  { href: "/tesoreria/cobranzas", label: "Cobranzas" },
  { href: "/tesoreria/gastos", label: "Gastos" },
  { href: "/tesoreria/flujo", label: "Flujo de fondos" },
];

export function TreasuryTabs() {
  const pathname = usePathname();
  const active = TABS.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Tesorería" className="flex flex-wrap gap-1.5">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={cn(
            "flex h-10 items-center rounded-md border px-3 text-sm",
            active === t.href ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
