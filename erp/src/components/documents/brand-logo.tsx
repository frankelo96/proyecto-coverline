import Image from "next/image";

import { cn } from "@/lib/utils";

/** Logo de Coverline. `blanco` para fondos oscuros (encabezado del sistema). */
export function BrandLogo({ variant = "completo", tone = "negro", className, priority }: { variant?: "completo" | "corto"; tone?: "negro" | "blanco"; className?: string; priority?: boolean }) {
  const base = variant === "completo" ? "coverline-uniformes" : "coverline";
  const size = variant === "completo" ? { width: 568, height: 162 } : { width: 451, height: 93 };
  return (
    <Image
      src={`/brand/${base}${tone === "blanco" ? "-blanco" : ""}.png`}
      alt="Coverline Uniformes"
      {...size}
      priority={priority}
      unoptimized
      className={cn("h-auto w-auto object-contain", className)}
    />
  );
}
