// Cambios en vivo: cuando alguien del grupo propone, vota o edita, las otras pantallas se enteran sin recargar.
//   · Con Supabase: Realtime (Broadcast) en el canal «g:<id del grupo>». El aviso no trae contenido: solo dice «algo cambió»
//     y cada pantalla vuelve a pedir lo suyo a la base.
//   · En desarrollo: el servidor local manda el mismo aviso por SSE (/dev/eventos).
//   · Siempre, de respaldo: se vuelve a consultar al volver a la pestaña, al recuperar la conexión y cada 45 s.
// Si el tiempo real falla, la app sigue andando: solo se entera de los cambios un poco más tarde.
import { BASE, modoDev } from "./api.js";

const cfg = window.CONJUGARNOS || {};

/**
 * @param {string} grupoId
 * @param {() => void} alCambiar  se llama (con espera de 250 ms para juntar ráfagas) cuando hay algo nuevo
 * @param {(estado: "vivo"|"consulta"|"sin-red") => void} alEstado
 * @returns {() => void} para desconectar
 */
export function conectarVivo(grupoId, alCambiar, alEstado = () => {}) {
  let espera = 0, cerrado = false, vivo = false, fuente = null, cliente = null;

  const avisar = () => { clearTimeout(espera); espera = setTimeout(() => { if (!cerrado) alCambiar(); }, 250); };
  const estado = (e) => { if (!cerrado) alEstado(e); };
  const quedaVivo = (v) => { vivo = v; estado(v ? "vivo" : (navigator.onLine === false ? "sin-red" : "consulta")); };

  // respaldo
  const latido = setInterval(() => { if (document.visibilityState === "visible") avisar(); }, 45000);
  const alVolver = () => { if (document.visibilityState === "visible") avisar(); };
  const alRed = () => { estado(navigator.onLine === false ? "sin-red" : vivo ? "vivo" : "consulta"); if (navigator.onLine !== false) avisar(); };
  document.addEventListener("visibilitychange", alVolver);
  addEventListener("online", alRed);
  addEventListener("offline", alRed);

  if (modoDev) {
    fuente = new EventSource("/dev/eventos?g=" + encodeURIComponent(grupoId));
    fuente.addEventListener("open", () => quedaVivo(true));
    fuente.addEventListener("cambio", avisar);
    fuente.addEventListener("error", () => quedaVivo(false));
  } else {
    quedaVivo(false);
    import("./vendor/realtime.js").then(async ({ RealtimeClient }) => {
      if (cerrado) return;
      const { suscribirRealtime } = await import("./realtime-canal.js");
      cliente = suscribirRealtime(RealtimeClient, { base: BASE, llave: cfg.clave_publica, grupoId, alCambio: avisar, alEstado: quedaVivo });
    }).catch(() => quedaVivo(false));
  }

  return () => {
    cerrado = true;
    clearTimeout(espera); clearInterval(latido);
    document.removeEventListener("visibilitychange", alVolver);
    removeEventListener("online", alRed);
    removeEventListener("offline", alRed);
    if (fuente) fuente.close();
    if (cliente) cliente.cerrar();
  };
}
