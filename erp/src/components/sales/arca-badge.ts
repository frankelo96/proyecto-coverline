import type { ArcaStatus } from "@/generated/prisma/enums";

export const ARCA_BADGE: Record<ArcaStatus, { label: string; variant: "success" | "accent" | "destructive" | "outline" }> = {
  NO_APLICA: { label: "No fiscal", variant: "outline" },
  PENDIENTE: { label: "Pendiente CAE", variant: "accent" },
  AUTORIZADO: { label: "CAE", variant: "success" },
  RECHAZADO: { label: "Rechazado", variant: "destructive" },
};
