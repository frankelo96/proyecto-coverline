import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CampaignComposer } from "@/components/crm/campaign-composer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ClientType } from "@/generated/prisma/enums";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { MONTH_OPTIONS } from "@/lib/masters/fields";
import { CLIENT_TYPE_LABELS } from "@/lib/masters/labels";
import { requirePageUser } from "@/server/auth/session";
import { listClientTags, segmentClients } from "@/server/queries/crm.queries";

export const metadata: Metadata = { title: "Campañas" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ tipo?: string | string[]; etiqueta?: string | string[]; mes?: string; inactivo?: string; canal?: string }> };

const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function CampaignsPage({ searchParams }: Props) {
  await requirePageUser(PERMISSIONS.crmRead);
  const sp = await searchParams;
  const types = arr(sp.tipo).filter((t): t is ClientType => t in CLIENT_TYPE_LABELS);
  const tags = arr(sp.etiqueta);
  const month = sp.mes && /^\d+$/.test(sp.mes) ? Number(sp.mes) : null;
  const inactiveDays = sp.inactivo && /^\d+$/.test(sp.inactivo) ? Number(sp.inactivo) : null;
  const channel = sp.canal === "email" || sp.canal === "todos" ? sp.canal : "whatsapp";
  const [clients, allTags] = await Promise.all([segmentClients({ types, tags, month, inactiveDays, channel }), listClientTags()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Campañas</h1>
          <Button asChild variant="outline">
            <Link href="/crm/campanas/historial">
              <History /> Historial de campañas
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Elegí a quién escribirle (por rubro, etiqueta, mes de compra o clientes que hace tiempo no compran) y enviá el mensaje por WhatsApp o email.
        </p>
      </div>

      <Card>
        <CardContent>
          <form action="/crm/campanas" className="grid gap-5 lg:grid-cols-[1.4fr_1fr_auto]">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Tipo de cliente</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {Object.values(ClientType).map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="tipo" value={t} defaultChecked={types.includes(t)} className="size-4 accent-primary" />
                    {CLIENT_TYPE_LABELS[t]}
                  </label>
                ))}
              </div>
              {allTags.length > 0 && (
                <>
                  <span className="mt-3 text-sm font-medium">Etiquetas</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {allTags.map(({ tag, count }) => (
                      <label key={tag} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="etiqueta" value={tag} defaultChecked={tags.includes(tag)} className="size-4 accent-primary" />
                        {tag} <span className="text-muted-foreground">({count})</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mes">Suele comprar en</Label>
                <NativeSelect id="mes" name="mes" defaultValue={month ? String(month) : ""}>
                  <option value="">Cualquier mes</option>
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inactivo">Sin comprar hace</Label>
                <NativeSelect id="inactivo" name="inactivo" defaultValue={inactiveDays ? String(inactiveDays) : ""}>
                  <option value="">Sin filtro</option>
                  <option value="90">Más de 3 meses</option>
                  <option value="180">Más de 6 meses</option>
                  <option value="365">Más de 1 año</option>
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="canal">Canal</Label>
                <NativeSelect id="canal" name="canal" defaultValue={channel}>
                  <option value="whatsapp">Con WhatsApp</option>
                  <option value="email">Con email</option>
                  <option value="todos">Todos</option>
                </NativeSelect>
              </div>
            </div>
            <div className="flex items-end">
              <Button type="submit">Ver destinatarios</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <CampaignComposer key={JSON.stringify(sp)} clients={clients} channel={channel} filters={{ tipos: types, etiquetas: tags, mes: month, inactivo: inactiveDays, canal: channel }} />
    </div>
  );
}
