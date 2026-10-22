// Piezas chicas que usan todas las pantallas: escapar texto, avisos, diálogos, copiar, descargar, fechas y cuentas.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
export const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- avisos: una línea abajo, que se va sola; los lee el lector de pantalla ----
let temporizador = 0;
export function aviso(texto, tipo = "") {
  let el = $("#aviso");
  if (!el) {
    el = document.createElement("div");
    el.id = "aviso";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  clearTimeout(temporizador);
  el.className = "aviso" + (tipo ? " " + tipo : "");
  el.textContent = texto;
  el.hidden = false;
  temporizador = setTimeout(() => { el.hidden = true; }, tipo === "mal" ? 7000 : 4000);
}

// ---- diálogos (<dialog>): confirmar, pedir un texto, o uno armado a mano ----
function abrir(html, { alMontar, ancho } = {}) {
  return new Promise((resolver) => {
    const d = document.createElement("dialog");
    d.className = "dlg" + (ancho ? " ancho" : "");
    d.innerHTML = html;
    document.body.appendChild(d);
    let resultado = null;
    const cerrar = (v) => { resultado = v; if (d.open) d.close(); };
    d.addEventListener("close", () => { d.remove(); resolver(resultado); });
    d.addEventListener("click", (e) => { if (e.target === d) cerrar(null); });                 // clic afuera
    d.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => cerrar(null)));
    if (alMontar) alMontar(d, cerrar);
    d.showModal();
    const f = d.querySelector("[autofocus]") || d.querySelector("input, textarea, button");
    if (f) f.focus();
  });
}

export function confirmar({ titulo, texto = "", ok = "Aceptar", peligro = false }) {
  return abrir(`<form method="dialog" class="dlg-f"><h2>${esc(titulo)}</h2>${texto ? `<p>${esc(texto)}</p>` : ""}
    <div class="dlg-b"><button type="button" class="boton sec" data-cerrar>Cancelar</button>
    <button type="submit" class="boton${peligro ? " peligro" : ""}" value="ok" autofocus>${esc(ok)}</button></div></form>`, {
    alMontar: (d, cerrar) => d.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); cerrar(true); }),
  }).then((v) => v === true);
}

/** Pide una línea de texto. Devuelve el texto, o null si se cancela. */
export function pedirTexto({ titulo, ayuda = "", etiqueta, ok = "Aceptar", max = 300, requerido = false, valor = "" }) {
  return abrir(`<form method="dialog" class="dlg-f"><h2>${esc(titulo)}</h2>${ayuda ? `<p>${esc(ayuda)}</p>` : ""}
    <label class="campo"><span>${esc(etiqueta)}${requerido ? "" : " (opcional)"}</span>
    <input name="t" maxlength="${max}" value="${esc(valor)}" ${requerido ? "required" : ""} autocomplete="off" autofocus></label>
    <div class="dlg-b"><button type="button" class="boton sec" data-cerrar>Cancelar</button><button type="submit" class="boton">${esc(ok)}</button></div></form>`, {
    alMontar: (d, cerrar) => d.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); cerrar(d.querySelector("input").value.trim()); }),
  });
}

/** Un diálogo con contenido propio: `cuerpo` es HTML, `alMontar(d, cerrar)` conecta los botones. */
export const dialogo = abrir;

// ---- portapapeles y descargas ----
export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* nada */ }
    t.remove();
    return ok;
  }
}
export function descargar(nombre, contenido, tipo = "application/json") {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo + ";charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---- fechas ----
export function hace(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "recién";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} ${d === 1 ? "día" : "días"}`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

// ---- cuentas del texto: iguales a las de la base ----
/** Palabras, contadas como en la base: separadas por espacios. */
export function palabras(t) {
  const s = String(t || "").trim();
  return s ? s.split(/\s+/).length : 0;
}
const bolsa = (t) => {
  const m = new Map();
  for (const w of String(t || "").trim().toLowerCase().split(/\s+/)) if (w) m.set(w, (m.get(w) || 0) + 1);
  return m;
};
/** ¿Cambiar el cuerpo de `viejo` a `nuevo` reinicia los votos? Misma regla que editar_texto: más de 3 palabras (o el 2 %) cambiadas. */
export function reiniciaVotos(viejo, nuevo) {
  const a = bolsa(viejo), b = bolsa(nuevo);
  let cambia = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) cambia += Math.abs((a.get(k) || 0) - (b.get(k) || 0));
  return cambia > 2 * Math.max(3, Math.ceil(palabras(viejo) * 0.02));
}

/** Cuántos votos a favor más hacen falta para validar con el umbral del grupo (0 si ya alcanza). */
export function faltan(favor, contra, g) {
  for (let k = 0; k < 500; k++) {
    const f = favor + k;
    if (f >= g.umbral_votos && f * g.umbral_den >= g.umbral_num * (f + contra)) return k;
  }
  return 500;
}

/** El cuerpo de un texto, sin armar HTML con lo que escribió otra persona: párrafos por línea en blanco, versos por salto de línea. */
export function cuerpoHTML(texto) {
  return String(texto || "").replace(/\r\n?/g, "\n").split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
}
