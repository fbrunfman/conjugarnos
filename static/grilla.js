// La grilla: las 55 combinaciones (45 parejas y, en la diagonal, los 10 planetas solos) con su estado de un vistazo.
// Cada casilla se pinta según lo que tiene: nada, textos en debate, o al menos un texto validado.
import { R } from "./estado.js";
import { PLANETAS, NOMBRE, circuloDeco, etiqueta, enRuta, llave } from "./planetas.js";
import { esc, plural } from "./ui.js";

let raiz = null, ficha = 0;

export async function montar(el) {
  raiz = el;
  raiz.innerHTML = `<section class="pantalla" aria-labelledby="tGrilla"><header class="cab"><h2 id="tGrilla">Grilla</h2>
    <p class="sub" id="gResumen" aria-live="polite">Cargando…</p></header>
    <div id="gCuerpo"></div></section>`;
  await actualizar();
}

export async function actualizar() {
  const mia = ++ficha;
  let filas;
  try { filas = await R("grilla"); } catch { if (mia === ficha) document.getElementById("gResumen").textContent = "No se pudo cargar la grilla. Probá de nuevo en un momento."; return; }
  if (mia !== ficha || !raiz || !document.getElementById("gCuerpo")) return;
  pintar(filas);
}

function pintar(filas) {
  const por = new Map(filas.map((f) => [llave(f.a, f.b), f]));
  let conValidado = 0, soloDebate = 0;
  for (const f of filas) { if (f.validados > 0) conValidado++; else if (f.debate > 0) soloDebate++; }

  const cab = PLANETAS.map((id) => `<th scope="col">${circuloDeco(id, "s")}<span class="vh">${NOMBRE[id]}</span></th>`).join("");
  const cuerpo = PLANETAS.map((fila, i) => {
    const celdas = PLANETAS.map((col, j) => {
      if (j < i) return `<td class="nada" aria-hidden="true"></td>`;
      const solo = i === j;
      const f = por.get(llave(fila, solo ? "" : col));
      const v = f ? f.validados : 0, d = f ? f.debate : 0;
      const estado = v > 0 ? "val" : d > 0 ? "deb" : "vac";
      const ids = solo ? [fila] : [fila, col];
      const dice = v || d ? `${plural(v, "validado", "validados")}, ${d} en debate` : "sin nada";
      const num = v > 0 ? v : d > 0 ? d : "";
      return `<td><button type="button" class="cel ${estado}${solo ? " solo" : ""}" data-c="${enRuta(ids)}"
        aria-label="${esc(etiqueta(ids))}: ${dice}" title="${esc(etiqueta(ids))}: ${dice}"><span>${num}</span>${v > 0 && d > 0 ? `<i class="pto" aria-hidden="true"></i>` : ""}</button></td>`;
    }).join("");
    return `<tr><th scope="row">${circuloDeco(fila, "s")}<span class="vh">${NOMBRE[fila]}</span></th>${celdas}</tr>`;
  }).join("");

  document.getElementById("gResumen").textContent =
    `${conValidado} de 55 combinaciones con un aporte validado` + (soloDebate ? ` · ${soloDebate} con aportes en debate` : "") + ".";
  document.getElementById("gCuerpo").innerHTML = `
    <p class="acciones"><a class="boton" href="#proponer">Proponer</a></p>
    <div class="grilla-caja"><table class="grilla"><caption class="vh">Combinaciones de planetas. Tocá una casilla para ver lo que tiene.</caption>
      <thead><tr><td></td>${cab}</tr></thead><tbody>${cuerpo}</tbody></table></div>
    <p class="menor ref">Referencias</p>
    <ul class="leyenda" aria-label="Qué significa cada casilla">
      <li><span class="mini cel val"></span> tiene aportes validados; el número de adentro es cuántos</li>
      <li><span class="mini cel deb"></span> tiene solo aportes en debate; el número de adentro es cuántos</li>
      <li><span class="mini cel vac"></span> todavía sin nada</li>
      <li><span class="mini cel solo vac"></span> en la diagonal, el planeta solo</li>
    </ul>`;
  document.getElementById("gCuerpo").onclick = (e) => {
    const b = e.target.closest(".cel[data-c]");
    if (b) location.hash = "#c/" + b.dataset.c;
  };
}
