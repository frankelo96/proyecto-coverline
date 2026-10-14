import { NextResponse } from "next/server";

import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { getOrCreateBridge } from "@/server/woo/bridge";
import { PLUGIN_SLUG, pluginZip } from "@/server/woo/wordpress-plugin";

/** Dirección pública del ERP (Render la informa en RENDER_EXTERNAL_URL). */
function publicUrl(req: Request) {
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

/** Descarga el plugin de WordPress con la dirección del ERP y la clave ya cargadas. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sesión expirada", { status: 401 });
  if (!hasPermission(user.permissions, PERMISSIONS.mastersWrite)) return new NextResponse("Sin permiso", { status: 403 });
  const bridge = await getOrCreateBridge();
  const zip = await pluginZip(publicUrl(req), bridge.token);
  return new NextResponse(new Uint8Array(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${PLUGIN_SLUG}.zip"`, "Cache-Control": "no-store" },
  });
}
