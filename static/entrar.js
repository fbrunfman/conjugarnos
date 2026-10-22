// Entrar al grupo: con el link de invitación y un nombre, sin contraseña. Y volver desde otro dispositivo con el «link para volver».
import { rpc } from "./api.js";
import { mensaje } from "./api.js";
import { E, claveNueva, guardarClave, ponerSesion, leerClave, cerrarSesion } from "./estado.js";
import { esc, $, aviso } from "./ui.js";

/** El código de una invitación, venga como link completo, como «#entrar/código» o suelto. */
export function codigoDe(texto) {
  const t = String(texto || "").trim();
  const m = /#?entrar\/([A-Za-z0-9]+)/.exec(t);
  return m ? m[1] : /^[A-Za-z0-9]{8,64}$/.test(t) ? t : "";
}

/** Pantalla de bienvenida: sin invitación todavía. */
export function bienvenida(el, { vencida = false } = {}) {
  el.innerHTML = `<section class="pantalla estrecha" aria-labelledby="tBien">
    <h2 id="tBien">Una biblioteca viva de planetas</h2>
    <p class="lead">Un grupo de amigos junta textos, biografías, películas y canciones que le quedan bien a un planeta o a una pareja de planetas, y los valida votando.</p>
    ${vencida ? `<p class="nota mal" role="alert">Tu sesión ya no es válida en este dispositivo. Si te invitaron de nuevo, usá el link nuevo; si cambiaste de dispositivo, usá tu «link para volver».</p>` : ""}
    <p>Para entrar necesitás el <strong>link de invitación</strong> de tu grupo. Si lo tenés, pegalo acá:</p>
    <form id="fCodigo" class="forma" novalidate>
      <label class="campo"><span>Link o código de invitación</span><input name="c" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <p class="error" id="eCodigo" role="alert" hidden></p>
      <button class="boton" type="submit">Seguir</button>
    </form>
  </section>`;
  $("#fCodigo", el).addEventListener("submit", (e) => {
    e.preventDefault();
    const c = codigoDe(new FormData(e.target).get("c"));
    if (!c) { const er = $("#eCodigo", el); er.textContent = "Eso no parece un link de invitación."; er.hidden = false; return; }
    location.hash = "#entrar/" + c;
  });
}

/** Pantalla de «entrar con esta invitación + un nombre». */
export function entrar(el, codigo, { alEntrar }) {
  if (E.ses) {
    el.innerHTML = `<section class="pantalla estrecha"><h2>Ya estás adentro</h2>
      <p>Entraste a <strong>${esc(E.ses.grupo.nombre)}</strong> como <strong>${esc(E.ses.miembro.nombre)}</strong> en este dispositivo.</p>
      <p><a class="boton" href="#grilla">Ir a la grilla</a></p></section>`;
    return;
  }
  el.innerHTML = `<section class="pantalla estrecha" aria-labelledby="tEnt">
    <h2 id="tEnt">Te invitaron a un grupo</h2>
    <p class="lead">Elegí el nombre con el que vas a proponer y votar. Lo ve todo el grupo.</p>
    <form id="fEntrar" class="forma" novalidate>
      <label class="campo"><span>Tu nombre</span><input name="n" maxlength="40" required autocomplete="nickname" autofocus></label>
      <p class="error" id="eEnt" role="alert" hidden></p>
      <button class="boton" type="submit">Entrar</button>
    </form>
    <p class="ayuda">No hay contraseña: este dispositivo queda como «vos». Después, en «Grupo», vas a encontrar un link para volver desde otro dispositivo.</p>
  </section>`;
  $("#fEntrar", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = String(new FormData(e.target).get("n") || "").trim();
    const er = $("#eEnt", el), boton = e.target.querySelector("button");
    er.hidden = true;
    if (!nombre) { er.textContent = "Escribí tu nombre."; er.hidden = false; return; }
    boton.disabled = true;
    try {
      const clave = leerClave() || claveNueva();
      const ses = await rpc("unirse", { p_codigo: codigo, p_nombre: nombre, p_clave: clave });
      guardarClave(clave);
      ponerSesion(clave, ses);
      aviso(`Listo, ${ses.miembro.nombre}. Bienvenido a ${ses.grupo.nombre}.`);
      alEntrar();
    } catch (x) {
      er.textContent = mensaje(x); er.hidden = false; boton.disabled = false;
    }
  });
}

/** «Link para volver»: ya trae la clave en la dirección. Se guarda y se entra. */
export async function volver(clave) {
  if (!/^[0-9a-f]{64}$/.test(clave)) return false;
  try {
    const ses = await rpc("sesion", { p_clave: clave });
    guardarClave(clave);
    ponerSesion(clave, ses);
    return true;
  } catch {
    cerrarSesion();
    return false;
  }
}
