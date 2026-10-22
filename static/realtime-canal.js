// La parte de vivo.js que habla con Realtime de Supabase, aparte para poder probarla sin navegador (test/realtime.test.mjs).
// Se suscribe al canal «g:<id del grupo>» y avisa cada vez que la base manda «cambio».

/**
 * @param {Function} RealtimeClient  la clase de @supabase/realtime-js (empaquetada en vendor/realtime.js)
 * @param {{ base: string, llave: string, grupoId: string, alCambio: () => void, alEstado: (vivo: boolean) => void }} o
 * @returns {{ cerrar: () => void }}
 */
export function suscribirRealtime(RealtimeClient, { base, llave, grupoId, alCambio, alEstado }) {
  const cliente = new RealtimeClient(base.replace(/^http/, "ws") + "/realtime/v1", { params: { apikey: llave } });
  const canal = cliente.channel("g:" + grupoId, { config: { broadcast: { self: false } } });
  canal.on("broadcast", { event: "cambio" }, () => alCambio());
  canal.subscribe((estado) => {
    if (estado === "SUBSCRIBED") { alEstado(true); alCambio(); }    // por si algo cambió mientras se conectaba
    else if (estado === "CLOSED" || estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") alEstado(false);
  });
  return { cerrar() { try { canal.unsubscribe(); cliente.disconnect(); } catch { /* ya estaba cerrado */ } } };
}
