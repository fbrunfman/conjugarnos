// Una combinación: todos sus textos, completos: primero los validados y después los que están en debate, con los votos de cada uno.
// Se actualiza sola cuando alguien del grupo vota o propone; al volver a dibujar se conserva lo que estabas haciendo
// (qué textos habías cerrado, qué comentarios tenías desplegados, el menú «Más» abierto, un motivo o un comentario a medio escribir, dónde estabas parado en la página).
import { R, E, yo, grupo, esAdmin } from "./estado.js";
import { mensaje } from "./api.js";
import { PLANETAS, NOMBRE, circuloDeco, etiqueta, enRuta, llave } from "./planetas.js";
import { selectorPlanetas } from "./selector.js";
import { esc, $, $$, aviso, plural, hace, confirmar, pedirTexto, dialogo, cuerpoHTML, faltan, reducido } from "./ui.js";
import { claseDe, enlaceSeguro } from "./clases.js";

let raiz = null, ids = [], filas = [], grilla = [], ficha = 0;
const cerrados = new Set();          // vínculos cuyo texto largo cerraste vos (por defecto se ve todo completo)
const charlando = new Set();         // vínculos con los comentarios desplegados (por defecto están plegados)
let firmas = new Map();              // vínculo → «estado|a favor|en contra», para marcar lo que cambió
let primera = true;

const pidePrestado = () => ids.length === 1;
const partes = () => ({ p_a: ids[0], p_b: ids[1] || null });

export async function montar(el, combo) {
  raiz = el; ids = combo; filas = []; grilla = []; firmas = new Map(); primera = true;
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
  const comentarios = {};
  $$(".com-form textarea").forEach((t) => { if (t.value || document.activeElement === t) comentarios[t.closest(".tx").dataset.v] = { valor: t.value, foco: document.activeElement === t }; });
  const menus = $$(".tx .menu[open]").map((m) => m.closest(".tx").dataset.v);   // los «Más» que tenías abiertos
  return { y: scrollY, borradores, comentarios, menus };
}
function restaurar({ y, borradores, comentarios, menus }) {
  for (const v of menus) { const m = $(`.tx[data-v="${CSS.escape(v)}"] .menu`); if (m) m.open = true; }
  for (const [v, b] of Object.entries(borradores)) {
    const tx = $(`.tx[data-v="${CSS.escape(v)}"]`);
    if (!tx) continue;
    const f = tx.querySelector(".v-motivo"), i = f.querySelector("input");
    f.hidden = false; i.value = b.valor;
    tx.querySelector('[data-voto="contra"]').setAttribute("aria-expanded", "true");
    if (b.foco) i.focus({ preventScroll: true });
  }
  for (const [v, b] of Object.entries(comentarios)) {
    const t = $(`.tx[data-v="${CSS.escape(v)}"] .com-form textarea`);
    if (!t) continue;
    t.value = b.valor;
    if (b.foco) t.focus({ preventScroll: true });
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

const BURBUJA = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 4.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9.5L6 20.8v-4.3H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z"/></svg>`;

/** Los comentarios del texto y la casilla para escribir uno. Solo se dibuja cuando están desplegados. */
function panelComentarios(f) {
  const t = f.texto, lista = t.comentarios || [];
  return `<div class="coment">
    ${lista.length ? `<ul class="com-lista">${lista.map((c) => `<li data-c="${c.id}">
      <p class="com-meta"><b>${esc(c.quien || "Alguien que ya no está")}</b> · ${esc(hace(c.creado))}${esAdmin() || c.quien_id === yo().id ? ` · <button type="button" class="enlace peligro" data-borrar-com="${c.id}">Borrar</button>` : ""}</p>
      <p class="com-cuerpo">${esc(c.cuerpo)}</p></li>`).join("")}</ul>` : `<p class="menor com-vacio">Todavía no hay comentarios.</p>`}
    <form class="com-form"><label class="campo"><span class="vh">Tu comentario</span>
      <textarea rows="2" maxlength="1000" placeholder="Escribí un comentario…"></textarea></label>
      <div class="com-b"><button type="submit" class="boton">Comentar</button>
        <span class="menor">Es de todo el aporte: se ve en todas las combinaciones donde está.</span></div>
      <p class="error" role="alert" hidden></p></form>
  </div>`;
}

function tarjeta(f) {
  const t = f.texto, mio = f.mi_voto, id = f.vinculo_id;
  const cl = claseDe(t), hayCuerpo = !!(t.cuerpo && t.cuerpo.trim()), enlace = enlaceSeguro(t.enlace);
  const largo = hayCuerpo && t.palabras > 90, abierto = !cerrados.has(id) || !largo;
  const otrosVotos = [...f.favor, ...f.contra].some((v) => v.nombre !== yo().nombre);
  const nCom = (t.comentarios || []).length;
  const puedeEditar = esAdmin() || t.cargado_por_id === yo().id;
  const puedeJustificar = esAdmin() || f.propuesto_por_id === yo().id;
  const puedeQuitar = esAdmin() || (t.cargado_por_id === yo().id && !otrosVotos);
  return `<article class="tx ${f.estado}" data-v="${id}" data-t="${t.id}" aria-labelledby="tt-${id}">
    <header class="tx-cab"><h4 class="tx-tit" id="tt-${id}">${esc(t.titulo)}</h4><span class="pill ${f.estado}">${f.estado === "validado" ? "Validado" : "En debate"}</span></header>
    <p class="tx-meta">${t.clase && t.clase !== "texto" ? `<span class="clase-et">${esc(cl.nombre)}</span> ${cl.de ? esc(cl.de) + " " : ""}` : ""}<span class="mp-au">${esc(t.autor)}</span></p>
    <p class="tx-meta menor">${hayCuerpo ? `${plural(t.palabras, "palabra", "palabras")} · ` : ""}cargado por ${esc(t.cargado_por || "alguien que ya no está")}${t.editado ? " · editado" : ""}</p>
    ${t.retiro_pedido ? `<p class="nota" role="note">Se pidió retirar este aporte${t.retiro_motivo ? `: ${esc(t.retiro_motivo)}` : ""}. Lo decide quien administra el grupo.</p>` : ""}
    ${f.justificacion ? `<div class="tx-just"><p class="tx-just-t">Justificación de ${esc(f.propuesto_por || "quien lo propuso")}</p><p class="tx-just-c">${esc(f.justificacion)}</p></div>` : ""}
    ${enlace ? `<p class="tx-enlace"><a class="boton sec" href="${esc(enlace.href)}" target="_blank" rel="noopener noreferrer">${esc(cl.enlaceVerbo || "Abrir")} <span class="flecha" aria-hidden="true">↗</span><span class="vh"> (se abre en otra pestaña)</span></a><span class="menor">${esc(enlace.dominio)}</span></p>` : ""}
    ${hayCuerpo ? `<div class="tx-cuerpo cmb-text${abierto ? " abierto" : ""}" id="cu-${id}">${cuerpoHTML(t.cuerpo)}</div>` : ""}
    <div class="tx-pie">
      ${largo ? `<button type="button" class="enlace leer" data-leer aria-expanded="${abierto}" aria-controls="cu-${id}">${abierto ? "Mostrar menos" : `Leer completo (${t.palabras} palabras)`}</button>` : ""}
      <button type="button" class="com-btn" data-coment aria-expanded="${charlando.has(id)}" aria-controls="co-${id}" aria-label="Comentarios${nCom ? ` (${nCom})` : ""}" title="${nCom ? plural(nCom, "comentario", "comentarios") : "Comentar"}">${BURBUJA}${nCom ? `<span class="com-n">${nCom}</span>` : ""}</button>
    </div>
    <div class="com-hueco" id="co-${id}">${charlando.has(id) ? panelComentarios(f) : ""}</div>
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
      ${puedeEditar ? `<button type="button" class="enlace" data-acc="editar">Editar</button>` : ""}
      ${puedeJustificar ? `<button type="button" class="enlace" data-acc="justificar">${f.justificacion ? "Cambiar la justificación" : "Agregar una justificación"}</button>` : ""}
      <button type="button" class="enlace" data-acc="agregar">Proponerlo para otra combinación</button>
      ${t.retiro_pedido ? (esAdmin() ? `<button type="button" class="enlace" data-acc="descartar">Dejarlo (descartar el pedido)</button>` : "") : `<button type="button" class="enlace" data-acc="retiro">Pedir que se retire</button>`}
      ${puedeQuitar ? `<button type="button" class="enlace" data-acc="quitar">Sacarlo de esta combinación</button>` : ""}
      ${esAdmin() ? `<button type="button" class="enlace peligro" data-acc="borrar">Borrar del grupo</button>` : ""}
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
    : hayParejas ? `<p class="vacio-msg">Todavía no hay nada solo para <strong>${esc(etiqueta(ids))}</strong>. Abajo están sus parejas; y si tenés algo que le quede bien a este planeta solo, proponelo.</p>`
    : `<p class="vacio-msg">Todavía no hay nada para <strong>${esc(etiqueta(ids))}</strong>. ¿Tenés un texto, una biografía, una película o una canción que le quede bien? Proponelo: tu voto a favor ya cuenta, y los demás pueden sumarse.</p>`;
  $("#cBody").innerHTML = `
    <p class="sub">${val.length ? plural(val.length, "aporte validado", "aportes validados") : "Sin aportes validados"}${deb.length ? ` · ${deb.length} en debate` : ""}</p>
    <p class="acciones"><a class="boton" href="#proponer/${enRuta(ids)}">Proponer para esta combinación</a></p>
    ${vacio}
    ${val.length ? `<h3 class="seccion">Validados <span>${val.length}</span></h3><div class="lista">${val.map(tarjeta).join("")}</div>` : ""}
    ${deb.length ? `<h3 class="seccion">En debate <span>${deb.length}</span></h3><div class="lista">${deb.map(tarjeta).join("")}</div>` : ""}
    ${lateral}`;
  // lo que cambió desde la última vez, marcado un momento
  const nuevas = new Map();
  for (const f of filas) {
    const firma = `${f.estado}|${f.forzado ? "a" : ""}|${f.favor.length}|${f.contra.length}|${(f.texto.comentarios || []).length}|${(f.justificacion || "").length}`;
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
    if (!tx) return;
    const v = tx.dataset.v, f = filas.find((x) => x.vinculo_id === v);
    if (!f) return;
    if (e.target.closest("[data-leer]")) return alternar(tx, v);
    if (e.target.closest("[data-coment]")) return alternarComentarios(tx, f);
    const borrarCom = e.target.closest("[data-borrar-com]");
    if (borrarCom) return borrarComentario(borrarCom.dataset.borrarCom);
    const voto = e.target.closest("[data-voto]");
    if (voto) return voto.dataset.voto === "favor" ? votar(v, "favor") : motivo(tx, f);
    if (e.target.closest("[data-cancelar]")) return cerrarMotivo(tx);
    if (e.target.closest("[data-quitar]")) return quitarVoto(v);
    if (e.target.closest("[data-validar]")) return validarYa(f);
    if (e.target.closest("[data-devolver]")) return devolver(f);
    const acc = e.target.closest("[data-acc]");
    if (acc) { tx.querySelector(".menu").open = false; return accion(acc.dataset.acc, f); }
  };
  cuerpo.onkeydown = (e) => {    // Cmd/Ctrl + Enter envía el comentario
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.target.matches(".com-form textarea")) { e.preventDefault(); e.target.form.requestSubmit(); }
  };
  cuerpo.onsubmit = async (e) => {
    const comentario = e.target.closest(".com-form");
    if (comentario) { e.preventDefault(); return comentar(comentario); }
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
  if (abrir) cerrados.delete(v); else cerrados.add(v);
  b.setAttribute("aria-expanded", String(abrir));
  b.textContent = abrir ? "Mostrar menos" : `Leer completo (${filas.find((x) => x.vinculo_id === v).texto.palabras} palabras)`;
}

// ---- comentarios: plegados por defecto; el ícono los despliega ----
function alternarComentarios(tx, f) {
  const v = f.vinculo_id, btn = tx.querySelector("[data-coment]"), hueco = tx.querySelector(".com-hueco");
  const abrir = !charlando.has(v);
  if (abrir) charlando.add(v); else charlando.delete(v);
  btn.setAttribute("aria-expanded", String(abrir));
  hueco.innerHTML = abrir ? panelComentarios(f) : "";
}
async function comentar(form) {
  const tx = form.closest(".tx"), f = filas.find((x) => x.vinculo_id === tx.dataset.v);
  const area = form.querySelector("textarea"), er = form.querySelector(".error"), boton = form.querySelector('button[type="submit"]');
  const cuerpo = area.value.trim();
  if (!f) return;
  if (!cuerpo) { er.textContent = "Escribí el comentario."; er.hidden = false; return; }
  er.hidden = true; boton.disabled = true;
  try {
    await R("comentar", { p_texto: f.texto.id, p_cuerpo: cuerpo });
    area.value = ""; area.focus({ preventScroll: true });   // vacío y con el foco: así el próximo dibujo no vuelve a poner lo enviado
    aviso("Comentario agregado.");
  } catch (x) { boton.disabled = false; er.textContent = mensaje(x); er.hidden = false; return; }
  await actualizar();
}
async function borrarComentario(id) {
  if (!(await confirmar({ titulo: "Borrar el comentario", texto: "Se borra para todo el grupo. No se puede deshacer.", ok: "Borrar", peligro: true }))) return;
  try { await R("borrar_comentario", { p_comentario: id }); aviso("Comentario borrado."); } catch (e) { aviso(mensaje(e), "mal"); }
  await actualizar();
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
    if (r.estado === "validado" && antes && antes.estado !== "validado") aviso("Quedó validado.");
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
  try { await R("validar_ya", { p_vinculo: f.vinculo_id }); aviso("Quedó validado por vos."); }
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

async function accion(que, f) {
  const t = f.texto;
  try {
    if (que === "editar") { E.editando = { texto: t, volver: location.hash, forzado: !!f.forzado }; location.hash = "#editar"; return; }
    if (que === "agregar") return agregar(t);
    if (que === "justificar") {
      const j = await pedirJustificacion(f);
      if (j === null) return;
      await R("justificar", { p_vinculo: f.vinculo_id, p_justificacion: j });
      aviso(j ? "Guardada la justificación." : "Se quitó la justificación.");
    }
    if (que === "retiro") {
      const m = await pedirTexto({ titulo: "Pedir que se retire este aporte", ayuda: "Lo ven todos y lo decide quien administra el grupo.", etiqueta: "Motivo", ok: "Pedir retiro", max: 300 });
      if (m === null) return;
      await R("pedir_retiro", { p_texto: t.id, p_motivo: m || null }); aviso("Listo, se pidió el retiro.");
    }
    if (que === "descartar") { await R("descartar_pedido", { p_texto: t.id }); aviso("Se descartó el pedido."); }
    if (que === "quitar") {
      if (!(await confirmar({ titulo: "Sacar de esta combinación", texto: `«${t.titulo}» deja de estar propuesto para ${etiqueta(ids)}. Si no está en otra combinación, se borra.`, ok: "Sacarlo", peligro: true }))) return;
      await R("quitar_combinacion", { p_vinculo: f.vinculo_id }); aviso("Listo, se sacó de esta combinación.");
    }
    if (que === "borrar") {
      if (!(await confirmar({ titulo: "Borrar del grupo", texto: `«${t.titulo}» se borra de todas las combinaciones, con sus votos y comentarios. No se puede deshacer.`, ok: "Borrar", peligro: true }))) return;
      await R("borrar_texto", { p_texto: t.id }); aviso("Borrado.");
    }
  } catch (e) { aviso(mensaje(e), "mal"); }
  await actualizar();
}

/** Pide la justificación de un texto en esta combinación. Devuelve el texto (vacío = sin justificación), o null si se cancela. */
function pedirJustificacion(f) {
  return dialogo(`<form method="dialog" class="dlg-f"><h2>Justificación</h2>
    <p>Por qué «${esc(f.texto.titulo)}» va con ${esc(etiqueta(ids))}. Se muestra junto a lo que se propuso, firmada con el nombre de quien lo propuso. Si la dejás vacía, se saca.</p>
    <label class="campo"><span>Justificación (opcional)</span><textarea name="j" rows="5" maxlength="500" placeholder="Lo agrego porque…" autofocus>${esc(f.justificacion || "")}</textarea></label>
    <div class="dlg-b"><button type="button" class="boton sec" data-cerrar>Cancelar</button><button type="submit" class="boton">Guardar</button></div></form>`, {
    alMontar: (d, cerrar) => d.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); cerrar(d.querySelector("textarea").value.trim()); }),
  });
}

function agregar(t) {
  return dialogo(`<form method="dialog" class="dlg-f"><h2>Proponer «${esc(t.titulo)}» para otra combinación</h2>
    <p>Elegí uno o dos planetas.</p><div id="dSel"></div>
    <label class="campo"><span>Justificación (opcional)</span><textarea name="j" rows="3" maxlength="500" placeholder="Lo agrego porque…"></textarea></label>
    <p class="error" id="dErr" role="alert" hidden></p>
    <div class="dlg-b"><button type="button" class="boton sec" data-cerrar>Cancelar</button><button type="submit" class="boton" id="dOk" disabled>Proponer</button></div></form>`, {
    ancho: true,
    alMontar: (d, cerrar) => {
      const sel = selectorPlanetas($("#dSel", d), { max: 2, alCambiar: (e) => { $("#dOk", d).disabled = !e.length; } });
      d.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const c = sel.obtener();
        if (!c.length) return;
        try {
          const j = d.querySelector('textarea[name="j"]').value.trim();
          await R("agregar_combinacion", { p_texto: t.id, p_a: c[0], p_b: c[1] || null, ...(j ? { p_justificacion: j } : {}) });
          cerrar(c);
        } catch (x) { const er = $("#dErr", d); er.textContent = mensaje(x); er.hidden = false; }
      });
    },
  }).then(async (c) => { if (c) { aviso(`Propuesto para ${etiqueta(c)}.`); await actualizar(); } });
}
