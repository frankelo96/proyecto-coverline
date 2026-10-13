"use client";

import { Shirt } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Rutas habilitadas. Cada módulo nuevo (POS, CRM, Compras, Reportes) se suma acá al implementarse. */
const NAV_ITEMS = [{ href: "/produccion/fichas", label: "Fichas técnicas" }] as const;

export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="bg-ink text-ink-foreground">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
          <Shirt aria-hidden="true" className="size-6 text-accent" />
          <span className="text-lg font-bold tracking-wide">COVERLINE</span>
          <span className="hidden text-sm text-ink-muted sm:inline">ERP · Producción</span>
        </Link>
        <nav aria-label="Módulos" className="flex flex-wrap gap-1 text-sm">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
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
      </div>
    </header>
  );
}
