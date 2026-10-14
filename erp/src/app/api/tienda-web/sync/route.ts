import { NextResponse } from "next/server";

import { wooConfig } from "@/server/woo/config";
import { runSync } from "@/server/woo/sync";

/**
 * Sincronización disparada desde un cron externo (ej. cron-job.org cada 5 min):
 * GET /api/tienda-web/sync?token=WOO_CRON_TOKEN. Además mantiene despierto el
 * servicio en planes que se duermen.
 */
export async function GET(req: Request) {
  const { cronToken } = wooConfig();
  const token = new URL(req.url).searchParams.get("token");
  if (!cronToken || token !== cronToken) return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 });
  try {
    const s = await runSync("cron");
    return NextResponse.json({ ok: true, mode: s.mode, sent: s.push.sent, deducted: s.orders.deducted, restocked: s.orders.restocked, errors: s.push.errors });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
