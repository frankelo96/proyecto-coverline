"use client";

import { Bell, KeyRound, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/documents/brand-logo";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth.actions";
import type { AlertItem } from "@/server/queries/alerts.queries";

export interface NavItem {
  href: string;
  label: string;
}

/** Campana con los avisos automáticos del usuario (se recalculan en cada pantalla). */
function AlertsBell({ alerts }: { alerts: AlertItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const urgent = alerts.some((a) => a.level === "urgente");
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={alerts.length ? `Avisos: ${alerts.length}` : "Avisos: nada pendiente"}
        title="Avisos"
        className="relative flex size-10 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-white/10 hover:text-ink-foreground"
      >
        <Bell aria-hidden="true" className="size-5" />
        {alerts.length > 0 && (
          <span className={cn("absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white", urgent ? "bg-destructive" : "bg-accent")}>
            {alerts.length}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-2 top-14 z-50 rounded-lg border bg-card p-2 text-foreground shadow-lg sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[380px]">
          <p className="px-2 pt-1 pb-2 text-sm font-semibold">Avisos</p>
          {alerts.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-muted-foreground">Nada pendiente.</p>
          ) : (
            <ul className="flex flex-col">
              {alerts.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", a.level === "urgente" ? "bg-destructive" : "bg-accent")} aria-hidden="true" />
                    <span>
                      {a.text}
                      <span className="sr-only">{a.level === "urgente" ? " (urgente)" : ""}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function AppHeader({ items, userName, roleName, alerts }: { items: NavItem[]; userName: string; roleName: string; alerts: AlertItem[] }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  // Activo: el ítem con el prefijo más largo que coincide (/compras vs /compras/cuentas).
  const activeHref = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <header className="bg-ink text-ink-foreground print:hidden">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-8 lg:py-3">
        <Link href="/" className="flex items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
          <BrandLogo variant="corto" tone="blanco" className="h-6 w-auto" priority />
          <span className="hidden text-sm text-ink-muted sm:inline">ERP</span>
        </Link>
        {/* Celular y tablet: el menú se abre con el botón; en pantallas grandes queda siempre visible. */}
        <nav
          aria-label="Módulos"
          className={cn(
            "order-3 w-full flex-col gap-1 text-base lg:order-none lg:flex lg:w-auto lg:flex-row lg:flex-wrap lg:text-sm",
            menuOpen ? "flex pb-2" : "hidden",
          )}
        >
          {items.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-3 transition-colors lg:rounded-none lg:border-b-2 lg:py-2.5",
                  active ? "bg-white/10 text-ink-foreground lg:border-accent lg:bg-transparent" : "text-ink-muted hover:text-ink-foreground lg:border-transparent",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href="/cambiar-clave" className="flex items-center gap-2 rounded-md border-t border-white/10 px-3 py-3 text-ink-muted hover:text-ink-foreground sm:hidden">
            <KeyRound aria-hidden="true" className="size-4" /> {userName} · Cambiar mi contraseña
          </Link>
        </nav>
        <div className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/cambiar-clave" title="Cambiar mi contraseña" className="hidden rounded-md px-1 text-right leading-tight hover:bg-white/10 sm:block">
            <span className="block">{userName}</span>
            <span className="block text-xs text-ink-muted">{roleName}</span>
          </Link>
          <AlertsBell alerts={alerts} />
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
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            className="flex size-11 items-center justify-center rounded-md text-ink-foreground hover:bg-white/10 lg:hidden"
          >
            {menuOpen ? <X aria-hidden="true" className="size-6" /> : <Menu aria-hidden="true" className="size-6" />}
          </button>
        </div>
      </div>
    </header>
  );
}
