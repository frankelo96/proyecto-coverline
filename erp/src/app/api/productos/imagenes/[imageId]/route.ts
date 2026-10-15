import sharp from "sharp";

import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";

const WIDTHS = [96, 160, 320, 640];

/** Foto de producto (requiere sesión). ?w=96|160|320|640 devuelve una miniatura. Las fotos no cambian: se cachean. */
export async function GET(request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  if (!(await getCurrentUser())) return new Response("No autorizado", { status: 401 });
  const { imageId } = await params;
  const img = await db.productImage.findUnique({ where: { id: imageId }, select: { data: true, mime: true, width: true } });
  if (!img) return new Response("No encontrada", { status: 404 });
  const w = Number(new URL(request.url).searchParams.get("w"));
  let body: Uint8Array = img.data;
  if (WIDTHS.includes(w) && w < img.width) body = new Uint8Array(await sharp(Buffer.from(img.data)).resize({ width: w }).webp({ quality: 75 }).toBuffer());
  return new Response(body as unknown as BodyInit, { headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=31536000, immutable" } });
}
