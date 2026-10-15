/** Se ejecuta una vez al arrancar el servidor: zona horaria y sincronización periódica con la tienda web. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fechas de calendario (informes, vencimientos, "hoy") en hora argentina aunque el servidor esté en otro país.
    process.env.TZ ||= "America/Argentina/Buenos_Aires";
    const { startWooScheduler } = await import("@/server/woo/sync");
    startWooScheduler();
  }
}
