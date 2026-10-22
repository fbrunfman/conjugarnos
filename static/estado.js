// Quién soy y en qué grupo estoy. La clave personal se genera en este navegador y nunca sale de acá en limpio:
// a la base solo se la manda para que reconozca quién llama (allá se guarda únicamente su huella).
import { rpc, ErrorApi } from "./api.js";

const K = "conjugarnos:clave";
let enMemoria = null;   // por si el navegador no deja guardar (ventana privada)

export function leerClave() {
  try { return localStorage.getItem(K) || enMemoria; } catch { return enMemoria; }
}
export function guardarClave(c) {
  enMemoria = c;
  try { localStorage.setItem(K, c); } catch { /* queda en memoria */ }
}
export function borrarClave() {
  enMemoria = null;
  try { localStorage.removeItem(K); } catch { /* nada */ }
}
export function claveNueva() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Lo que se sabe de mí: { clave, ses } con ses = { miembro, grupo, invitacion }. */
export const E = { clave: null, ses: null, cuandoCaduca: null };

export const yo = () => E.ses.miembro;
export const grupo = () => E.ses.grupo;
export const esAdmin = () => !!E.ses && E.ses.miembro.rol === "admin";
export const volverLink = () => `${location.origin}${location.pathname}#volver/${E.clave}`;
export const invitacionLink = () => (E.ses && E.ses.invitacion ? `${location.origin}${location.pathname}#entrar/${E.ses.invitacion}` : null);

/** Llama a una función de la base como yo (agrega la clave personal). */
export async function R(nombre, args = {}) {
  try {
    return await rpc(nombre, { p_clave: E.clave, ...args });
  } catch (e) {
    if (e instanceof ErrorApi && e.codigo === "no_autorizado" && E.cuandoCaduca) E.cuandoCaduca();
    throw e;
  }
}

export function ponerSesion(clave, ses) { E.clave = clave; E.ses = ses; }
export function cerrarSesion() { E.clave = null; E.ses = null; borrarClave(); }
