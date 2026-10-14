/** Se ejecuta una vez al arrancar el servidor: inicia la sincronización periódica con la tienda web. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWooScheduler } = await import("@/server/woo/sync");
    startWooScheduler();
  }
}
