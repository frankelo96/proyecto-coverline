"use client";

import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { formatMoney, UOM_SHORT } from "@/lib/format";
import { parseLocaleNumber } from "@/lib/masters/fields";
import { todayIso } from "@/lib/purchasing/labels";
import { computePurchaseTotals, discriminatesVat } from "@/lib/purchasing/math";
import { CREDIT_NOTE_LABELS, CREDIT_NOTE_TYPES } from "@/lib/validations/purchasing";
import { createCreditNoteAction } from "@/server/actions/purchasing.actions";
import type { MerchandiseFormData } from "@/server/queries/purchasing.queries";

type Vat = 21 | 10.5 | 27 | 0;
interface ReturnLine {
  key: number;
  article: string;
  quantity: string;
  unitCost: string;
  vatRate: Vat;
}
interface ConceptLine {
  key: number;
  description: string;
  amount: string;
  vatRate: Vat;
}

let seq = 1;
const n = (v: string) => parseLocaleNumber(v || "0") ?? 0;

/** Nota de crédito de un proveedor: devolución de mercadería y/o bonificación; se descuenta de la deuda. */
export function CreditNoteForm({
  data,
  supplierId,
  payables,
}: {
  data: MerchandiseFormData;
  supplierId: string;
  payables: { id: string; description: string; balance: number; dueDate: string }[];
}) {
  const id = useId();
  const router = useRouter();
  const [type, setType] = useState<(typeof CREDIT_NOTE_TYPES)[number]>("NOTA_CREDITO_A");
  const [pos, setPos] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [returns, setReturns] = useState<ReturnLine[]>([]);
  const [concepts, setConcepts] = useState<ConceptLine[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(payables.map((p) => p.id)));
  const { pending, status, execute } = useServerAction();
  const withVat = discriminatesVat(type);

  const articles = useMemo(
    () => [
      ...data.materials.map((m) => ({ id: `RAW:${m.id}`, label: `${m.code} · ${m.name} (${UOM_SHORT[m.uom]})`, cost: m.currentCost })),
      ...data.variants.map((v) => ({ id: `VARIANT:${v.id}`, label: v.label, cost: v.currentCost })),
    ],
    [data.materials, data.variants],
  );

  const totals = useMemo(() => {
    try {
      return computePurchaseTotals(
        [...returns.map((r) => ({ quantity: n(r.quantity), unitCost: n(r.unitCost), vatRate: r.vatRate })), ...concepts.map((c) => ({ quantity: 1, unitCost: n(c.amount), vatRate: c.vatRate }))],
        { perceptionIva: 0, perceptionIibb: 0, otherTaxes: 0 },
        type,
      );
    } catch {
      return null;
    }
  }, [returns, concepts, type]);

  function submit() {
    execute(
      () =>
        createCreditNoteAction({
          supplierId,
          invoiceType: type,
          pointOfSale: type === "TICKET_INTERNO" ? null : Number(pos) || null,
          invoiceNumber: type === "TICKET_INTERNO" ? null : number.trim() || null,
          date,
          notes: notes.trim() || null,
          returns: returns.map((r) => {
            const [kind, articleId] = r.article.split(":");
            return {
              kind: kind as "RAW" | "VARIANT",
              rawMaterialId: kind === "RAW" ? articleId : null,
              productVariantId: kind === "VARIANT" ? articleId : null,
              quantity: n(r.quantity),
              unitCost: n(r.unitCost),
              vatRate: withVat ? r.vatRate : 0,
            };
          }),
          concepts: concepts.map((c) => ({ description: c.description.trim(), amount: n(c.amount), vatRate: withVat ? c.vatRate : 0 })),
          payableIds: [...selected],
        }),
      (d, message) => router.push(`/compras/${d.id}?aviso=${encodeURIComponent(message)}`),
    );
  }

  const vatSelect = (value: Vat, onChange: (v: Vat) => void, label: string) =>
    withVat ? (
      <NativeSelect aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value) as Vat)}>
        <option value={21}>21%</option>
        <option value={10.5}>10,5%</option>
        <option value={27}>27%</option>
        <option value={0}>Exento</option>
      </NativeSelect>
    ) : (
      <span className="flex h-10 items-center text-sm text-muted-foreground">Incluido</span>
    );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Comprobante</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-t`}>Tipo</Label>
            <NativeSelect id={`${id}-t`} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              {CREDIT_NOTE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CREDIT_NOTE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          </div>
          {type !== "TICKET_INTERNO" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-p`}>Punto de venta</Label>
                <Input id={`${id}-p`} inputMode="numeric" value={pos} onChange={(e) => setPos(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-n`}>Número</Label>
                <Input id={`${id}-n`} inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-d`}>Fecha</Label>
            <Input id={`${id}-d`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-4">
            <Label htmlFor={`${id}-o`}>Observaciones</Label>
            <Input id={`${id}-o`} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Mercadería devuelta</CardTitle>
            <CardDescription>Sale del stock (materia prima en su unidad de stock; prendas del local principal).</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setReturns((r) => [...r, { key: seq++, article: "", quantity: "1", unitCost: "", vatRate: 21 }])}>
            <Plus /> Agregar
          </Button>
        </CardHeader>
        {returns.length > 0 && (
          <CardContent className="flex flex-col gap-3">
            {returns.map((r) => (
              <div key={r.key} className="grid items-end gap-2 md:grid-cols-[2.4fr_0.8fr_1fr_0.8fr_auto]">
                <NativeSelect
                  aria-label="Artículo devuelto"
                  value={r.article}
                  onChange={(e) => {
                    const a = articles.find((x) => x.id === e.target.value);
                    setReturns((ls) => ls.map((x) => (x.key === r.key ? { ...x, article: e.target.value, unitCost: a ? String(a.cost) : x.unitCost } : x)));
                  }}
                >
                  <option value="">Elegí…</option>
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </NativeSelect>
                <Input aria-label="Cantidad devuelta" inputMode="decimal" className="text-right" value={r.quantity} onChange={(e) => setReturns((ls) => ls.map((x) => (x.key === r.key ? { ...x, quantity: e.target.value } : x)))} />
                <Input aria-label="Precio unitario" inputMode="decimal" className="text-right" value={r.unitCost} onChange={(e) => setReturns((ls) => ls.map((x) => (x.key === r.key ? { ...x, unitCost: e.target.value } : x)))} />
                {vatSelect(r.vatRate, (v) => setReturns((ls) => ls.map((x) => (x.key === r.key ? { ...x, vatRate: v } : x))), "IVA devolución")}
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar" onClick={() => setReturns((ls) => ls.filter((x) => x.key !== r.key))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Bonificaciones y descuentos</CardTitle>
            <CardDescription>Diferencias de precio, descuentos por pronto pago, fallas sin devolución, etc.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setConcepts((c) => [...c, { key: seq++, description: "", amount: "", vatRate: 21 }])}>
            <Plus /> Agregar
          </Button>
        </CardHeader>
        {concepts.length > 0 && (
          <CardContent className="flex flex-col gap-3">
            {concepts.map((c) => (
              <div key={c.key} className="grid items-end gap-2 md:grid-cols-[2.4fr_1fr_0.8fr_auto]">
                <Input aria-label="Concepto" maxLength={200} placeholder="Ej. Bonificación 5% factura 0003-00001234" value={c.description} onChange={(e) => setConcepts((ls) => ls.map((x) => (x.key === c.key ? { ...x, description: e.target.value } : x)))} />
                <Input aria-label={withVat ? "Importe neto" : "Importe"} inputMode="decimal" className="text-right" placeholder={withVat ? "Neto" : "Importe"} value={c.amount} onChange={(e) => setConcepts((ls) => ls.map((x) => (x.key === c.key ? { ...x, amount: e.target.value } : x)))} />
                {vatSelect(c.vatRate, (v) => setConcepts((ls) => ls.map((x) => (x.key === c.key ? { ...x, vatRate: v } : x))), "IVA concepto")}
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar" onClick={() => setConcepts((ls) => ls.filter((x) => x.key !== c.key))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Se descuenta de</CardTitle>
          <CardDescription>Lo que no se descuente de estos comprobantes queda como saldo a favor para la próxima orden de pago.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {payables.length === 0 && <p className="text-muted-foreground">No hay comprobantes pendientes: todo queda como saldo a favor.</p>}
          {payables.map((p) => (
            <label key={p.id} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selected.has(p.id)}
                  onChange={() =>
                    setSelected((cur) => {
                      const next = new Set(cur);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    })
                  }
                />
                {p.description} · vence {new Date(p.dueDate).toLocaleDateString("es-AR")}
              </span>
              <span className="font-mono">{formatMoney(p.balance)}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      {totals && (
        <p className="self-end text-lg">
          Total de la nota de crédito: <strong className="font-mono">{formatMoney(totals.total)}</strong>
        </p>
      )}
      <StatusMessage status={status} />
      <Button className="w-fit" disabled={pending || !totals || totals.total <= 0 || returns.some((r) => !r.article)} onClick={submit}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Registrar nota de crédito
      </Button>
    </div>
  );
}
