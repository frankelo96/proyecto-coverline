"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { addProductImages, deleteProductImage, makePrimaryImage, ProductImageError } from "@/server/services/product-images.service";

function toError(e: unknown): ActionResult<never> {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
  if (e instanceof ProductImageError || e instanceof AuthorizationError) return { ok: false, error: e.message };
  console.error("[product-images.actions]", e);
  return { ok: false, error: "No se pudo guardar la foto" };
}

const revalidate = () => {
  revalidatePath("/maestros", "layout");
  revalidatePath("/pos", "layout");
};

export async function uploadProductImagesAction(form: FormData): Promise<ActionResult> {
  try {
    await requireActionUser(PERMISSIONS.mastersWrite);
    const productId = z.string().min(1).parse(form.get("productId"));
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { ok: false, error: "Elegí al menos una foto" };
    await addProductImages(productId, files);
    revalidate();
    return { ok: true, data: undefined, message: files.length === 1 ? "Foto agregada" : `${files.length} fotos agregadas` };
  } catch (e) {
    return toError(e);
  }
}

export async function deleteProductImageAction(raw: unknown): Promise<ActionResult> {
  try {
    await requireActionUser(PERMISSIONS.mastersWrite);
    const { imageId } = z.object({ imageId: z.string().min(1) }).parse(raw);
    await deleteProductImage(imageId);
    revalidate();
    return { ok: true, data: undefined, message: "Foto eliminada" };
  } catch (e) {
    return toError(e);
  }
}

export async function makePrimaryImageAction(raw: unknown): Promise<ActionResult> {
  try {
    await requireActionUser(PERMISSIONS.mastersWrite);
    const { imageId } = z.object({ imageId: z.string().min(1) }).parse(raw);
    await makePrimaryImage(imageId);
    revalidate();
    return { ok: true, data: undefined, message: "Foto principal actualizada" };
  } catch (e) {
    return toError(e);
  }
}
