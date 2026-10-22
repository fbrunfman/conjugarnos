// Una combinación: sus textos validados y los que están en debate, con los votos de cada uno.
// Se actualiza sola cuando alguien del grupo vota o propone; al volver a dibujar se conserva lo que estabas haciendo
// (qué textos tenías abiertos, un motivo a medio escribir, dónde estabas parado en la página).
import { R, E, yo, grupo, esAdmin } from "./estado.js";
import { mensaje } from "./api.js";
import { PLANETAS, NOMBRE, circuloDeco, etiqueta, enRuta, llave } from "./planetas.js";
import { selectorPlanetas } from "./selector.js";
import { esc, $, $$, aviso, plural, hace, confirmar, pedirTexto, dialogo, cuerpoHTML, faltan, reducido } from "./ui.js";

let raiz = null, ids = [], filas = [], grilla = [], ficha = 0, ultimaAzar = null;
const abiertos = new Set();          // vínculos con el texto completo abierto
let firmas = new Map();              // vínculo → «estado|a favor|en contra», para marcar lo que cambió
let primera = true;

const pidePrestado = () => ids.length === 1;
const partes = () => ({ p_a: ids[0], p_b: ids[1] || null });

export async function montar(el, combo) {
  raiz = el; ids = combo; filas = []; grilla = []; firmas = new Map(); primera = true; ultimaAzar = null;
  raiz.innerHTML = `<section class="pantalla" aria-labelledby="tCombo"><p class="cab-sup"><a class="atras" href="#grilla">‹ Grilla</a></p>
    <h2 id="tCombo" class="combo-t">${ids.map((i) => circuloDeco(i)).join("")}<span>${esc(etiqueta(ids))}</span></h2>
    <div id="cBody"><p class="sub">Cargando…</p></div></section>`;
  document.title = `${etiqueta(ids)} · Conjugarnos`;
  await actualizar();
}

export async function actualizar() {
  const mia = ++ficha;
  let f, g;
  try { [f, g] = await Promise.all([R("combinacion", partes()), R("grilla")]); }
  catch (e) { if (mia === ficha && $("#cBody")) $("#cBody").innerHTML = `<p class="nota mal" role="alert">${esc(mensaje(e))}</p>`; return; }
  if (mia !== ficha || !$("#cBody")) return;
  const estado = capturar();
  filas = f; grilla = g;
  pintar();
  restaurar(estado);
}

// ---- lo que hay que conservar al volver a dibujar ----
function capturar() {
  const borradores = {};
  $$(".v-motivo:not([hidden])").forEach((f) => { borradores[f.closest(".tx").dataset.v] = { valor: f.querySelector("input").value, foco: document.activeElement === f.querySelector("input") }; });
  return { y: scrollY, borradores };
}
function restaurar({ y, borradores }) {
  for (const [v, b] of Object.entries(borradores)) {
    const tx = $(`.tx[data-v="${CSS.escape(v)}"]`);
    if (!tx) continue;
    const f = tx.querySelector(".v-motivo"), i = f.querySelector("input");
    f.hidden = false; i.value = b.valor;
    tx.querySelector('[data-voto="contra"]').setAttribute("aria-expanded", "true");
    if (b.foco) i.focus({ preventScroll: true });
  }
  scrollTo({ top: y, behavior: "instant" });
}

// ---- dibujo ----
function resumenEstado(f) {
  const nf = f.favor.length, nc = f.contra.length;
  if (f.forzado) return `Validado por ${f.forzado_por ? f.forzado_por + " (admin)" : "el admin"} · ${nf} a favor${nc ? ` y ${nc} en contra` : ""}`;
  if (f.estado === "validado") return nc ? `Validado · ${nf} a favor y ${nc} en contra` : `Validado · ${nf} a favor`;
  const k = faltan(nf, nc, grupo());
  return `${nf} a favor y ${nc} en contra · faltan ${plural(k, "voto", "votos")} a favor para validar`;
}

function tarjeta(f) {
  const t = f.texto, mio = f.mi_voto, id = f.vinculo_id;
  const largo = t.palabras > 90, abierto = abiertos.has(id) || !largo;
  const otrosVotos = [...f.favor, ...f.contra].some((v) => v.nombre !== yo().nombre);
  const puedeEditar = esAdmin() || t.cargado_por_id === yo().id;
  const puedeQuitar = esAdmin() || (t.cargado_por_id === yo().id && !otrosVotos);
  return `<article class="tx ${f.estado}" data-v="${id}" data-t="${t.id}" aria-labelledby="tt-${id}">
    <header class="tx-cab"><h4 class="tx-tit" id="tt-${id}">${esc(t.titulo)}</h4><span class="pill ${f.estado}">${f.estado === "validado" ? "Validado" : "En debate"}</span></header>
    <p class="tx-meta"><span class="mp-au">${esc(t.autor)}</span></p>
    <p class="tx-meta menor">${plural(t.palabras, "palabra", "palabras")} · cargado por ${esc(t.cargado_por || "alguien que ya no está")}${t.editado ? " · editado" : ""}</p>
    ${t.retiro_pedido ? `<p class="nota" role="note">Se pidió retirar este texto${t.retiro_motivo ? `: ${esc(t.retiro_motivo)}` : ""}. Lo decide quien administra el grupo.</p>` : ""}
    <div class="tx-cuerpo cmb-text${abierto ? " abierto" : ""}" id="cu-${id}">${cuerpoHTML(t.cuerpo)}</div>
    ${largo ? `<button type="button" class="enlace leer" data-leer aria-expanded="${abierto}" aria-controls="cu-${id}">${abierto ? "Mostrar menos" : `Leer completo (${t.palabras} palabras)`}</button>` : ""}
    <div class="votos">
      <p class="v-resumen">${esc(resumenEstado(f))}</p>
      <div class="v-botones">
        <button type="button" class="voto favor" data-voto="favor" aria-pressed="${mio === "favor"}">A favor</button>
        <button type="button" class="voto contra" data-voto="contra" aria-pressed="${mio === "contra"}" aria-expanded="false">En contra</button>
        ${mio ? `<button type="button" class="enlace" data-quitar>Quitar mi voto</button>` : ""}
      </div>
      ${esAdmin() ? `<p class="v-admin"><span class="menor">Admin:</span>
        ${f.forzado ? `<button type="button" class="enlace" data-devolver>Devolver a debate</button>`
          : f.estado !== "validado" ? `<button type="button" class="boton sec" data-validar>Validar ahora</button> <span class="menor">Tu voto alcanza: queda validado sin esperar a los demás.</span>` : ""}</p>` : ""}
      <form class="v-motivo" hidden><label class="campo"><span>Motivo, en una línea</span>
        <input maxlength="200" autocomplete="off" value="${esc(mio === "contra" ? f.mi_motivo || "" : "")}"></label>
        <div class="v-motivo-b"><button type="submit" class="boton">Votar en contra</button><button type="button" class="boton sec" data-cancelar>Cancelar</button></div>
        <p class="error" role="alert" hidden></p></form>
      ${f.favor.length ? `<p class="v-quienes"><b>A favor:</b> ${f.favor.map((v) => esc(v.nombre)).join(", ")}</p>` : ""}
      ${f.contra.length ? `<ul class="v-contra">${f.contra.map((v) => `<li><b>${esc(v.nombre)}</b> en contra: ${esc(v.motivo || "")}</li>`).join("")}</ul>` : ""}
    </div>
    <details class="menu"><summary>Más</summary><div class="menu-b">
      ${puedeEditar ? `<button type="button" class="enlace" data-acc="editar">Editar el texto</button>` : ""}
      <button type="button" class="enlace" data-acc="agregar">Proponerlo para otra combinación</button>
      ${t.retiro_pedido ? (esAdmin() ? `<button type="button" class="enlace" data-acc="descartar">Dejarlo (descartar el pedido)</button>` : "") : `<button type="button" class="enlace" data-acc="retiro">Pedir que se retire</button>`}
      ${puedeQuitar ? `<button type="button" class="enlace" data-acc="quitar">Sacarlo de esta combinación</button>` : ""}
      ${esAdmin() ? `<button type="button" class="enlace peligro" data-acc="borrar">Borrar el texto del grupo</button>` : ""}
    </div></details>
  </article>`;
}

function pintar() {
  const val = filas.filter((f) => f.estado === "validado"), deb = filas.filter((f) => f.estado !== "validado");
  const cuenta = new Map(grilla.map((g) => [llave(g.a, g.b), g]));
  let lateral = "";
  if (pidePrestado()) {
    const a = ids[0];
    const chips = PLANETAS.filter((p) => p !== a).map((p) => {
      const par = PLANETAS.indexOf(a) < PLANETAS.indexOf(p) ? [a, p] : [p, a];
      const g = cuenta.get(llave(par[0], par[1]));
      const n = g ? g.validados : 0, d = g ? g.debate : 0;
      const dice = n || d ? ` <span class="chip-n">${n || d}${n ? "" : " en debate"}</span>` : "";
      return `<a class="chip${n ? " con" : d ? " deb" : ""}" href="#c/${enRuta(par)}">${etiqueta(par)}${dice}</a>`;
    }).join("");
    lateral = `<section class="parejas" aria-labelledby="tPar"><h3 id="tPar">Parejas con ${NOMBRE[a]}</h3><div class="chips">${chips}</div></section>`;
  } else {
    lateral = `<p class="ver-tambien">Ver también: ${ids.map((i) => `<a class="chip" href="#c/${i}">${NOMBRE[i]} solo</a>`).join(" ")}</p>`;
  }
  const hayParejas = pidePrestado() && grilla.some((g) => g.b && (g.a === ids[0] || g.b === ids[0]));
  const vacio = filas.length ? ""
    : hayParejas ? `<p class="vacio-msg">Todavía no hay textos solo para <strong>${esc(etiqueta(ids))}</strong>. Abajo están sus parejas; y si tenés uno que le quede bien a este planeta solo, proponelo.</p>`
    : `<p class="vacio-msg">Todavía no hay ningún texto para <strong>${esc(etiqueta(ids))}</strong>. ¿Tenés uno que le quede bien? Proponelo: tu voto a favor ya cuenta, y los demás pueden sumarse.</p>`;
  $("#cBody").innerHTML = `
    <p class="sub">${val.length ? plural(val.length, "texto validado", "textos validados") : "Sin textos validados"}${deb.length ? ` · ${deb.length} en debate` : ""}</p>
    <p class="acciones"><a class="boton" href="#proponer/${enRuta(ids)}">Proponer un texto</a>
      ${val.length ? `<button type="button" class="boton sec" id="azar">${val.length > 1 ? "Un texto al azar" : "Ir al texto validado"}</button>` : ""}</p>
    ${vacio}
    ${val.length ? `<h3 class="seccion">Validados <span>${val.length}</span></h3><div class="lista">${val.map(tarjeta).join("")}</div>` : ""}
    ${deb.length ? `<h3 class="seccion">En debate <span>${deb.length}</span></h3><div class="lista">${deb.map(tarjeta).join("")}</div>` : ""}
    ${lateral}`;
  // lo que cambió desde la última vez, marcado un momento
  const nuevas = new Map();
  for (const f of filas) {
    const firma = `${f.estado}|${f.forzado ? "a" : ""}|${f.favor.length}|${f.contra.length}`;
    nuevas.set(f.vinculo_id, firma);
    if (!primera && firmas.get(f.vinculo_id) !== firma) marcar(f.vinculo_id);
  }
  firmas = nuevas; primera = false;
  conectar();
}

function marcar(v) {
  const tx = $(`.tx[data-v="${CSS.escape(v)}"]`);
  if (!tx || reducido()) return;
  tx.classList.add("cambio");
  setTimeout(() => tx.classList.remove("cambio"), 1800);
}

// ---- acciones ----
function conectar() {
  const cuerpo = $("#cBody");
  cuerpo.onclick = async (e) => {
    const tx = e.target.closest(".tx");
    if (e.target.closest("#azar")) return azar();
    if (!tx) return;
    const v = tx.dataset.v, f = filas.find((x) => x.vinculo_id === v);
    if (!f) return;
    if (e.target.closest("[data-leer]")) return alternar(tx, v);
    const voto = e.target.closest("[data-voto]");
    if (voto) return voto.dataset.voto === "favor" ? votar(v, "favor") : motivo(tx, f);
    if (e.target.closest("[data-cancelar]")) return cerrarMotivo(tx);
    if (e.target.closest("[data-quitar]")) return quitarVoto(v);
    if (e.target.closest("[data-validar]")) return validarYa(f);
    if (e.target.closest("[data-devolver]")) return devolver(f);
    const acc = e.target.closest("[data-acc]");
    if (acc) { tx.querySelector(".menu").open = false; return accion(acc.dataset.acc, f); }
  };
  cuerpo.onsubmit = async (e) => {
    const form = e.target.closest(".v-motivo");
    if (!form) return;
    e.preventDefault();
    const tx = form.closest(".tx"), texto = form.querySelector("input").value.trim();
    const er = form.querySelector(".error");
    if (!texto) { er.textContent = "Escribí el motivo."; er.hidden = false; return; }
    er.hidden = true;
    await votar(tx.dataset.v, "contra", texto);
  };
}

function alternar(tx, v) {
  const cu = tx.querySelector(".tx-cuerpo"), b = tx.querySelector("[data-leer]");
  const abrir = !cu.classList.contains("abierto");
  cu.classList.toggle("abierto", abrir);
  if (abrir) abiertos.add(v); else abiertos.delete(v);
  b.setAttribute("aria-expanded", String(abrir));
  b.textContent = abrir ? "Mostrar menos" : `Leer completo (${filas.find((x) => x.vinculo_id === v).texto.palabras} palabras)`;
}

function motivo(tx, f) {
  const form = tx.querySelector(".v-motivo"), btn = tx.querySelector('[data-voto="contra"]');
  form.hidden = false; btn.setAttribute("aria-expanded", "true");
  form.querySelector("input").focus();
}
function cerrarMotivo(tx) {
  tx.querySelector(".v-motivo").hidden = true;
  const b = tx.querySelector('[data-voto="contra"]'); b.setAttribute("aria-expanded", "false"); b.focus();
}

async function votar(v, valor, texto = null) {
  const antes = filas.find((x) => x.vinculo_id === v);
  try {
    const r = await R("votar", { p_vinculo: v, p_valor: valor, p_motivo: texto });
    if (r.estado === "validado" && antes && antes.estado !== "validado") aviso("Quedó validado. ¡Ya entra en el azar de esta combinación!");
    else if (r.estado !== "validado" && antes && antes.estado === "validado") aviso("Volvió a «en debate»: ya no llega a la mitad de votos a favor.");
    else aviso(valor === "favor" ? "Votaste a favor." : "Votaste en contra.");
  } catch (e) { aviso(mensaje(e), "mal"); }
  await actualizar();
}
async function quitarVoto(v) {
  try { await R("quitar_voto", { p_vinculo: v }); aviso("Quitaste tu voto."); } catch (e) { aviso(mensaje(e), "mal"); }
  await actualizar();
}

// Quien administra: validar sin esperar los votos, o devolver a debate lo que validó así.
async function validarYa(f) {
  const t = f.texto;
  if (!(await confirmar({ titulo: "Validar ahora", texto: `«${t.titulo}» queda validado para ${etiqueta(ids)} sin esperar los votos, y tu voto cuenta a favor. Los demás pueden seguir votando, pero ya no lo mueven. Cuando quieras lo devolvés a debate.`, ok: "Validar" }))) return;
  try { await R("validar_ya", { p_vinculo: f.vinculo_id }); aviso("Quedó validado por vos. Ya entra en el azar de esta combinación."); }
  catch (e) { aviso(mensaje(e), "mal"); }
  await actualizar();
}
async function devolver(f) {
  try {
    const r = await R("quitar_validacion", { p_vinculo: f.vinculo_id });
    aviso(r.estado === "validado" ? "Sigue validado: los votos solos alcanzan." : "Volvió a «en debate»: ahora se juzga solo por los votos.");
  } catch (e) { aviso(mensaje(e), "mal"); }
  await actualizar();
}

function azar() {
  const val = filas.filter((f) => f.estado === "validado");
  if (!val.length) return;
  let pool = val.filter((f) => f.vinculo_id !== ultimaAzar);
  if (!pool.length) pool = val;
  const f = pool[Math.floor(Math.random() * pool.length)];
  ultimaAzar = f.vinculo_id;
  abiertos.add(f.vinculo_id);
  const tx = $(`.tx[data-v="${CSS.escape(f.vinculo_id)}"]`);
  if (!tx) return;
  tx.querySelector(".tx-cuerpo").classList.add("abierto");
  const b = tx.querySelector("[data-leer]");
  if (b) { b.setAttribute("aria-expanded", "true"); b.textContent = "Mostrar menos"; }
  tx.scrollIntoView({ block: "start", behavior: reducido() ? "auto" : "smooth" });
  const h = tx.querySelector(".tx-tit"); h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true });
  marcar(f.vinculo_id);
  aviso(`${f.texto.titulo}, de ${f.texto.autor}.`);
}

async function accion(que, f) {
  const t = f.texto;
  try {
    if (que === "editar") { E.editando = { texto: t, volver: location.hash, forzado: !!f.forzado }; location.hash = "#editar"; return; }
    if (que === "agregar") return agregar(t);
    if (que === "retiro") {
      const m = await pedirTexto({ titulo: "Pedir que se retire este texto", ayuda: "Lo ven todos y lo decide quien administra el grupo.", etiqueta: "Motivo", ok: "Pedir retiro", max: 300 });
      if (m === null) return;
      await R("pedir_retiro", { p_texto: t.id, p_motivo: m || null }); aviso("Listo, se pidió el retiro.");
    }
    if (que === "descartar") { await R("descartar_pedido", { p_texto: t.id }); aviso("Se descartó el pedido."); }
    if (que === "quitar") {
      if (!(await confirmar({ titulo: "Sacar de esta combinación", texto: `«${t.titulo}» deja de estar propuesto para ${etiqueta(ids)}. Si no está en otra combinación, se borra.`, ok: "Sacarlo", peligro: true }))) return;
      await R("quitar_combinacion", { p_vinculo: f.vinculo_id }); aviso("Listo, se sacó de esta combinación.");
    }
    if (que === "borrar") {
      if (!(await confirmar({ titulo: "Borrar el texto", texto: `«${t.titulo}» se borra de todas las combinaciones, con sus votos. No se puede deshacer.`, ok: "Borrar", peligro: true }))) return;
      await R("borrar_texto", { p_texto: t.id }); aviso("Texto borrado.");
    }
  } catch (e) { aviso(mensaje(e), "mal"); }
  await actualizar();
}

function agregar(t) {
  return dialogo(`<form method="dialog" class="dlg-f"><h2>Proponer «${esc(t.titulo)}» para otra combinación</h2>
    <p>Elegí uno o dos planetas.</p><div id="dSel"></div><p class="error" id="dErr" role="alert" hidden></p>
    <div class="dlg-b"><button type="button" class="boton sec" data-cerrar>Cancelar</button><button type="submit" class="boton" id="dOk" disabled>Proponer</button></div></form>`, {
    ancho: true,
    alMontar: (d, cerrar) => {
      const sel = selectorPlanetas($("#dSel", d), { max: 2, alCambiar: (e) => { $("#dOk", d).disabled = !e.length; } });
      d.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const c = sel.obtener();
        if (!c.length) return;
        try {
          await R("agregar_combinacion", { p_texto: t.id, p_a: c[0], p_b: c[1] || null });
          cerrar(c);
        } catch (x) { const er = $("#dErr", d); er.textContent = mensaje(x); er.hidden = false; }
      });
    },
  }).then(async (c) => { if (c) { aviso(`Propuesto para ${etiqueta(c)}.`); await actualizar(); } });
}
