// Habla con la base: cada acción es una función de Postgres (supabase/schema.sql) llamada por HTTP.
// Nunca se tocan las tablas: las funciones verifican quién sos con tu clave personal.
const cfg = window.CONJUGARNOS || {};
export const BASE = String(cfg.url || "").replace(/\/+$/, "");
const LLAVE = String(cfg.clave_publica || "");
/** Sin dirección de Supabase en config.js: se usa el servidor de desarrollo que sirve esta misma página. */
export const modoDev = !BASE;

export class ErrorApi extends Error {
  constructor(codigo, detalle = null, sinRed = false) {
    super(codigo);
    this.codigo = codigo;
    this.detalle = detalle;
    this.sinRed = sinRed;
  }
}

const cabeceras = () => ({
  "content-type": "application/json",
  ...(LLAVE ? { apikey: LLAVE } : {}),
  ...(LLAVE.startsWith("eyJ") ? { authorization: `Bearer ${LLAVE}` } : {}),   // las claves nuevas (sb_publishable_…) van solo en apikey
});

export async function rpc(nombre, args = {}) {
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), 20000);
  let r;
  try {
    r = await fetch(`${BASE}/rest/v1/rpc/${nombre}`, { method: "POST", headers: cabeceras(), body: JSON.stringify(args), signal: ctrl.signal });
  } catch {
    throw new ErrorApi("sin_red", null, true);
  } finally {
    clearTimeout(corte);
  }
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) {
    const msg = (cuerpo && cuerpo.message) || "";
    // La página pide una función que la base no tiene (o con otros argumentos): se actualizó una y la otra no.
    if ((cuerpo && cuerpo.code === "PGRST202") || /does not exist|could not find the function|no existe la funci/i.test(msg)) throw new ErrorApi("base_desactualizada");
    throw new ErrorApi(msg || "error_" + r.status, cuerpo ? cuerpo.details : null);
  }
  return cuerpo;
}

const MENSAJES = {
  sin_red: "No hay conexión con el servidor. Probá de nuevo en un momento.",
  no_autorizado: "Tu sesión ya no es válida en este dispositivo.",
  solo_admin: "Eso solo lo puede hacer quien administra el grupo.",
  sin_permiso: "No tenés permiso para hacer eso.",
  clave_invalida: "Este dispositivo ya tiene una cuenta. Si querés entrar con otro nombre, salí primero desde «Grupo».",
  nombre_invalido: "El nombre tiene que tener entre 1 y 40 caracteres.",
  nombre_en_uso: "Ya hay alguien con ese nombre en el grupo. Elegí otro.",
  invitacion_invalida: "Ese link de invitación no sirve: ya se usó o está mal copiado.",
  sin_combinacion: "Elegí al menos una combinación de planetas.",
  demasiadas_combinaciones: "Son demasiadas combinaciones: el máximo es 12.",
  planeta_invalido: "Esa combinación de planetas no es válida.",
  falta_titulo: "Falta el título.",
  falta_autor: "Falta el autor o la autora.",
  falta_texto: "Falta el texto.",
  texto_largo: "El texto pasa el máximo de palabras del grupo.",
  texto_repetido: "Ya hay un texto con ese título y autor en el grupo.",
  texto_inexistente: "Ese texto ya no existe.",
  vinculo_inexistente: "Ese texto ya no está en esta combinación.",
  voto_invalido: "Voto inválido.",
  falta_motivo: "Un voto en contra necesita un motivo de una línea.",
  motivo_largo: "El motivo es muy largo (máximo 200 caracteres).",
  justificacion_larga: "La justificación es muy larga (máximo 500 caracteres).",
  falta_comentario: "Escribí el comentario.",
  comentario_largo: "El comentario es muy largo (máximo 1000 caracteres).",
  comentario_inexistente: "Ese comentario ya no existe.",
  ya_propuesto: "Ese texto ya estaba propuesto para esa combinación.",
  umbral_invalido: "Ese umbral no es válido.",
  miembro_inexistente: "Esa persona ya no está en el grupo.",
  base_desactualizada: "La página y la base no coinciden: falta actualizar la base (volver a correr supabase/schema.sql) o, en tu compu, reiniciar el servidor de prueba.",
  no_podes_expulsarte: "No podés expulsarte a vos mismo.",
};
export const mensaje = (e) => MENSAJES[e && e.codigo] || "Algo salió mal. Probá de nuevo.";
