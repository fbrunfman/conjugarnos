// Conjugarnos en tu computadora, sin Supabase.
// La base es Postgres de verdad (PGlite) con el mismo esquema de supabase/schema.sql, y este servidor
// responde igual que Supabase: POST /rest/v1/rpc/<función> con los argumentos en JSON. Los avisos en vivo
// salen por /dev/eventos (SSE) en lugar de Realtime. Solo escucha en 127.0.0.1.
//
// Uso:  node dev/server.mjs [--puerto 8787] [--grupo Prueba] [--umbral 4] [--datos carpeta]
//   · sin --datos la base vive en memoria y se borra al cerrar;
//   · con --datos los datos quedan guardados (y el grupo no se vuelve a crear).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { nuevaBase, rpc } from "../test/harness.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ESTATICO = path.join(AQUI, "..", "static");

const arg = (n, def) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : def; };
const PUERTO = Number(arg("puerto", process.env.PORT || 8787));
const GRUPO = arg("grupo", "Prueba");
const UMBRAL = Number(arg("umbral", 4));
const DATOS = arg("datos", "");

// Las únicas funciones que Supabase deja llamar con la clave pública (las mismas que en el `grant` del esquema).
const PUBLICAS = new Set(["ping", "unirse", "sesion", "grilla", "combinacion", "miembros", "actividad", "proponer",
  "agregar_combinacion", "votar", "quitar_voto", "editar_texto", "pedir_retiro", "retiros", "descartar_pedido",
  "borrar_texto", "quitar_combinacion", "ajustar_umbral", "expulsar", "exportar"]);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };

const db = await nuevaBase(DATOS || undefined);

// Una consulta a la vez: PGlite tiene una sola conexión y cada llamada cambia de rol y lo restablece.
let cola = Promise.resolve();
const enCola = (fn) => { const p = cola.then(fn, fn); cola = p.catch(() => {}); return p; };

// ---- avisos en vivo: cada pg_notify del esquema llega a las pantallas de ese grupo ----
//   · por SSE (/dev/eventos), el atajo de desarrollo;
//   · por WebSocket con el protocolo de Supabase Realtime (/realtime/v1/websocket), para probar el mismo camino que en producción
//     (basta poner la dirección de este servidor como `url` en static/config.js).
const oyentes = new Set();   // { grupo, res }
const sockets = new Set();   // { ws, topics: Set }
await db.listen("cambio", (txt) => {
  let a; try { a = JSON.parse(txt); } catch { return; }
  for (const o of oyentes) if (a.topic === "g:" + o.grupo) o.res.write(`event: cambio\ndata: ${JSON.stringify(a.payload || {})}\n\n`);
  for (const s of sockets) if (s.topics.has("realtime:" + a.topic)) s.ws.send(JSON.stringify([null, null, "realtime:" + a.topic, "broadcast", { type: "broadcast", event: a.event || "cambio", payload: a.payload || {} }]));
});
const ws = new WebSocketServer({ noServer: true });
ws.on("connection", (socket) => {
  const s = { ws: socket, topics: new Set() }; sockets.add(s);
  socket.on("close", () => sockets.delete(s));
  socket.on("message", (m) => {
    let jref, ref, topic, evento;
    try { [jref, ref, topic, evento] = JSON.parse(m.toString()); } catch { return; }
    if (evento === "phx_join") { s.topics.add(topic); socket.send(JSON.stringify([jref, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: [] } }])); }
    else if (evento === "phx_leave") { s.topics.delete(topic); socket.send(JSON.stringify([jref, ref, topic, "phx_reply", { status: "ok", response: {} }])); }
    else if (evento === "heartbeat") socket.send(JSON.stringify([null, ref, "phoenix", "phx_reply", { status: "ok", response: {} }]));
  });
});

// ---- el primer grupo ----
async function crearGrupo(nombre, umbral) {
  const r = await enCola(async () => (await db.query(`select crear_grupo($1, $2) as r`, [nombre, umbral])).rows[0].r);
  return r;
}
const hay = (await db.query(`select count(*)::int n from grupo`)).rows[0].n;
let invitaciones = null;
if (!hay) invitaciones = await crearGrupo(GRUPO, UMBRAL);

// ---- http ----
const leer = (req, tope = 3_000_000) => new Promise((ok, mal) => {
  const partes = []; let n = 0;
  req.on("data", (c) => { n += c.length; if (n > tope) { mal(new Error("cuerpo_grande")); req.destroy(); } else partes.push(c); });
  req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
  req.on("error", mal);
});
const json = (res, codigo, obj) => { res.writeHead(codigo, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const m = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
    if (m && req.method === "POST") {
      if (!PUBLICAS.has(m[1])) return json(res, 404, { code: "PGRST202", message: "función inexistente: " + m[1] });
      let args = {};
      try { args = JSON.parse((await leer(req)) || "{}"); } catch { return json(res, 400, { code: "PGRST102", message: "JSON inválido" }); }
      try {
        const r = await enCola(() => rpc(db, m[1], args));
        return json(res, 200, r);
      } catch (e) {
        return json(res, 400, { code: "P0001", message: e.message, details: e.detail || null, hint: null });
      }
    }
    if (url.pathname === "/dev/eventos") {
      const grupo = url.searchParams.get("g") || "";
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write("retry: 2000\n\n");
      const o = { grupo, res }; oyentes.add(o);
      const latido = setInterval(() => res.write(": latido\n\n"), 20000);
      req.on("close", () => { oyentes.delete(o); clearInterval(latido); });
      return;
    }
    if (url.pathname === "/dev/crear-grupo" && req.method === "POST") {   // para las pruebas automáticas
      const { nombre = "Prueba", umbral = 4 } = JSON.parse((await leer(req)) || "{}");
      return json(res, 200, await crearGrupo(nombre, umbral));
    }
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { message: "método no permitido" });
    let ruta = decodeURIComponent(url.pathname);
    if (ruta.endsWith("/")) ruta += "index.html";
    const archivo = path.normalize(path.join(ESTATICO, ruta));
    if (!archivo.startsWith(ESTATICO + path.sep) || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("no está");
    }
    res.writeHead(200, { "content-type": MIME[path.extname(archivo)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(archivo).pipe(res);
  } catch (e) {
    json(res, 500, { message: String(e.message || e) });
  }
});

servidor.on("upgrade", (req, socket, head) => {
  if (!req.url.startsWith("/realtime/v1/websocket")) return socket.destroy();
  ws.handleUpgrade(req, socket, head, (c) => ws.emit("connection", c, req));
});

servidor.listen(PUERTO, "127.0.0.1", () => {
  const base = `http://localhost:${PUERTO}`;
  console.log(`\nConjugarnos (desarrollo) en ${base}   ·   base: ${DATOS ? "guardada en " + DATOS : "en memoria"}`);
  if (invitaciones) {
    console.log(`  Grupo «${GRUPO}» (umbral ${UMBRAL} votos a favor)`);
    console.log(`  Entrar como admin (sirve una sola vez): ${base}/#entrar/${invitaciones.codigo_admin}`);
    console.log(`  Invitación para los demás:             ${base}/#entrar/${invitaciones.codigo}\n`);
  } else {
    console.log("  El grupo ya existía (los links de invitación se ven en el grupo, con la sesión del admin).\n");
  }
});
