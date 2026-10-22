// Lo que se puede proponer: un texto, una biografía, una película o una canción.
// Cada clase cambia cómo se llaman los campos del formulario, si el cuerpo es obligatorio y si lleva link.
// (Las reglas de verdad están en la base, supabase/schema.sql: esto solo ordena lo que se le muestra a la gente.)

export const ORDEN = ["texto", "biografia", "pelicula", "cancion"];

export const CLASES = {
  texto: {
    nombre: "Texto", titulo: "Título", autor: "Autor o autora", de: "",
    cuerpo: "El texto", cuerpoObligatorio: true, filas: 14, enlace: null,
    faltaTitulo: "Falta el título.", faltaAutor: "Falta el autor o la autora.", faltaCuerpo: "Falta el texto.",
  },
  biografia: {
    nombre: "Biografía", titulo: "Persona", autor: "Escrita por", de: "por",
    cuerpo: "La biografía", cuerpoObligatorio: true, filas: 14, enlace: null,
    faltaTitulo: "Falta el nombre de la persona.", faltaAutor: "Falta quién escribió la biografía.", faltaCuerpo: "Falta la biografía.",
  },
  pelicula: {
    nombre: "Película", titulo: "Título de la película", autor: "Dirección", de: "de",
    cuerpo: "Sinopsis o nota (opcional)", cuerpoObligatorio: false, filas: 6,
    enlace: "Link (opcional)", enlaceAyuda: "El tráiler o dónde verla.", enlaceVerbo: "Ver",
    faltaTitulo: "Falta el título de la película.", faltaAutor: "Falta quién la dirigió.", faltaCuerpo: "",
  },
  cancion: {
    nombre: "Canción", titulo: "Título de la canción", autor: "Artista", de: "de",
    cuerpo: "Nota o fragmento de la letra (opcional)", cuerpoObligatorio: false, filas: 6,
    enlace: "Link de la canción (opcional)", enlaceAyuda: "YouTube, Spotify, Bandcamp…", enlaceVerbo: "Escuchar",
    faltaTitulo: "Falta el título de la canción.", faltaAutor: "Falta el artista o la banda.", faltaCuerpo: "",
  },
};

/** La clase de un texto que vino de la base (si falta, es un texto). */
export const claseDe = (t) => CLASES[t && t.clase] || CLASES.texto;

/** Lo que alguien pegó como link: sin espacios y, si no trae «https://», se le pone. Vacío si no escribió nada. */
export function normalizarEnlace(s) {
  const e = String(s || "").trim();
  if (!e) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(e) ? e : "https://" + e;
}

/** { href, dominio } si es una dirección web (http o https) y se puede abrir con tranquilidad; si no, null. */
export function enlaceSeguro(u) {
  try {
    const x = new URL(String(u || ""));
    if (x.protocol !== "http:" && x.protocol !== "https:") return null;
    return { href: x.href, dominio: x.hostname.replace(/^www\./, "") };
  } catch { return null; }
}
