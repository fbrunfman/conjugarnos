// Símbolos de planetas y signos dibujados como vectores (caja de 24 × 24, trazo redondeado).
// No dependen de ninguna fuente del sistema, así que se ven igual en cualquier Mac y no aparecen emojis.
// Sin DOM: devuelven texto SVG (también se puede probar en node). El color es el del texto (currentColor).

const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;

/** Contenido SVG de cada cuerpo. Asc y MC no tienen símbolo: llevan su sigla. */
export const BODY_SVG = {
  sun: `<circle cx="12" cy="12" r="8.6"/>${dot(12, 12, 1.7)}`,
  moon: `<path fill="currentColor" d="M16.2 4.2A8.74 8.74 0 1 0 16.2 19.8A7.9 7.9 0 1 1 16.2 4.2Z"/>`,
  mercury: `<path d="M7.2 2.8C7.2 5.2 9.3 6.6 12 6.6S16.8 5.2 16.8 2.8"/><circle cx="12" cy="10.8" r="4.2"/><path d="M12 15V21.6M8.8 18.4H15.2"/>`,
  venus: `<circle cx="12" cy="8.6" r="5.2"/><path d="M12 13.8V22M8.2 18.2H15.8"/>`,
  mars: `<circle cx="9.8" cy="14.2" r="5.6"/><path d="M13.8 10.2L20.4 3.6M14.2 3.6H20.4V9.8"/>`,
  jupiter: `<path d="M4.3 7.6C4.3 4 8.2 3 10.2 5C12.2 7 10.8 10.8 4.3 15H20.4M16 6V21.4"/>`,
  saturn: `<path d="M6.8 6.6H13.2M10 3V12.6C10 9 14.2 8.2 16.4 10.3C18.3 12.2 17.2 15.2 15.4 17.2C14.2 18.6 14.3 20.4 15.8 21C17.2 21.5 18.6 20.7 19.2 19.4"/>`,
  uranus: `<path d="M5.4 3.6V12.6M18.6 3.6V12.6M5.4 8.2H18.6M12 3V14.6"/><circle cx="12" cy="18.2" r="3.2"/>`,
  neptune: `<path d="M5 4.2C5 10.8 8 13 12 13S19 10.8 19 4.2M12 3V21.4M8 17.6H16M2.8 7L5 4L7.4 6.6M16.6 6.6L19 4L21.2 7M9.6 5.6L12 3L14.4 5.6"/>`,
  pluto: `<circle cx="12" cy="6.2" r="2.8"/><path d="M5.4 9.6A6.6 6.6 0 0 0 18.6 9.6M12 16.2V22.5M8.6 19.6H15.4"/>`,
  node: `<path d="M6.9 16.2C4.3 13.6 4.4 5.6 12 5.6S19.7 13.6 17.1 16.2"/><circle cx="5.5" cy="18.1" r="2.3"/><circle cx="18.5" cy="18.1" r="2.3"/>`,
};

/** Contenido SVG de los 12 signos, de Aries a Piscis. */
export const SIGN_SVG = [
  // Aries
  `<path d="M12 21.4V11M12 11C12 6.6 9.6 3.6 6.9 3.6C4.7 3.6 3.2 5.2 3.2 7.2C3.2 8.8 4.2 9.9 5.4 10.2M12 11C12 6.6 14.4 3.6 17.1 3.6C19.3 3.6 20.8 5.2 20.8 7.2C20.8 8.8 19.8 9.9 18.6 10.2"/>`,
  // Tauro
  `<circle cx="12" cy="15.4" r="5.7"/><path d="M4.4 3.4C4.4 7.4 7.4 9.7 12 9.7S19.6 7.4 19.6 3.4"/>`,
  // Géminis
  `<path d="M4.6 3.8C8.6 6.2 15.4 6.2 19.4 3.8M4.6 20.2C8.6 17.8 15.4 17.8 19.4 20.2M9.2 5.6V18.4M14.8 5.6V18.4"/>`,
  // Cáncer
  `<circle cx="7" cy="9.6" r="2.7"/><circle cx="17" cy="14.4" r="2.7"/><path d="M7.4 6.9C9.2 4.6 11.6 4 13.8 4C17 4 19.6 5.6 20.6 8.6M16.6 17.1C14.8 19.4 12.4 20 10.2 20C7 20 4.4 18.4 3.4 15.4"/>`,
  // Leo
  `<circle cx="7.4" cy="14.8" r="3.2"/><path d="M9.8 12.4C10.6 9 11.4 5 14.6 4.2C17.6 3.5 20 5.6 20 8.6C20 12.2 16.6 13.6 16.6 17.4C16.6 19.8 18 21 20.2 20.6"/>`,
  // Virgo
  `<path d="M3.6 5.6C5.6 5.6 6.6 6.8 6.6 9V19M6.6 9C6.6 6.8 7.8 5.6 9.8 5.6C11.8 5.6 12.8 6.8 12.8 9V19M12.8 9C12.8 6.8 14 5.6 16 5.6C18.2 5.6 19.4 7 19.4 9.6V15.2C19.4 18.8 16.6 20.4 13.6 19.6M12.8 19C12.8 17.4 13.8 16 15.2 15.2"/>`,
  // Libra
  `<path d="M3.6 20H20.4M3.6 15.2H8.6C6.2 13.4 5.6 11.4 5.6 9.8C5.6 6.4 8.4 4.2 12 4.2S18.4 6.4 18.4 9.8C18.4 11.4 17.8 13.4 15.4 15.2H20.4"/>`,
  // Escorpio
  `<path d="M3.6 5.6C5.6 5.6 6.6 6.8 6.6 9V19M6.6 9C6.6 6.8 7.8 5.6 9.8 5.6C11.8 5.6 12.8 6.8 12.8 9V19M12.8 9C12.8 6.8 14 5.6 16 5.6C18 5.6 19 6.8 19 9V17C19 19 19.8 20 21 20M17.6 17.6L21 20.4L17.6 22.6"/>`,
  // Sagitario
  `<path d="M4.4 19.6L19.6 4.4M10.4 4.4H19.6V13.6M6.4 11.4L12.6 17.6"/>`,
  // Capricornio
  `<path d="M3.2 5.4C5.2 5.4 6.2 6.8 6.9 8.8L10 17.6L12 8C12.6 5.6 15 4.8 17 5.6C19.2 6.4 20 8.8 19.2 11C18.4 13.2 16 14.4 16 17C16 19.6 18 21 20 20.4"/>`,
  // Acuario
  `<path d="M3 9.4L7.4 5.4L12 9.4L16.6 5.4L21 9.4M3 17.4L7.4 13.4L12 17.4L16.6 13.4L21 17.4"/>`,
  // Piscis
  `<path d="M4.6 3.6C9.6 6.4 9.6 17.6 4.6 20.4M19.4 3.6C14.4 6.4 14.4 17.6 19.4 20.4M4 12H20"/>`,
];

const wrap = (inner, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

/** Símbolo de un cuerpo como <svg> para HTML, o null si no tiene (Asc, MC). */
export const bodySVG = (id, cls = "gsvg") => (BODY_SVG[id] ? wrap(BODY_SVG[id], cls) : null);
/** Símbolo de un signo (0 = Aries … 11 = Piscis) como <svg> para HTML. */
export const signSVG = (i, cls = "gsvg sgsvg") => wrap(SIGN_SVG[i], cls);

/**
 * Símbolo dentro de otro SVG (la rueda), centrado en (x, y) con `size` unidades de lado.
 * El trazo (grosor, color) lo decide la CSS de quien lo contiene.
 */
export function glyphAt(inner, x, y, size, cls = "gl") {
  const k = size / 24;
  return `<g class="${cls}" transform="translate(${(x - 12 * k).toFixed(2)} ${(y - 12 * k).toFixed(2)}) scale(${k.toFixed(4)})">${inner}</g>`;
}
