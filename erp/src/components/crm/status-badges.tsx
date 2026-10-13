import { Badge } from "@/components/ui/badge";
import type { LeadStatus, QuoteStatus } from "@/generated/prisma/enums";
import { LEAD_STATUS_LABELS, QUOTE_STATUS_LABELS } from "@/lib/masters/labels";

const QUOTE_VARIANT: Record<QuoteStatus, "default" | "accent" | "success" | "destructive" | "outline"> = {
  BORRADOR: "outline",
  ENVIADO: "default",
  ACEPTADO: "success",
  RECHAZADO: "destructive",
  VENCIDO: "accent",
};

const LEAD_VARIANT: Record<LeadStatus, "default" | "accent" | "success" | "destructive" | "outline"> = {
  NUEVO: "outline",
  CONTACTADO: "default",
  PRESUPUESTADO: "default",
  NEGOCIACION: "accent",
  GANADO: "success",
  PERDIDO: "destructive",
};

export const QuoteStatusBadge = ({ status }: { status: QuoteStatus }) => <Badge variant={QUOTE_VARIANT[status]}>{QUOTE_STATUS_LABELS[status]}</Badge>;
export const LeadStatusBadge = ({ status }: { status: LeadStatus }) => <Badge variant={LEAD_VARIANT[status]}>{LEAD_STATUS_LABELS[status]}</Badge>;
