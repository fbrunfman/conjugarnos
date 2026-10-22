// El grupo: quiénes están, el link de invitación, el umbral para validar, lo último que pasó, los pedidos de retiro
// y la copia de seguridad. Quien administra puede ajustar el umbral, expulsar y descargar todo.
import { R, E, yo, grupo, esAdmin, volverLink, invitacionLink, cerrarSesion, ponerSesion } from "./estado.js";
import { mensaje } from "./api.js";
import { etiqueta, enRuta } from "./planetas.js";
import { esc, $, aviso, plural, hace, copiar, descargar, confirmar } from "./ui.js";

let raiz = null, ficha = 0, estadoVivo = "consulta";

const FRACCIONES = [[1, 2, "la mitad"], [3, 5, "3 de cada 5"], [2, 3, "2 de cada 3"], [3, 4, "3 de cada 4"], [4, 5, "4 de cada 5"], [1, 1, "todos"]];
const fraccion = (n, d) => (FRACCIONES.find((f) => f[0] === n && f[1] === d) || [n, d, `${n}/${d}`])[2];

export function ponerEstadoVivo(e) { estadoVivo = e; const s = $("#gVivo"); if (s) s.textContent = textoVivo(); }
const textoVivo = () => estadoVivo === "vivo" ? "Conectado: los cambios aparecen al instante." : estadoVivo === "sin-red" ? "Sin conexión a internet." : "Los cambios se buscan cada tanto (el tiempo real no está conectado).";

export async function montar(el) {
  raiz = el;
  raiz.innerHTML = `<section class="pantalla" aria-labelledby="tGrupo"><header class="cab"><h2 id="tGrupo">${esc(grupo().nombre)}</h2>
    <p class="sub">Vos sos <strong>${esc(yo().nombre)}</strong>${esAdmin() ? " · administrás el grupo" : ""}.</p></header><div id="gpBody"><p class="sub">Cargando…</p></div></section>`;
  document.title = `${grupo().nombre} · Conjugarnos`;
  await actualizar();
}

export async function actualizar() {
  const mia = ++ficha;
  let ses, mi, act, ret = [];
  try {
    [ses, mi, act] = await Promise.all([R("sesion"), R("miembros"), R("actividad", { p_n: 30 })]);
    if (esAdmin()) ret = await R("retiros");
  } catch (e) { if (mia === ficha && $("#gpBody")) $("#gpBody").innerHTML = `<p class="nota mal" role="alert">${esc(mensaje(e))}</p>`; return; }
  if (mia !== ficha || !$("#gpBody")) return;
  ponerSesion(E.clave, ses);          // el umbral pudo cambiar
  pintar(mi, act, ret);
}

const frase = (a) => {
  const c = a.b ? [a.a, a.b] : [a.a];
  if (a.tipo === "texto") return `<b>${esc(a.quien || "Alguien que ya no está")}</b> propuso «${esc(a.titulo)}»`;
  if (a.tipo === "validacion") return `<b>${esc(a.quien || "El admin")}</b> validó «${esc(a.titulo)}» para <a href="#c/${enRuta(c)}">${esc(etiqueta(c))}</a> por su cuenta`;
  return `<b>${esc(a.quien)}</b> votó ${a.valor === "favor" ? "a favor" : "en contra"} de «${esc(a.titulo)}» para <a href="#c/${enRuta(c)}">${esc(etiqueta(c))}</a>${a.estado === "validado" ? " · validado" : ""}`;
};

function pintar(miembros, actividad, retiros) {
  const g = grupo(), inv = invitacionLink();
  const admin = esAdmin();
  const umbral = `Un texto se valida con <b>${g.umbral_votos}</b> votos a favor y al menos <b>${fraccion(g.umbral_num, g.umbral_den)}</b> de los votos a favor. Vuelve a «en debate» si baja de la mitad. Quien administra también puede validar un texto por su cuenta: queda marcado como «validado por el admin» y los votos ya no lo mueven hasta que lo devuelva a debate.`;
  $("#gpBody").innerHTML = `
    ${admin && inv ? `<section class="caja" aria-labelledby="tInv"><h3 id="tInv">Invitar a alguien</h3>
      <p>Mandale este link. Al abrirlo elige su nombre y entra.</p>
      <div class="link-fila"><input id="gInv" readonly value="${esc(inv)}" aria-label="Link de invitación"><button type="button" class="boton" id="gCopiaInv">Copiar</button></div></section>` : ""}
    <section class="caja" aria-labelledby="tUm"><h3 id="tUm">Cómo se valida un texto</h3><p>${umbral}</p>
      ${admin ? `<form id="gUmbral" class="forma fila" novalidate><label class="campo"><span>Votos a favor</span><input type="number" name="v" min="1" max="50" value="${g.umbral_votos}" required></label>
        <label class="campo"><span>Fracción a favor</span><select name="f">${FRACCIONES.map((f) => `<option value="${f[0]}/${f[1]}"${f[0] === g.umbral_num && f[1] === g.umbral_den ? " selected" : ""}>${f[2]}</option>`).join("")}</select></label>
        <button class="boton sec" type="submit">Guardar</button></form>` : ""}</section>
    ${admin && retiros.length ? `<section class="caja" aria-labelledby="tRet"><h3 id="tRet">Pedidos de retiro <span class="cuenta">${retiros.length}</span></h3>
      <ul class="lista-llana">${retiros.map((r) => `<li data-t="${r.texto_id}"><b>«${esc(r.titulo)}»</b>, de ${esc(r.autor)} · lo pidió ${esc(r.pedido_por || "alguien que ya no está")}${r.motivo ? `: ${esc(r.motivo)}` : ""}
        <br><span class="menor">${r.combinaciones.map((c) => `<a href="#c/${enRuta(c)}">${esc(etiqueta(c))}</a>`).join(" · ")}</span>
        <div class="acciones"><button type="button" class="boton peligro" data-ret="borrar">Borrar el texto</button><button type="button" class="boton sec" data-ret="dejar">Dejarlo</button></div></li>`).join("")}</ul></section>` : ""}
    <section class="caja" aria-labelledby="tMi"><h3 id="tMi">Miembros <span class="cuenta">${miembros.length}</span></h3>
      <ul class="lista-llana miembros">${miembros.map((m) => `<li data-m="${m.id}"><span><b>${esc(m.nombre)}</b>${m.rol === "admin" ? ` <span class="pill">administra</span>` : ""}${m.id === yo().id ? " (vos)" : ""}
        <span class="menor"> · ${plural(Number(m.textos), "texto", "textos")} · ${plural(Number(m.votos), "voto", "votos")}</span></span>
        ${admin && m.id !== yo().id ? `<button type="button" class="enlace peligro" data-exp="${m.id}" data-n="${esc(m.nombre)}">Expulsar</button>` : ""}</li>`).join("")}</ul></section>
    <section class="caja" aria-labelledby="tAct"><h3 id="tAct">Lo último que pasó</h3>
      ${actividad.length ? `<ul class="lista-llana act">${actividad.map((a) => `<li>${frase(a)} <span class="menor">· ${hace(a.cuando)}</span></li>`).join("")}</ul>` : `<p class="ayuda">Todavía no pasó nada: proponé el primer texto.</p>`}</section>
    <section class="caja" aria-labelledby="tVolver"><h3 id="tVolver">Tu link para volver</h3>
      <p>Para entrar desde otro dispositivo (o si borrás los datos del navegador), abrí este link. <b>Es solo tuyo</b>: quien lo tenga puede entrar como vos.</p>
      <div class="link-fila"><input id="gVolver" readonly value="${esc(volverLink())}" aria-label="Link para volver"><button type="button" class="boton" id="gCopiaVolver">Copiar</button></div>
      <p class="ayuda" id="gVivo">${textoVivo()}</p>
      <p><button type="button" class="enlace peligro" id="gSalir">Salir de este dispositivo</button></p></section>
    ${admin ? `<section class="caja" aria-labelledby="tResp"><h3 id="tResp">Copia de seguridad</h3>
      <p>Descarga todo el grupo (miembros, textos y votos) en un archivo. Conviene hacerlo de vez en cuando.</p>
      <p><button type="button" class="boton sec" id="gExportar">Descargar todo (JSON)</button></p></section>` : ""}`;

  const cuerpo = $("#gpBody");
  const copia = (id, msg) => $(id).addEventListener("click", async () => { aviso((await copiar($(id === "#gCopiaInv" ? "#gInv" : "#gVolver").value)) ? msg : "No se pudo copiar: seleccioná el link y copialo a mano.", ""); });
  if ($("#gCopiaInv")) copia("#gCopiaInv", "Link de invitación copiado.");
  copia("#gCopiaVolver", "Link para volver copiado.");
  cuerpo.querySelectorAll("#gInv, #gVolver").forEach((i) => i.addEventListener("focus", () => i.select()));

  const salir = $("#gSalir");
  salir.addEventListener("click", async () => {
    if (!(await confirmar({ titulo: "Salir de este dispositivo", texto: "Vas a tener que usar tu link para volver (o una invitación nueva) para entrar de nuevo. Si no lo copiaste, no lo vas a poder recuperar.", ok: "Salir", peligro: true }))) return;
    cerrarSesion(); location.hash = "#"; location.reload();
  });

  const um = $("#gUmbral");
  if (um) um.addEventListener("submit", async (e) => {
    e.preventDefault();
    const [n, d] = String(um.elements.f.value).split("/").map(Number);
    try { E.ses = await R("ajustar_umbral", { p_votos: Number(um.elements.v.value), p_num: n, p_den: d }); aviso("Umbral guardado."); }
    catch (x) { aviso(mensaje(x), "mal"); }
    await actualizar();
  });

  cuerpo.onclick = async (e) => {
    const exp = e.target.closest("[data-exp]");
    if (exp) {
      if (!(await confirmar({ titulo: `Expulsar a ${exp.dataset.n}`, texto: "Se van sus votos (los estados se recalculan). Sus textos quedan, sin nombre de autor.", ok: "Expulsar", peligro: true }))) return;
      try { await R("expulsar", { p_miembro: exp.dataset.exp }); aviso("Listo."); } catch (x) { aviso(mensaje(x), "mal"); }
      return actualizar();
    }
    const ret = e.target.closest("[data-ret]");
    if (ret) {
      const t = ret.closest("li").dataset.t;
      try {
        if (ret.dataset.ret === "borrar") {
          if (!(await confirmar({ titulo: "Borrar el texto", texto: "Se borra de todas las combinaciones, con sus votos. No se puede deshacer.", ok: "Borrar", peligro: true }))) return;
          await R("borrar_texto", { p_texto: t }); aviso("Texto borrado.");
        } else { await R("descartar_pedido", { p_texto: t }); aviso("Se descartó el pedido."); }
      } catch (x) { aviso(mensaje(x), "mal"); }
      return actualizar();
    }
    if (e.target.closest("#gExportar")) {
      try {
        const datos = await R("exportar");
        descargar(`conjugarnos-${grupo().nombre.replace(/[^\w-]+/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(datos, null, 2));
        aviso("Copia descargada.");
      } catch (x) { aviso(mensaje(x), "mal"); }
    }
  };
}
