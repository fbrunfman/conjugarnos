// Los diez círculos para elegir una combinación: sin pintar al principio, se pintan al tocarlos (como en «Combinar» de la carta).
// Se pueden elegir uno o dos; si ya hay dos y tocás un tercero, sale el que se eligió primero.
import { PLANETAS, NOMBRE, circulo, ordenar } from "./planetas.js";

/** Dibuja el selector dentro de `cont`. Devuelve { obtener(), poner(ids), limpiar() }. */
export function selectorPlanetas(cont, { max = 2, inicial = [], alCambiar = () => {} } = {}) {
  let elegidos = ordenar(inicial).slice(0, max);
  const fila = [...elegidos];   // en el orden en que se eligieron

  cont.classList.add("cmb-pick");
  cont.setAttribute("role", "group");
  cont.innerHTML = PLANETAS.map((id) =>
    `<button type="button" class="cmb-pl" data-b="${id}" aria-pressed="false"><span aria-hidden="true">${circulo(id).replace(/role="img" aria-label="[^"]*"/, "")}</span><span class="cmb-nm">${NOMBRE[id]}</span></button>`).join("");

  const pintar = () => {
    cont.querySelectorAll(".cmb-pl").forEach((b) => b.setAttribute("aria-pressed", String(fila.includes(b.dataset.b))));
  };
  cont.addEventListener("click", (e) => {
    const b = e.target.closest(".cmb-pl");
    if (!b) return;
    const id = b.dataset.b, i = fila.indexOf(id);
    if (i >= 0) fila.splice(i, 1);
    else { fila.push(id); if (fila.length > max) fila.shift(); }
    elegidos = ordenar(fila);
    pintar();
    alCambiar(elegidos);
  });
  pintar();
  return {
    obtener: () => ordenar(fila),
    poner(ids) { fila.length = 0; fila.push(...ordenar(ids).slice(0, max)); pintar(); },
    limpiar() { fila.length = 0; pintar(); },
  };
}
