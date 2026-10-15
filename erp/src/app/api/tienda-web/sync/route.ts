import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { wooConfig } from "@/server/woo/config";
import { runSync } from "@/server/woo/sync";

/**
 * Sincronización disparada desde un cron externo (ej. cron-job.org cada 5 min):
 * GET /api/tienda-web/sync con la cabecera "Authorization: Bearer WOO_CRON_TOKEN"
 * (o ?token= para servicios de cron que no permiten cabeceras). Además mantiene
 * despierto el servicio en planes que se duermen.
 */
function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: Request) {
  const { cronToken } = wooConfig();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const token = bearer ?? new URL(req.url).searchParams.get("token");
  if (!cronToken || !token || !sameToken(token, cronToken)) return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 });
  try {
    const s = await runSync("cron");
    return NextResponse.json({ ok: true, mode: s.mode, sent: s.push.sent, deducted: s.orders.deducted, restocked: s.orders.restocked, errors: s.push.errors });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
