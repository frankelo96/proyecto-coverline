"use client";

import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { deleteProductImageAction, makePrimaryImageAction, uploadProductImagesAction } from "@/server/actions/product-images.actions";

/** Fotos del producto: se achican al subirlas; la primera es la principal (se ve en el POS). */
export function ProductImages({ productId, images, canWrite }: { productId: string; images: { id: string }[]; canWrite: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { pending, status, execute } = useServerAction();

  function upload(files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    form.set("productId", productId);
    for (const f of Array.from(files)) form.append("files", f);
    execute(
      () => uploadProductImagesAction(form),
      () => {
        if (input.current) input.current.value = "";
        router.refresh();
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Fotos</CardTitle>
          <CardDescription>Hasta 8 fotos (JPG, PNG o WebP; se achican solas). La primera es la principal.</CardDescription>
        </div>
        {canWrite && (
          <>
            <input ref={input} type="file" accept="image/*" multiple className="sr-only" aria-label="Elegir fotos" onChange={(e) => upload(e.target.files)} />
            <Button type="button" variant="outline" disabled={pending || images.length >= 8} onClick={() => input.current?.click()}>
              {pending ? <Loader2 className="animate-spin" /> : <ImagePlus />} Agregar fotos
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {images.length === 0 && <p className="text-sm text-muted-foreground">Sin fotos.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img, i) => (
            <figure key={img.id} className="relative overflow-hidden rounded-md border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- fotos propias servidas por la API con caché */}
              <img src={`/api/productos/imagenes/${img.id}?w=320`} alt={i === 0 ? "Foto principal" : `Foto ${i + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
              {i === 0 && <span className="absolute top-1 left-1 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">Principal</span>}
              {canWrite && (
                <div className="absolute right-1 bottom-1 flex gap-1">
                  {i > 0 && (
                    <Button type="button" size="icon" variant="secondary" aria-label="Hacer principal" onClick={() => execute(() => makePrimaryImageAction({ imageId: img.id }), () => router.refresh())}>
                      <Star />
                    </Button>
                  )}
                  <Button type="button" size="icon" variant="secondary" aria-label="Eliminar foto" onClick={() => execute(() => deleteProductImageAction({ imageId: img.id }), () => router.refresh())}>
                    <Trash2 />
                  </Button>
                </div>
              )}
            </figure>
          ))}
        </div>
        <StatusMessage status={status} />
      </CardContent>
    </Card>
  );
}
