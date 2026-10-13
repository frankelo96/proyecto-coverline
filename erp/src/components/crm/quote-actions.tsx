"use client";

import { Check, Copy, FileText, Loader2, Mail, MessageCircle, Pencil, Send, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";
import type { QuoteStatus } from "@/generated/prisma/enums";
import { useServerAction } from "@/hooks/use-server-action";
import { isEditableQuote, QUOTE_TRANSITIONS } from "@/lib/crm/quote-math";
import { duplicateQuoteAction, setQuoteStatusAction } from "@/server/actions/crm.actions";

interface Props {
  id: string;
  status: QuoteStatus;
  canWrite: boolean;
  whatsapp: string | null;
  email: string | null;
  message: string;
  subject: string;
}

export function QuoteActions({ id, status, canWrite, whatsapp, email, message, subject }: Props) {
  const router = useRouter();
  const { pending, status: msg, execute } = useServerAction();
  const allowed = QUOTE_TRANSITIONS[status];
  const move = (to: QuoteStatus) => execute(() => setQuoteStatusAction({ id, status: to }));
  // Al compartirlo, un borrador pasa a "Enviado".
  const markSent = () => canWrite && status === "BORRADOR" && move("ENVIADO");

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={`/crm/presupuestos/${id}/imprimir`} target="_blank" rel="noreferrer">
            <FileText /> PDF / Imprimir
          </a>
        </Button>
        {whatsapp && (
          <Button asChild variant="outline" size="sm">
            <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer noopener" onClick={markSent}>
              <MessageCircle /> WhatsApp
            </a>
          </Button>
        )}
        {email && (
          <Button asChild variant="outline" size="sm">
            <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`} onClick={markSent}>
              <Mail /> Email
            </a>
          </Button>
        )}
        {canWrite && isEditableQuote(status) && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/crm/presupuestos/${id}/editar`}>
              <Pencil /> Editar
            </Link>
          </Button>
        )}
        {canWrite && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => execute(() => duplicateQuoteAction(id), (d, m) => router.push(`/crm/presupuestos/${d.id}?aviso=${encodeURIComponent(m)}`))}
          >
            <Copy /> Duplicar
          </Button>
        )}
      </div>
      {canWrite && allowed.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {pending && <Loader2 aria-label="Procesando" className="size-4 animate-spin self-center" />}
          {allowed.includes("ENVIADO") && (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => move("ENVIADO")}>
              <Send /> {status === "BORRADOR" ? "Marcar enviado" : status === "VENCIDO" ? "Reenviar (+15 días)" : "Reabrir"}
            </Button>
          )}
          {allowed.includes("ACEPTADO") && (
            <Button size="sm" disabled={pending} onClick={() => move("ACEPTADO")}>
              <Check /> Aceptado
            </Button>
          )}
          {allowed.includes("RECHAZADO") && (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => window.confirm("¿Marcar el presupuesto como rechazado?") && move("RECHAZADO")}>
              <X /> Rechazado
            </Button>
          )}
          {allowed.includes("BORRADOR") && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => move("BORRADOR")}>
              <Undo2 /> Volver a borrador
            </Button>
          )}
        </div>
      )}
      <StatusMessage status={msg} />
    </div>
  );
}
