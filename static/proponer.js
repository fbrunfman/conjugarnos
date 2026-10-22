// Proponer un texto nuevo (o editar uno que ya está cargado).
// Lleva título, autor y un máximo de palabras; se elige para qué combinaciones (un planeta o una pareja, hasta 12).
// Mientras escribís se guarda un borrador en este dispositivo, por si se cierra la pestaña a la mitad.
import { R, E, yo, grupo } from "./estado.js";
import { ErrorApi, mensaje } from "./api.js";
import { etiqueta, enRuta, deRuta } from "./planetas.js";
import { selectorPlanetas } from "./selector.js";
import { esc, $, aviso, palabras, reiniciaVotos } from "./ui.js";

const claveBorrador = () => "conjugarnos:borrador:" + yo().id;
const leerBorrador = () => { try { return JSON.parse(localStorage.getItem(claveBorrador()) || "null"); } catch { return null; } };
const guardarBorrador = (b) => { try { localStorage.setItem(claveBorrador(), JSON.stringify(b)); } catch { /* sin borrador */ } };
const borrarBorrador = () => { try { localStorage.removeItem(claveBorrador()); } catch { /* nada */ } };

/**
 * @param {HTMLElement} el
 * @param {{ combo?: string[], edicion?: object|null }} opts  edicion: el texto a editar (de la combinación donde se lo vio)
 */
export function montar(el, { combo = [], edicion = null } = {}) {
  const editando = !!edicion;
  const max = grupo().max_palabras;
  const borrador = !editando ? leerBorrador() : null;
  const v = editando ? edicion : { titulo: "", autor: "", cuerpo: "", ...(borrador || {}) };
  let combos = combo.length ? [combo] : [];   // lista de combinaciones elegidas: [["saturn","pluto"], ["moon"]]

  el.innerHTML = `<section class="pantalla estrecha" aria-labelledby="tProp">
    <p class="cab-sup"><a class="atras" href="${editando && E.editando ? esc(E.editando.volver || "#grilla") : "#grilla"}">‹ Volver</a></p>
    <h2 id="tProp">${editando ? "Editar el texto" : "Proponer un texto"}</h2>
    ${!editando && borrador && (borrador.titulo || borrador.cuerpo) ? `<p class="nota" role="note">Recuperé tu borrador. <button type="button" class="enlace" id="pDescartar">Empezar de cero</button></p>` : ""}
    <form id="fProp" class="forma" novalidate>
      <label class="campo"><span>Título</span><input name="titulo" maxlength="200" required value="${esc(v.titulo)}" autocomplete="off"></label>
      <label class="campo"><span>Autor o autora</span><input name="autor" maxlength="120" required value="${esc(v.autor)}" autocomplete="off"></label>
      <label class="campo"><span>El texto</span><textarea name="cuerpo" rows="14" required spellcheck="true">${esc(v.cuerpo)}</textarea>
        <small id="pCuenta" aria-live="polite"></small></label>
      ${editando ? `<p class="nota" id="pReinicia" role="note" hidden>Con este cambio los votos de este texto se reinician: es más que una corrección de erratas.</p>` : `
      <fieldset class="combos"><legend>¿Para qué combinaciones?</legend>
        <p class="ayuda">Un planeta solo o una pareja. Podés elegir hasta 12.</p>
        <ul id="pCombos" class="chips" aria-live="polite"></ul>
        <div id="pSel"></div>
        <p><button type="button" class="boton sec" id="pAgregar" disabled>Agregar esta combinación</button></p>
      </fieldset>`}
      <p class="ayuda">Subí lo que puedas compartir con tu grupo. Si es una obra con derechos de autor, mejor un fragmento que el texto entero.</p>
      <div id="pAviso" class="nota mal" role="alert" hidden></div>
      <div class="acciones"><button class="boton" type="submit" id="pEnviar">${editando ? "Guardar cambios" : "Proponer"}</button>
        <a class="boton sec" href="${editando && E.editando ? esc(E.editando.volver || "#grilla") : "#grilla"}">Cancelar</a></div>
    </form></section>`;

  const f = $("#fProp", el);
  const valor = (n) => f.elements[n].value;
  const campos = () => ({ titulo: valor("titulo"), autor: valor("autor"), cuerpo: valor("cuerpo") });

  // ---- contador de palabras ----
  const cuenta = () => {
    const n = palabras(valor("cuerpo"));
    const el2 = $("#pCuenta", el);
    el2.textContent = `${n.toLocaleString("es-AR")} de ${max.toLocaleString("es-AR")} palabras`;
    el2.className = n > max ? "pasa" : "";
    if (editando) $("#pReinicia", el).hidden = !reiniciaVotos(edicion.cuerpo, valor("cuerpo"));
    return n;
  };
  cuenta();

  // ---- combinaciones ----
  let sel = null;
  const pintarCombos = () => {
    if (editando) return;
    $("#pCombos", el).innerHTML = combos.length
      ? combos.map((c, i) => `<li class="chip con">${esc(etiqueta(c))} <button type="button" class="x" data-x="${i}" aria-label="Quitar ${esc(etiqueta(c))}">✕</button></li>`).join("")
      : `<li class="ayuda">Todavía no elegiste ninguna.</li>`;
    $("#pAgregar", el).disabled = !sel.obtener().length || combos.length >= 12;
  };
  if (!editando) {
    sel = selectorPlanetas($("#pSel", el), { max: 2, alCambiar: pintarCombos });
    pintarCombos();
    $("#pAgregar", el).addEventListener("click", () => {
      const c = sel.obtener();
      if (!c.length) return;
      if (!combos.some((x) => enRuta(x) === enRuta(c))) combos.push(c);
      sel.limpiar(); pintarCombos();
    });
    $("#pCombos", el).addEventListener("click", (e) => {
      const b = e.target.closest("[data-x]");
      if (b) { combos.splice(Number(b.dataset.x), 1); pintarCombos(); }
    });
  }

  // ---- borrador ----
  let espera = 0;
  const alEscribir = () => {
    cuenta();
    if (editando) return;
    clearTimeout(espera);
    espera = setTimeout(() => guardarBorrador(campos()), 400);
  };
  f.addEventListener("input", alEscribir);
  const descartar = $("#pDescartar", el);
  if (descartar) descartar.addEventListener("click", () => { borrarBorrador(); montar(el, { combo, edicion }); });

  // ---- enviar ----
  const mostrar = (msg, extra = "") => { const a = $("#pAviso", el); a.innerHTML = esc(msg) + extra; a.hidden = false; a.scrollIntoView({ block: "nearest" }); };
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#pAviso", el).hidden = true;
    const c = campos();
    if (!c.titulo.trim()) return mostrar("Falta el título.");
    if (!c.autor.trim()) return mostrar("Falta el autor o la autora.");
    if (!c.cuerpo.trim()) return mostrar("Falta el texto.");
    if (palabras(c.cuerpo) > max) return mostrar(`El texto pasa el máximo de ${max.toLocaleString("es-AR")} palabras. Podés cargar un fragmento.`);
    if (!editando && !combos.length) {
      const pendiente = sel.obtener();
      if (pendiente.length) { combos.push(pendiente); sel.limpiar(); pintarCombos(); }
      else return mostrar("Elegí al menos una combinación de planetas.");
    }
    const boton = $("#pEnviar", el);
    boton.disabled = true;
    try {
      if (editando) {
        const r = await R("editar_texto", { p_texto: edicion.id, p_titulo: c.titulo, p_autor: c.autor, p_cuerpo: c.cuerpo });
        aviso(r.reiniciado ? "Guardado. Cambió el texto, así que los votos se reiniciaron." : "Guardado. Era una corrección chica: los votos siguen.");
        const vuelta = E.editando && E.editando.volver; E.editando = null;
        location.hash = vuelta || "#grilla";
      } else {
        const r = await R("proponer", { p_titulo: c.titulo, p_autor: c.autor, p_cuerpo: c.cuerpo, p_combinaciones: combos });
        borrarBorrador();
        aviso(`Quedó propuesto para ${combos.length === 1 ? etiqueta(combos[0]) : combos.length + " combinaciones"}. Tu voto a favor ya cuenta.`);
        location.hash = "#c/" + enRuta(combos[0]);
        return r;
      }
    } catch (x) {
      boton.disabled = false;
      if (x instanceof ErrorApi && x.codigo === "texto_repetido" && x.detalle && !editando) {
        mostrar("Ya hay un texto con ese título y autor en el grupo. ", `<button type="button" class="enlace" id="pYa">Proponer ese texto para estas combinaciones</button>`);
        $("#pYa", el).addEventListener("click", async () => {
          let ok = 0;
          for (const k of combos) {
            try { await R("agregar_combinacion", { p_texto: x.detalle, p_a: k[0], p_b: k[1] || null }); ok++; }
            catch (y) { if (!(y instanceof ErrorApi && y.codigo === "ya_propuesto")) { mostrar(mensaje(y)); return; } }
          }
          borrarBorrador();
          aviso(ok ? "Listo: el texto que ya estaba quedó propuesto para esas combinaciones." : "Ese texto ya estaba propuesto para todas esas combinaciones.");
          location.hash = "#c/" + enRuta(combos[0]);
        });
      } else mostrar(mensaje(x));
    }
  });
}

/** Para entrar a «#proponer/saturn-pluto»: la combinación de la dirección, o nada. */
export const comboDeRuta = (s) => deRuta(s) || [];
