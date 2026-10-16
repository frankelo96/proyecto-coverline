"use client";

import { Check, Minus, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { variantOptions } from "@/lib/catalog/variants";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CatalogItem } from "@/server/queries/treasury.queries";

export interface CatalogProduct {
  productId: string;
  name: string;
  sku: string;
  category: CatalogItem["category"];
  variants: CatalogItem[];
  minPrice: number;
  maxPrice: number;
  stock: number;
  imageId: string | null;
}

/** Agrupa las variantes del catálogo por producto (para buscar y elegir por producto). */
export function groupCatalog(catalog: CatalogItem[]): CatalogProduct[] {
  const map = new Map<string, CatalogProduct>();
  for (const v of catalog) {
    const p = map.get(v.productId);
    if (p) {
      p.variants.push(v);
      p.minPrice = Math.min(p.minPrice, v.price);
      p.maxPrice = Math.max(p.maxPrice, v.price);
      p.stock += v.stock;
    } else {
      map.set(v.productId, { productId: v.productId, name: v.productName, sku: v.productSku, category: v.category, variants: [v], minPrice: v.price, maxPrice: v.price, stock: v.stock, imageId: v.imageId });
    }
  }
  return [...map.values()];
}

export const priceRange = (p: CatalogProduct) => (p.minPrice === p.maxPrice ? formatMoney(p.minPrice) : `desde ${formatMoney(p.minPrice)}`);

function Chips({ label, values, selected, onSelect }: { label: string; values: string[]; selected: string | null; onSelect: (v: string) => void }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected === v}
            onClick={() => onSelect(v)}
            className={cn(
              "h-10 rounded-md border px-3 text-sm transition-colors",
              selected === v ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted",
            )}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Selección de variante: se elige color y tela (si el producto los tiene) y
 * después el talle. Cada toque en un talle suma una unidad al carrito.
 */
export function ProductPicker({ product, onAdd, onClose, inCart }: { product: CatalogProduct; onAdd: (variantId: string, quantity: number) => void; onClose: () => void; inCart: (variantId: string) => number }) {
  const opts = variantOptions(product.variants);
  // Cantidad que suma cada toque en un talle (para llevar varias del mismo talle de una vez).
  const [qtyText, setQtyText] = useState("1");
  const qty = Math.max(1, Math.min(9999, Math.trunc(Number(qtyText)) || 1));
  const [color, setColor] = useState<string | null>(opts.colors.length === 1 ? opts.colors[0] : null);
  const [fabric, setFabric] = useState<string | null>(opts.fabrics.length === 1 ? opts.fabrics[0] : null);

  // Telas disponibles para el color elegido (y viceversa) para no ofrecer combinaciones que no existen.
  const fabricsForColor = opts.fabrics.filter((f) => product.variants.some((v) => v.fabric === f && (!color || v.color === color)));
  const colorsForFabric = opts.colors.filter((c) => product.variants.some((v) => v.color === c && (!fabric || v.fabric === fabric)));
  const needColor = opts.colors.length > 0 && !color;
  const needFabric = opts.fabrics.length > 0 && !fabric;
  const sizes = product.variants
    .filter((v) => (opts.colors.length === 0 || v.color === color) && (opts.fabrics.length === 0 || v.fabric === fabric))
    .sort((a, b) => opts.sizes.indexOf(a.size) - opts.sizes.indexOf(b.size));
  const samePrice = sizes.every((s) => s.price === sizes[0]?.price);

  return (
    <section aria-label={`Elegir variante de ${product.name}`} className="flex flex-col gap-4 rounded-lg border-2 border-primary/40 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        {product.imageId && (
          // eslint-disable-next-line @next/next/no-img-element -- foto propia servida por la API con caché
          <img src={`/api/productos/imagenes/${product.imageId}?w=160`} alt="" className="size-20 shrink-0 rounded-md border object-cover" />
        )}
        <div className="flex-1">
          <p className="text-lg font-semibold leading-tight">{product.name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {product.sku} · {product.variants.length} variantes · stock en este local {formatNumber(product.stock)}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Cerrar selección" onClick={onClose}>
          <X />
        </Button>
      </div>
      <Chips label="Color" values={colorsForFabric} selected={color} onSelect={(c) => setColor(c === color ? null : c)} />
      <Chips label="Tela" values={fabricsForColor} selected={fabric} onSelect={(f) => setFabric(f === fabric ? null : f)} />
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Talle {samePrice && sizes[0] && !needColor && !needFabric ? `· ${formatMoney(sizes[0].price)}` : ""}
          </span>
          <div className="flex items-center gap-1.5">
            <label htmlFor={`qty-${product.productId}`} className="text-sm text-muted-foreground">
              Cantidad por toque
            </label>
            <Button type="button" variant="outline" size="icon" className="size-9" aria-label="Restar cantidad" onClick={() => setQtyText(String(Math.max(1, qty - 1)))}>
              <Minus />
            </Button>
            <input
              id={`qty-${product.productId}`}
              type="number"
              inputMode="numeric"
              min={1}
              className="h-9 w-16 rounded-md border border-input bg-card text-center font-mono text-sm"
              value={qtyText}
              onChange={(e) => setQtyText(e.target.value)}
              onBlur={() => setQtyText(String(qty))}
            />
            <Button type="button" variant="outline" size="icon" className="size-9" aria-label="Sumar cantidad" onClick={() => setQtyText(String(qty + 1))}>
              <Plus />
            </Button>
          </div>
        </div>
        {needColor || needFabric ? (
          <p className="text-sm text-muted-foreground">Elegí {needColor && needFabric ? "color y tela" : needColor ? "el color" : "la tela"} para ver los talles.</p>
        ) : sizes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay talles para esa combinación.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
            {sizes.map((v) => {
              const inCartQty = inCart(v.variantId);
              return (
                <button
                  key={v.variantId}
                  type="button"
                  onClick={() => onAdd(v.variantId, qty)}
                  aria-label={`Agregar talle ${v.size}${inCartQty ? ` (ya hay ${inCartQty})` : ""}`}
                  className={cn(
                    "relative flex min-h-16 flex-col items-center justify-center rounded-md border px-2 py-1.5 text-center transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    inCartQty > 0 ? "border-primary bg-primary/5" : "border-input bg-card",
                  )}
                >
                  <span className="text-base font-semibold">{v.size}</span>
                  <span className={cn("text-xs", v.stock > 0 ? "text-muted-foreground" : "font-medium text-destructive")}>
                    acá {formatNumber(v.stock)}
                    {v.totalStock !== v.stock && <span className="text-muted-foreground"> · total {formatNumber(v.totalStock)}</span>}
                  </span>
                  {!samePrice && <span className="font-mono text-xs">{formatMoney(v.price)}</span>}
                  {inCartQty > 0 && (
                    <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                      {inCartQty}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          <Check /> Listo
        </Button>
      </div>
    </section>
  );
}
