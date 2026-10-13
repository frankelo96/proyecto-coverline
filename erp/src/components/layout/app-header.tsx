"use client";

import { LogOut, Shirt } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth.actions";

export interface NavItem {
  href: string;
  label: string;
}

export function AppHeader({ items, userName, roleName }: { items: NavItem[]; userName: string; roleName: string }) {
  const pathname = usePathname();
  // Activo: el ítem con el prefijo más largo que coincide (/compras vs /compras/cuentas).
  const activeHref = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <header className="bg-ink text-ink-foreground">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
          <Shirt aria-hidden="true" className="size-6 text-accent" />
          <span className="text-lg font-bold tracking-wide">COVERLINE</span>
          <span className="hidden text-sm text-ink-muted sm:inline">ERP</span>
        </Link>
        <nav aria-label="Módulos" className="order-3 flex w-full flex-wrap gap-1 text-sm lg:order-none lg:w-auto">
          {items.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "border-b-2 px-3 py-2.5 transition-colors",
                  active ? "border-accent text-ink-foreground" : "border-transparent text-ink-muted hover:text-ink-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-right leading-tight sm:block">
            <span className="block">{userName}</span>
            <span className="block text-xs text-ink-muted">{roleName}</span>
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex size-10 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-white/10 hover:text-ink-foreground"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut aria-hidden="true" className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
