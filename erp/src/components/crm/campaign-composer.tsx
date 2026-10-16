"use client";

import { Check, Copy, Download, Loader2, Mail, MessageCircle, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fillTemplate } from "@/lib/crm/quote-math";
import { toCsv } from "@/lib/masters/csv";
import type { SegmentClient } from "@/server/queries/crm.queries";
import { isoLocalDate } from "@/lib/dates";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { markCampaignSentAction, startCampaignAction } from "@/server/actions/campaigns.actions";

const DEFAULT_MESSAGE =
  "Hola {nombre}! Te escribimos de Coverline Uniformes 👋 Se acerca la temporada de reposición: tenemos stock de todos los talles y podemos personalizar con tu logo. ¿Querés que te pasemos un presupuesto?";

/** 5493515512455 → +54 9 351 551-2455 */
function formatWhatsapp(n: string) {
  const m = /^549(\d{3})(\d{3})(\d{4})$/.exec(n);
  return m ? `+54 9 ${m[1]} ${m[2]}-${m[3]}` : `+${n}`;
}

/**
 * Envío asistido: arma el mensaje personalizado por cliente y abre WhatsApp o
 * el correo con el texto listo. (El envío masivo automático requiere la API de
 * WhatsApp Business o un servicio de email, que se conecta aparte.)
 */
export function CampaignComposer({
  clients,
  campaign,
  channel = "whatsapp",
  filters = null,
  bought = [],
  sender = null,
  emailFrom,
}: {
  clients: SegmentClient[];
  /** Campaña ya guardada (para seguir enviando) */
  campaign?: { id: string; name: string; subject: string | null; message: string; sent: Record<string, string> };
  channel?: "whatsapp" | "email" | "todos";
  filters?: Record<string, unknown> | null;
  bought?: string[];
  /** Local cuyo WhatsApp envía la campaña */
  sender?: { id?: string; name: string; whatsapp: string | null } | null;
  /** Email central de campañas */
  emailFrom: string;
}) {
  const uid = useId();
  const router = useRouter();
  const [message, setMessage] = useState(campaign?.message ?? DEFAULT_MESSAGE);
  const [subject, setSubject] = useState(campaign?.subject ?? "Novedades de Coverline Uniformes");
  const [sent, setSent] = useState<Set<string>>(() => new Set(Object.keys(campaign?.sent ?? {})));
  const [campaignId, setCampaignId] = useState(campaign?.id ?? null);
  const [name, setName] = useState(campaign?.name ?? "");
  const start = useServerAction();
  const boughtSet = new Set(bought);

  function markSent(clientId: string, via: "WHATSAPP" | "EMAIL") {
    setSent((s) => new Set(s).add(clientId));
    if (campaignId) void markCampaignSentAction({ campaignId, clientId, channel: via });
  }
  const [copied, setCopied] = useState(false);
  const emails = clients.map((c) => c.email).filter((e): e is string => !!e);
  const withWhatsapp = clients.filter((c) => c.whatsapp).length;
  const text = (c: SegmentClient) => fillTemplate(message, { nombre: c.contactName, empresa: c.name });

  async function copyEmails() {
    await navigator.clipboard.writeText(emails.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function exportCsv() {
    const csv = toCsv([["Cliente", "Email", "WhatsApp", "Etiquetas", "Última compra"], ...clients.map((c) => [c.name, c.email, c.whatsapp, c.tags.join(", "), c.lastPurchase?.slice(0, 10) ?? ""])]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `segmento-${isoLocalDate()}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Mensaje</CardTitle>
          <CardDescription>
            Usá <code className="rounded bg-muted px-1">{"{nombre}"}</code> y <code className="rounded bg-muted px-1">{"{empresa}"}</code> para personalizarlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-3 text-sm" aria-label="Desde dónde se envía">
            <p>
              <MessageCircle aria-hidden="true" className="mr-1.5 inline size-4" />
              WhatsApp:{" "}
              {sender ? (
                <>
                  desde el número de <b>{sender.name}</b>
                  {sender.whatsapp ? ` (${formatWhatsapp(sender.whatsapp)})` : " (sin número cargado)"}. Abrí esta pantalla en el celular o la PC que tiene ese WhatsApp.
                </>
              ) : (
                <>elegí arriba el local que envía: cada local manda desde su número.</>
              )}
            </p>
            <p>
              <Mail aria-hidden="true" className="mr-1.5 inline size-4" />
              Email: desde <b>{emailFrom}</b>. Abrí el correo con esa cuenta antes de enviar.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-name`}>Nombre de la campaña</Label>
            <Input id={`${uid}-name`} value={name} maxLength={120} disabled={!!campaignId} placeholder="Ej. Reposición escolar febrero" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-subject`}>Asunto (email)</Label>
            <Input id={`${uid}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-msg`}>Texto</Label>
            <Textarea id={`${uid}-msg`} value={message} onChange={(e) => setMessage(e.target.value)} rows={4} disabled={!!campaignId} />
          </div>
          {!campaignId && (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="w-fit"
                disabled={start.pending || name.trim().length < 3 || clients.length === 0}
                onClick={() =>
                  start.execute(
                    () => startCampaignAction({ name: name.trim(), channel, subject: subject.trim() || null, message: message.trim(), filters, branchId: sender?.id ?? null, clientIds: clients.map((c) => c.id) }),
                    (d) => {
                      setCampaignId(d.id);
                      router.replace(`/crm/campanas/historial/${d.id}`);
                    },
                  )
                }
              >
                {start.pending ? <Loader2 className="animate-spin" /> : <Play />} Guardar campaña y empezar a enviar
              </Button>
              <p className="text-xs text-muted-foreground">Queda en el historial: a quién se le envió y quién compró después.</p>
            </div>
          )}
          <StatusMessage status={start.status} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copyEmails} disabled={!emails.length}>
              {copied ? <Check /> : <Copy />} {copied ? "Copiados" : `Copiar ${emails.length} emails (para CCO)`}
            </Button>
            {emails.length > 0 && emails.length <= 50 && (
              <Button asChild variant="outline" size="sm">
                <a href={`mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fillTemplate(message, { nombre: "", empresa: "" }).replace(/^Hola\s*!/, "Hola!"))}`}>
                  <Mail /> Abrir email con todos en CCO
                </a>
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!clients.length}>
              <Download /> Exportar segmento (CSV)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {clients.length} destinatarios · {withWhatsapp} con WhatsApp · {emails.length} con email
          </CardTitle>
          <CardDescription>Tocá WhatsApp en cada fila: se abre el chat con el mensaje listo para enviar. Las filas enviadas quedan marcadas.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 py-0">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Cliente</TableHead>
                <TableHead>Etiquetas</TableHead>
                <TableHead>Última compra</TableHead>
                <TableHead className="pr-5 text-right">Enviar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Ningún cliente coincide con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {clients.map((c) => (
                <TableRow key={c.id} className={sent.has(c.id) ? "bg-success/5" : undefined}>
                  <TableCell className="pl-5">
                    <a href={`/crm/clientes/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                      {c.name}
                    </a>
                    {sent.has(c.id) && (
                      <Badge variant="success" className="ml-2">
                        Enviado
                      </Badge>
                    )}
                    {boughtSet.has(c.id) && (
                      <Badge variant="accent" className="ml-2">
                        Compró
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell>{c.lastPurchase ? new Date(c.lastPurchase).toLocaleDateString("es-AR") : "Nunca"}</TableCell>
                  <TableCell className="pr-5">
                    <span className="flex justify-end gap-1.5">
                      {c.whatsapp && (
                        <Button asChild size="sm" variant={sent.has(c.id) ? "ghost" : "outline"} disabled={!campaignId}>
                          <a
                            href={`https://wa.me/${c.whatsapp}?text=${encodeURIComponent(text(c))}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-disabled={!campaignId}
                            className={!campaignId ? "pointer-events-none opacity-50" : undefined}
                            onClick={() => markSent(c.id, "WHATSAPP")}
                          >
                            <MessageCircle /> WhatsApp
                          </a>
                        </Button>
                      )}
                      {c.email && (
                        <Button asChild size="sm" variant="ghost">
                          <a
                            href={`mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text(c))}`}
                            onClick={() => markSent(c.id, "EMAIL")}
                            aria-disabled={!campaignId}
                            className={!campaignId ? "pointer-events-none opacity-50" : undefined}
                            aria-label={`Email a ${c.name}`}
                          >
                            <Mail />
                          </a>
                        </Button>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
