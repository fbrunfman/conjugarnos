// El esqueleto: entra, ve quién sos, elige la pantalla según la dirección (#…) y conecta los cambios en vivo.
//   #grilla            las 55 combinaciones
//   #c/saturn-pluto    una combinación (o #c/saturn, un planeta solo)
//   #proponer[/…]      proponer un texto (con la combinación ya elegida, si viene)
//   #editar            editar un texto que se abrió desde su tarjeta
//   #grupo             miembros, umbral, actividad
//   #entrar/<código>   invitación      ·      #volver/<clave>   volver desde otro dispositivo
import { rpc, mensaje } from "./api.js";
import { E, leerClave, ponerSesion, cerrarSesion, esAdmin } from "./estado.js";
import { deRuta } from "./planetas.js";
import { conectarVivo } from "./vivo.js";
import { bienvenida, entrar, volver, codigoDe } from "./entrar.js";
import * as Grilla from "./grilla.js";
import * as Combinacion from "./combinacion.js";
import * as Proponer from "./proponer.js";
import * as Grupo from "./grupo.js";
import { $, esc, aviso } from "./ui.js";

const main = $("#main");
const nav = $("#nav");
let pantalla = null;            // { actualizar() } de la pantalla que se está viendo
let desconectar = null, enrutando = 0, vencida = false;   // vencida: la clave guardada ya no sirve (por ejemplo, te sacaron del grupo)

function marcarNav(pag) {
  nav.querySelectorAll("a").forEach((a) => { if (a.dataset.p === pag) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}

function ponerNombre() {
  const n = $("#quien");
  n.textContent = E.ses ? E.ses.miembro.nombre : "";
  n.hidden = !E.ses;
  nav.hidden = !E.ses;
}

function estadoVivo(e) {
  const p = $("#vivo");
  p.dataset.e = e;
  p.title = e === "vivo" ? "En vivo" : e === "sin-red" ? "Sin conexión" : "Se actualiza cada tanto";
  p.querySelector(".vh").textContent = p.title;
  Grupo.ponerEstadoVivo(e);
}

function conectar() {
  if (desconectar || !E.ses) return;
  desconectar = conectarVivo(E.ses.grupo.id, () => { if (pantalla && pantalla.actualizar) pantalla.actualizar(); }, estadoVivo);
}

async function arrancar() {
  E.cuandoCaduca = () => { cerrarSesion(); vencida = true; if (desconectar) { desconectar(); desconectar = null; } ponerNombre(); bienvenida(main, { vencida: true }); };
  const clave = leerClave();
  if (clave) {
    try { ponerSesion(clave, await rpc("sesion", { p_clave: clave })); }
    catch (e) { if (e.codigo === "no_autorizado") { cerrarSesion(); vencida = true; } else { main.innerHTML = `<p class="nota mal pantalla" role="alert">${esc(mensaje(e))}</p>`; return; } }
  }
  addEventListener("hashchange", enrutar);
  await enrutar();
}

async function enrutar() {
  const mia = ++enrutando;
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  const [r, ...resto] = h.split("/");
  const arg = resto.join("/");

  if (r === "volver") {                         // «link para volver»: guarda la clave y entra
    const ok = await volver(arg);
    history.replaceState(null, "", location.pathname + (ok ? "#grilla" : "#"));
    if (!ok) { ponerNombre(); return bienvenida(main, { vencida: true }); }
    return enrutar();
  }
  ponerNombre();
  if (r === "entrar") { pantalla = null; marcarNav(""); document.title = "Entrar · Conjugarnos"; return entrar(main, arg, { alEntrar: () => { ponerNombre(); conectar(); location.hash = "#grilla"; } }); }
  if (!E.ses) { pantalla = null; marcarNav(""); document.title = "Conjugarnos"; return bienvenida(main, { vencida }); }
  conectar();

  let pag = "grilla", cual = Grilla;
  document.title = "Conjugarnos";
  const combo = r === "c" ? deRuta(arg) : null;
  if (r === "c" && combo) { cual = Combinacion; pag = "grilla"; await Combinacion.montar(main, combo); }
  else if (r === "proponer") { pag = "proponer"; cual = null; Proponer.montar(main, { combo: Proponer.comboDeRuta(arg) }); document.title = "Proponer un texto · Conjugarnos"; }
  else if (r === "editar") {
    if (!E.editando) { location.hash = "#grilla"; return; }
    pag = "grilla"; cual = null; Proponer.montar(main, { edicion: E.editando.texto }); document.title = "Editar el texto · Conjugarnos";
  }
  else if (r === "grupo") { pag = "grupo"; cual = Grupo; await Grupo.montar(main); }
  else { if (r && r !== "grilla") history.replaceState(null, "", "#grilla"); document.title = "Grilla · Conjugarnos"; await Grilla.montar(main); }
  if (mia !== enrutando) return;
  pantalla = cual;
  marcarNav(pag);
  scrollTo({ top: 0, behavior: "instant" });
  main.focus({ preventScroll: true });
}

arrancar();
