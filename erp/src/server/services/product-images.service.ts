import "server-only";

import sharp from "sharp";

import { db } from "@/server/db";

export class ProductImageError extends Error {}

const MAX_IMAGES = 8;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_SIDE = 1200;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"];

/** Achica cada foto a 1200 px (WebP) y la guarda. Las fotos del celular se enderezan según su orientación. */
export async function addProductImages(productId: string, files: File[]) {
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, _count: { select: { images: true } } } });
  if (!product) throw new ProductImageError("Producto inexistente");
  if (product._count.images + files.length > MAX_IMAGES) throw new ProductImageError(`Hasta ${MAX_IMAGES} fotos por producto`);
  let order = product._count.images;
  for (const f of files) {
    if (f.size > MAX_BYTES) throw new ProductImageError(`${f.name}: la foto supera 8 MB`);
    if (f.type && !ACCEPTED.includes(f.type)) throw new ProductImageError(`${f.name}: formato no admitido (usá JPG, PNG o WebP)`);
    let out: { data: Buffer; info: { width: number; height: number } };
    try {
      out = await sharp(Buffer.from(await f.arrayBuffer()))
        .rotate()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new ProductImageError(`${f.name}: no se pudo leer la imagen`);
    }
    await db.productImage.create({ data: { productId, data: new Uint8Array(out.data), width: out.info.width, height: out.info.height, sortOrder: order++ } });
  }
}

export async function deleteProductImage(imageId: string) {
  await db.productImage.deleteMany({ where: { id: imageId } });
}

/** Pone una foto como principal (primera). */
export async function makePrimaryImage(imageId: string) {
  const img = await db.productImage.findUnique({ where: { id: imageId }, select: { productId: true } });
  if (!img) throw new ProductImageError("Foto inexistente");
  const all = await db.productImage.findMany({ where: { productId: img.productId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  const ordered = [imageId, ...all.map((a) => a.id).filter((x) => x !== imageId)];
  await db.$transaction(ordered.map((id, i) => db.productImage.update({ where: { id }, data: { sortOrder: i } })));
}
