// Los diez planetas, su orden de siempre (Sol … Plutón) y los círculos de color de la carta natal.
// Una combinación es un planeta solo o una pareja, siempre en este orden: Saturno + Plutón es la misma que Plutón + Saturno.
import { BODY_SVG } from "./glyphs.js";

export const PLANETAS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
export const NOMBRE = {
  sun: "Sol", moon: "Luna", mercury: "Mercurio", venus: "Venus", mars: "Marte",
  jupiter: "Júpiter", saturn: "Saturno", uranus: "Urano", neptune: "Neptuno", pluto: "Plutón",
};

export const esPlaneta = (id) => PLANETAS.includes(id);
/** Sin repetidos, solo planetas válidos y en el orden de siempre. */
export const ordenar = (ids) => [...new Set(ids)].filter(esPlaneta).sort((a, b) => PLANETAS.indexOf(a) - PLANETAS.indexOf(b));
/** «Saturno + Plutón». */
export const etiqueta = (ids) => ordenar(ids).map((i) => NOMBRE[i]).join(" + ");
/** Para las direcciones: «saturn-pluto». */
export const enRuta = (ids) => ordenar(ids).join("-");
/** De «saturn-pluto» a ["saturn", "pluto"]; null si no es una combinación válida (uno o dos planetas). */
export function deRuta(s) {
  const p = String(s || "").split("-");
  if (p.length < 1 || p.length > 2 || !p.every(esPlaneta) || (p.length === 2 && p[0] === p[1])) return null;
  return ordenar(p);
}
/** Clave de una combinación en la grilla. */
export const llave = (a, b) => `${a}|${b || ""}`;
export const llaveDe = (ids) => llave(ids[0], ids[1]);

// ---- círculos de color (los mismos de la carta: un círculo por planeta, el Sol con borde ondulado) ----
const SCALLOP = (() => {
  const n = 24, pts = [];
  for (let i = 0; i < n * 8; i++) {
    const t = (i / (n * 8)) * 2 * Math.PI;
    const r = 45.6 + 2.5 * Math.cos(n * t);
    pts.push(`${(r * Math.sin(t)).toFixed(1)} ${(-r * Math.cos(t)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
})();

function interior(id) {
  const bg = id === "sun" ? `<path class="pd-bg" d="${SCALLOP}"/>` : `<circle class="pd-bg" r="47.5"/>`;
  const aro = `<circle class="pd-ring" r="${id === "sun" ? 40 : 41.5}"/>`;
  return bg + aro + `<g class="pd-gl" transform="translate(-32.4 -32.4) scale(2.7)">${BODY_SVG[id]}</g>`;
}

/** Círculo de color con el símbolo del planeta. `tam`: "" (26 px), "s" (22 px) o "l" (46 px). */
export function circulo(id, tam = "") {
  return `<svg class="pb pb-${id}${tam ? " " + tam : ""}" viewBox="-50 -50 100 100" role="img" aria-label="${NOMBRE[id]}">${interior(id)}</svg>`;
}
/** El mismo, solo decorativo (cuando al lado ya está el nombre escrito). */
export function circuloDeco(id, tam = "") {
  return circulo(id, tam).replace('role="img" aria-label="' + NOMBRE[id] + '"', 'aria-hidden="true"');
}
