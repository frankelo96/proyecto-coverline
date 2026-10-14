import { NextResponse } from "next/server";

import { bridgeFromToken, bridgeRequestSchema, bridgeSync } from "@/server/woo/bridge";

/**
 * Llamada del plugin de WordPress (cada 5 minutos). Se autentica con la clave
 * que viene incluida en el plugin descargado desde Maestros → Tienda web.
 */
export async function POST(req: Request) {
  const bridge = await bridgeFromToken(req.headers.get("x-coverline-token"));
  if (!bridge) return NextResponse.json({ ok: false, error: "Clave inválida: descargá de nuevo el plugin desde el ERP" }, { status: 401 });
  const parsed = bridgeRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  try {
    return NextResponse.json(await bridgeSync(bridge.id, parsed.data));
  } catch (e) {
    console.error("[woo] plugin:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
