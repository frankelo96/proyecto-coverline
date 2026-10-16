import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CampaignComposer } from "@/components/crm/campaign-composer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ClientType, ProductCategory } from "@/generated/prisma/enums";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { MONTH_OPTIONS } from "@/lib/masters/fields";
import { CATEGORY_LABELS, CLIENT_TYPE_LABELS } from "@/lib/masters/labels";
import { companyInfo } from "@/server/arca/config";
import { requirePageUser } from "@/server/auth/session";
import { campaignOptions, listClientTags, segmentClients } from "@/server/queries/crm.queries";

export const metadata: Metadata = { title: "Campañas" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    tipo?: string | string[];
    etiqueta?: string | string[];
    local?: string | string[];
    colegio?: string | string[];
    rubro?: string | string[];
    mes?: string;
    inactivo?: string;
    canal?: string;
    envia?: string;
  }>;
};

const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function CampaignsPage({ searchParams }: Props) {
  const user = await requirePageUser(PERMISSIONS.crmRead);
  const sp = await searchParams;
  const options = await campaignOptions();
  const branchIdsOk = new Set(options.branches.map((b) => b.id));
  // Quien tiene un local asignado arma campañas solo con los clientes de su local.
  const ownBranch = user.branchId && branchIdsOk.has(user.branchId) ? user.branchId : null;
  const branchIds = ownBranch ? [ownBranch] : arr(sp.local).filter((b) => branchIdsOk.has(b));
  const schools = arr(sp.colegio);
  const categories = arr(sp.rubro).filter((c): c is ProductCategory => c in CATEGORY_LABELS);
  // WhatsApp que envía: el del local propio, el elegido, o el del único local filtrado.
  const senderId = ownBranch ?? (sp.envia && branchIdsOk.has(sp.envia) ? sp.envia : branchIds.length === 1 ? branchIds[0] : null);
  const sender = options.branches.find((b) => b.id === senderId) ?? null;
  const types = arr(sp.tipo).filter((t): t is ClientType => t in CLIENT_TYPE_LABELS);
  const tags = arr(sp.etiqueta);
  const month = sp.mes && /^\d+$/.test(sp.mes) ? Number(sp.mes) : null;
  const inactiveDays = sp.inactivo && /^\d+$/.test(sp.inactivo) ? Number(sp.inactivo) : null;
  const channel = sp.canal === "email" || sp.canal === "todos" ? sp.canal : "whatsapp";
  const [clients, allTags] = await Promise.all([segmentClients({ types, tags, month, inactiveDays, channel, branchIds, schools, categories }), listClientTags()]);

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
          Elegí a quién escribirle (por local, colegio, rubro, etiqueta, mes de compra o clientes que hace tiempo no compran) y enviá el mensaje por el WhatsApp del local o por email desde {companyInfo().campaignEmail}.
        </p>
      </div>

      <Card>
        <CardContent>
          <form action="/crm/campanas" className="grid gap-5 lg:grid-cols-[1.4fr_1fr_auto]">
            <div className="flex flex-col gap-5 lg:col-span-3">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Local (zona): clientes que compraron ahí</legend>
                {ownBranch ? (
                  <p className="text-sm">
                    {sender?.name} <span className="text-muted-foreground">(tu local)</span>
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {options.branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="local" value={b.id} defaultChecked={branchIds.includes(b.id)} className="size-4 accent-primary" />
                        {b.name}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Colegio: clientes que compraron su uniforme</legend>
                {options.schools.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Todavía no hay productos con colegio. Cargalo en Maestros › Productos, campo <b>Colegio / institución</b>.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {options.schools.map(({ school }) => (
                      <label key={school} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="colegio" value={school} defaultChecked={schools.includes(school)} className="size-4 accent-primary" />
                        {school}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Rubro: clientes que compraron productos de</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {Object.values(ProductCategory).map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="rubro" value={c} defaultChecked={categories.includes(c)} className="size-4 accent-primary" />
                      {CATEGORY_LABELS[c]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
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
              {!ownBranch && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="envia">Envía el WhatsApp de</Label>
                  <NativeSelect id="envia" name="envia" defaultValue={senderId ?? ""}>
                    <option value="">Elegir local</option>
                    {options.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </div>
            <div className="flex items-end">
              <Button type="submit">Ver destinatarios</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <CampaignComposer
        key={JSON.stringify(sp)}
        clients={clients}
        channel={channel}
        sender={sender}
        emailFrom={companyInfo().campaignEmail}
        filters={{
          tipos: types,
          etiquetas: tags,
          locales: options.branches.filter((b) => branchIds.includes(b.id)).map((b) => b.name),
          colegios: schools,
          rubros: categories,
          mes: month,
          inactivo: inactiveDays,
          canal: channel,
        }}
      />
    </div>
  );
}
