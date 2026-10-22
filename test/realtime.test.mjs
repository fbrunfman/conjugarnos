// Prueba del cliente de Realtime (el de producción, empaquetado en static/vendor/realtime.js) contra un servidor de mentira
// que habla el protocolo de Supabase Realtime (Phoenix, versión 2.0.0). Uso: node test/realtime.test.mjs
// Comprueba lo que depende de nuestro código: el nombre del canal, la clave pública, que un «cambio» avise,
// que otros eventos y otros canales no avisen, y que el estado en vivo se informe bien.
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import { RealtimeClient } from "../static/vendor/realtime.js";
import { suscribirRealtime } from "../static/realtime-canal.js";

let ok = 0, mal = 0;
async function prueba(nombre, fn) {
  try { await fn(); ok++; console.log("ok   " + nombre); } catch (e) { mal++; console.log("FALLA " + nombre + "\n       " + (e.message || e).split("\n")[0]); }
}
const esperar = async (cond, ms = 4000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error("se acabó el tiempo esperando"); await new Promise((r) => setTimeout(r, 20)); } };

const servidor = new WebSocketServer({ port: 0, host: "127.0.0.1" });
await new Promise((r) => servidor.on("listening", r));
const puerto = servidor.address().port;
const visto = { url: null, joins: [], sockets: [] };
servidor.on("connection", (ws, req) => {
  visto.url = req.url; visto.sockets.push(ws);
  ws.on("message", (m) => {
    const [jref, ref, topic, evento, payload] = JSON.parse(m.toString());
    if (evento === "phx_join") { visto.joins.push({ topic, payload }); ws.send(JSON.stringify([jref, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: [] } }])); }
    else if (evento === "heartbeat") ws.send(JSON.stringify([null, ref, "phoenix", "phx_reply", { status: "ok", response: {} }]));
  });
});
const empujar = (topic, evento, payload) => visto.sockets.forEach((s) => s.send(JSON.stringify([null, null, topic, "broadcast", { type: "broadcast", event: evento, payload }])));

let cambios = 0; const estados = [];
const sub = suscribirRealtime(RealtimeClient, { base: `http://127.0.0.1:${puerto}`, llave: "sb_publishable_de_prueba", grupoId: "abc-123",
  alCambio: () => cambios++, alEstado: (v) => estados.push(v) });

await prueba("se conecta a /realtime/v1 con la clave pública y se suscribe al canal del grupo", async () => {
  await esperar(() => visto.joins.length > 0);
  assert.match(visto.url, /^\/realtime\/v1\/websocket\?/);
  assert.match(visto.url, /apikey=sb_publishable_de_prueba/);
  assert.equal(visto.joins[0].topic, "realtime:g:abc-123");
});
await prueba("al suscribirse informa «en vivo» y pide los datos una vez (por si algo cambió mientras conectaba)", async () => {
  await esperar(() => estados.includes(true));
  await esperar(() => cambios === 1);
  assert.equal(cambios, 1);
});
await prueba("un «cambio» del grupo avisa", async () => {
  empujar("realtime:g:abc-123", "cambio", { t: "voto" });
  await esperar(() => cambios === 2);
});
await prueba("otros eventos u otros canales no avisan", async () => {
  empujar("realtime:g:abc-123", "otro", {});
  empujar("realtime:g:otro-grupo", "cambio", {});
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(cambios, 2);
});
await prueba("si el servidor corta, informa que ya no está en vivo", async () => {
  estados.length = 0;
  visto.sockets.forEach((s) => s.close());
  await esperar(() => estados.includes(false), 6000);
});
sub.cerrar();
servidor.close();
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
