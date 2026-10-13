"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface SectionTab {
  href: string;
  label: string;
}

/** Pestañas de sección: activa la de prefijo más largo que coincide con la ruta. */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const pathname = usePathname();
  const active = tabs.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5 print:hidden">
      {tabs.map((t) => (
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
