// Pruebas del esquema contra una base Postgres real. Uso: node test/sql.test.mjs
import assert from "node:assert/strict";
import { nuevaBase, rpc, clave, palabras } from "./harness.mjs";

let ok = 0, mal = 0;
async function prueba(nombre, fn) {
  try { await fn(); ok++; console.log("ok   " + nombre); }
  catch (e) { mal++; console.log("FALLA " + nombre + "\n       " + (e.message || e).split("\n")[0]); }
}
async function falla(promesa, mensaje) {
  try { await promesa; } catch (e) { assert.equal(e.message, mensaje); return e; }
  assert.fail("tenía que fallar con «" + mensaje + "»");
}

const db = await nuevaBase();
const R = (n, a, r) => rpc(db, n, a, r);

// ---- un grupo con admin y miembros ----
const gr = (await db.query(`select crear_grupo('Prueba') as r`)).rows[0].r;
const adm = await R("unirse", { p_codigo: gr.codigo_admin, p_nombre: "Federico", p_clave: clave(0) });
const nombres = ["Ana", "Beto", "Cami", "Dani", "Eli", "Fede2"];
for (const [i, n] of nombres.entries()) await R("unirse", { p_codigo: gr.codigo, p_nombre: n, p_clave: clave(i + 1) });
const [A, B, C, D, E, F] = [1, 2, 3, 4, 5, 6].map(clave), ADM = clave(0);

const propuesta = (extra = {}) => ({
  p_titulo: "Ante la ley", p_autor: "Franz Kafka",
  p_cuerpo: "Ante la ley hay un guardián.", p_combinaciones: [["saturn", "pluto"]], ...extra });
const estado = async (cl, a, b) => (await R("combinacion", { p_clave: cl, p_a: a, p_b: b })).map((v) => v.estado);

await prueba("las tablas están cerradas para anon y authenticated", async () => {
  for (const t of ["grupo", "miembro", "texto", "vinculo", "voto"]) {
    for (const rol of ["anon", "authenticated"]) {
      await db.exec(`set role ${rol}`);
      let msg = "";
      try { await db.query(`select * from ${t}`); } catch (e) { msg = e.message; }
      await db.exec("reset role");
      assert.match(msg, /permission denied/, `${rol} no debería leer ${t}`);
    }
  }
});
await prueba("anon no puede crear grupos ni llamar a las ayudas internas", async () => {
  await db.exec("set role anon");
  for (const q of [`select crear_grupo('x')`, `select _recalcular(gen_random_uuid())`, `select _forzar(gen_random_uuid(), gen_random_uuid())`, `select _yo('${clave(1)}')`]) {
    let msg = ""; try { await db.query(q); } catch (e) { msg = e.message; }
    assert.match(msg, /permission denied/, q);
  }
  await db.exec("reset role");
  assert.equal(await R("ping"), "ok");
});

await prueba("entrar: invitación, nombre y clave", async () => {
  assert.equal(adm.miembro.rol, "admin"); assert.equal(adm.invitacion, gr.codigo);
  const s = await R("sesion", { p_clave: A });
  assert.equal(s.miembro.nombre, "Ana"); assert.equal(s.miembro.rol, "miembro"); assert.equal(s.invitacion, null);
  assert.equal(s.grupo.umbral_votos, 4); assert.equal(s.grupo.max_palabras, 2000);
  await falla(R("unirse", { p_codigo: "nada", p_nombre: "X", p_clave: clave(50) }), "invitacion_invalida");
  await falla(R("unirse", { p_codigo: gr.codigo, p_nombre: "  ana ", p_clave: clave(51) }), "nombre_en_uso");
  await falla(R("unirse", { p_codigo: gr.codigo, p_nombre: "", p_clave: clave(52) }), "nombre_invalido");
  await falla(R("unirse", { p_codigo: gr.codigo, p_nombre: "Corta", p_clave: "corta" }), "clave_invalida");
  await falla(R("unirse", { p_codigo: gr.codigo, p_nombre: "Otro", p_clave: A }), "clave_invalida");
  await falla(R("unirse", { p_codigo: gr.codigo_admin, p_nombre: "Otro", p_clave: clave(53) }), "invitacion_invalida");   // el de admin es de un solo uso
  await falla(R("sesion", { p_clave: clave(99) }), "no_autorizado");
  await falla(R("grilla", { p_clave: "" }), "no_autorizado");
});

await prueba("la clave no se guarda: solo su huella", async () => {
  const r = await db.query(`select count(*)::int n from miembro where clave_hash = convert_to($1,'UTF8')`, [A]);
  assert.equal(r.rows[0].n, 0);
});

await prueba("proponer: campos obligatorios y límite de palabras", async () => {
  await falla(R("proponer", propuesta({ p_titulo: " " }).constructor === Object ? { p_clave: A, ...propuesta({ p_titulo: " " }) } : {}), "falta_titulo");
  await falla(R("proponer", { p_clave: A, ...propuesta({ p_autor: "" }) }), "falta_autor");
  await falla(R("proponer", { p_clave: A, ...propuesta({ p_cuerpo: "   " }) }), "falta_texto");
  await falla(R("proponer", { p_clave: A, ...propuesta({ p_combinaciones: [] }) }), "sin_combinacion");
  await falla(R("proponer", { p_clave: A, ...propuesta({ p_combinaciones: [["saturn", "zeus"]] }) }), "planeta_invalido");
  await falla(R("proponer", { p_clave: A, ...propuesta({ p_combinaciones: [["sun", "sun"]] }) }), "planeta_invalido");
  await falla(R("proponer", { p_clave: A, ...propuesta({ p_combinaciones: [["sun", "moon", "mars"]] }) }), "planeta_invalido");
  await falla(R("proponer", { p_clave: A, ...propuesta({ p_cuerpo: palabras(2001) }) }), "texto_largo");
  const dosMil = await R("proponer", { p_clave: A, ...propuesta({ p_titulo: "Justo 2000", p_cuerpo: palabras(2000), p_combinaciones: [["sun"]] }) });
  assert.ok(dosMil.texto_id);
});

await prueba("proponer: orden de planetas, un planeta solo, repetidas, y quien propone ya vota a favor", async () => {
  const r = await R("proponer", { p_clave: A, ...propuesta({ p_combinaciones: [["pluto", "saturn"], ["saturn", "pluto"], ["saturn"]] }) });
  assert.equal(r.vinculos.length, 2);   // la pareja repetida se junta
  const par = await R("combinacion", { p_clave: B, p_a: "saturn", p_b: "pluto" });
  assert.equal(par.length, 1);
  assert.equal(par[0].estado, "debate");
  assert.deepEqual(par[0].favor.map((x) => x.nombre), ["Ana"]);
  assert.equal(par[0].texto.cargado_por, "Ana");
  assert.equal(par[0].mi_voto, null);
  const solo = await R("combinacion", { p_clave: B, p_a: "saturn" });
  assert.equal(solo.length, 1);
  // el orden en que se pide no importa
  assert.equal((await R("combinacion", { p_clave: B, p_a: "pluto", p_b: "saturn" })).length, 1);
  // un planeta solo no se mezcla con la pareja
  assert.equal((await R("combinacion", { p_clave: B, p_a: "pluto" })).length, 0);
});

await prueba("proponer: un texto repetido avisa cuál es", async () => {
  const e = await falla(R("proponer", { p_clave: B, ...propuesta({ p_titulo: " ANTE LA LEY ", p_autor: "franz kafka" }) }), "texto_repetido");
  assert.match(e.detail, /^[0-9a-f-]{36}$/);
});

const vinc = async (cl, a, b, i = 0) => (await R("combinacion", { p_clave: cl, p_a: a, p_b: b }))[i].vinculo_id;
const VP = await vinc(A, "saturn", "pluto");

await prueba("votar: un voto en contra pide motivo; cada persona un voto; se puede cambiar", async () => {
  await falla(R("votar", { p_clave: B, p_vinculo: VP, p_valor: "contra" }), "falta_motivo");
  await falla(R("votar", { p_clave: B, p_vinculo: VP, p_valor: "contra", p_motivo: "  " }), "falta_motivo");
  await falla(R("votar", { p_clave: B, p_vinculo: VP, p_valor: "quizas" }), "voto_invalido");
  await falla(R("votar", { p_clave: B, p_vinculo: VP, p_valor: "contra", p_motivo: "x".repeat(201) }), "motivo_largo");
  await R("votar", { p_clave: B, p_vinculo: VP, p_valor: "contra", p_motivo: "No me cierra" });
  let v = (await R("combinacion", { p_clave: B, p_a: "saturn", p_b: "pluto" }))[0];
  assert.equal(v.mi_voto, "contra"); assert.equal(v.mi_motivo, "No me cierra");
  assert.deepEqual(v.contra, [{ nombre: "Beto", motivo: "No me cierra" }]);
  await R("votar", { p_clave: B, p_vinculo: VP, p_valor: "favor", p_motivo: "ignorado" });
  v = (await R("combinacion", { p_clave: B, p_a: "saturn", p_b: "pluto" }))[0];
  assert.equal(v.mi_voto, "favor"); assert.equal(v.mi_motivo, null); assert.equal(v.contra.length, 0);
  assert.deepEqual(v.favor.map((x) => x.nombre).sort(), ["Ana", "Beto"]);
  await R("quitar_voto", { p_clave: B, p_vinculo: VP });
  assert.deepEqual((await R("combinacion", { p_clave: B, p_a: "saturn", p_b: "pluto" }))[0].favor.map((x) => x.nombre), ["Ana"]);
});

await prueba("umbral: 4 a favor y al menos 2/3", async () => {
  // Ana ya votó a favor al proponer. Con 3 a favor no alcanza; el cuarto lo valida.
  await R("votar", { p_clave: B, p_vinculo: VP, p_valor: "favor" });
  await R("votar", { p_clave: C, p_vinculo: VP, p_valor: "favor" });
  assert.deepEqual(await estado(A, "saturn", "pluto"), ["debate"]);
  const r = await R("votar", { p_clave: D, p_vinculo: VP, p_valor: "favor" });
  assert.equal(r.estado, "validado");
  assert.deepEqual(await estado(A, "saturn", "pluto"), ["validado"]);
});
await prueba("umbral: justo 4 a favor y 2 en contra (=2/3) valida; 4 y 3 no", async () => {
  const t = await R("proponer", { p_clave: A, ...propuesta({ p_titulo: "Otro", p_autor: "Alguien", p_combinaciones: [["sun", "moon"]] }) });
  const v = t.vinculos[0];
  await R("votar", { p_clave: E, p_vinculo: v, p_valor: "contra", p_motivo: "no" });
  await R("votar", { p_clave: F, p_vinculo: v, p_valor: "contra", p_motivo: "no" });
  for (const cl of [B, C]) await R("votar", { p_clave: cl, p_vinculo: v, p_valor: "favor" });
  assert.deepEqual(await estado(A, "sun", "moon"), ["debate"]);                       // 3 a favor, 2 en contra
  await R("votar", { p_clave: D, p_vinculo: v, p_valor: "favor" });                   // 4 a favor, 2 en contra
  assert.deepEqual(await estado(A, "sun", "moon"), ["validado"]);
  // con 4 a favor y 3 en contra no se hubiera validado: probamos con otro
  const t2 = await R("proponer", { p_clave: A, ...propuesta({ p_titulo: "Tercero", p_autor: "Alguien", p_combinaciones: [["sun", "mars"]] }) });
  const v2 = t2.vinculos[0];
  for (const cl of [E, F, ADM]) await R("votar", { p_clave: cl, p_vinculo: v2, p_valor: "contra", p_motivo: "no" });
  for (const cl of [B, C, D]) await R("votar", { p_clave: cl, p_vinculo: v2, p_valor: "favor" });
  assert.deepEqual(await estado(A, "sun", "mars"), ["debate"]);                       // 4 a favor, 3 en contra
});
await prueba("reabrir: un validado vuelve a debate solo si baja de la mitad a favor", async () => {
  // «Ante la ley»: 4 a favor (Ana, Beto, Cami, Dani). Sumamos 4 en contra: 4 de 8 = la mitad, sigue validado.
  for (const cl of [E, F, ADM]) await R("votar", { p_clave: cl, p_vinculo: VP, p_valor: "contra", p_motivo: "no" });
  assert.deepEqual(await estado(A, "saturn", "pluto"), ["validado"]);                 // 4 de 7
  await R("unirse", { p_codigo: gr.codigo, p_nombre: "Gabi", p_clave: clave(7) });
  await R("votar", { p_clave: clave(7), p_vinculo: VP, p_valor: "contra", p_motivo: "no" });
  assert.deepEqual(await estado(A, "saturn", "pluto"), ["validado"]);                 // 4 de 8: justo la mitad
  await R("votar", { p_clave: D, p_vinculo: VP, p_valor: "contra", p_motivo: "cambié de idea" });
  assert.deepEqual(await estado(A, "saturn", "pluto"), ["debate"]);                   // 3 de 8: baja de la mitad
  // y para volver a validarse tiene que cumplir el umbral entero otra vez
  await R("votar", { p_clave: D, p_vinculo: VP, p_valor: "favor" });
  assert.deepEqual(await estado(A, "saturn", "pluto"), ["debate"]);                   // 4 a favor pero 4 de 8 < 2/3
});

await prueba("grilla y combinación: conteos, orden y un solo grupo", async () => {
  const g = await R("grilla", { p_clave: A });
  const celda = (a, b) => g.find((x) => x.a === a && x.b === b);
  assert.equal(celda("sun", "moon").validados, 1);
  assert.equal(celda("saturn", "pluto").debate, 1);
  assert.equal(celda("saturn", null).debate, 1);
  assert.equal(celda("sun", null).debate, 1);   // «Justo 2000»
  assert.equal(g.some((x) => x.a === "venus"), false);
});

// ---- otro grupo: no se ve nada de lo de este ----
const g2 = (await db.query(`select crear_grupo('Otro grupo') as r`)).rows[0].r;
const X = clave(80), Y = clave(81);
await R("unirse", { p_codigo: g2.codigo_admin, p_nombre: "Xavi", p_clave: X });
await R("unirse", { p_codigo: g2.codigo, p_nombre: "Federico", p_clave: Y });   // el mismo nombre en otro grupo se puede
await prueba("grupos separados: no se ve ni se vota lo del otro", async () => {
  assert.deepEqual(await R("grilla", { p_clave: X }), []);
  assert.deepEqual(await R("combinacion", { p_clave: X, p_a: "saturn", p_b: "pluto" }), []);
  await falla(R("votar", { p_clave: X, p_vinculo: VP, p_valor: "favor" }), "vinculo_inexistente");
  const texto = (await R("combinacion", { p_clave: A, p_a: "saturn", p_b: "pluto" }))[0].texto.id;
  await falla(R("agregar_combinacion", { p_clave: X, p_texto: texto, p_a: "sun" }), "texto_inexistente");
  await falla(R("editar_texto", { p_clave: X, p_texto: texto, p_titulo: "a", p_autor: "a", p_cuerpo: "a" }), "texto_inexistente");
  await falla(R("borrar_texto", { p_clave: X, p_texto: texto }), "texto_inexistente");
  assert.equal((await R("miembros", { p_clave: X })).length, 2);
  assert.equal((await R("exportar", { p_clave: X })).textos.length, 0);
});

await prueba("agregar a otra combinación", async () => {
  const texto = (await R("combinacion", { p_clave: A, p_a: "saturn", p_b: "pluto" }))[0].texto.id;
  const r = await R("agregar_combinacion", { p_clave: C, p_texto: texto, p_a: "mars", p_b: "venus" });   // orden invertido
  assert.ok(r.vinculo_id);
  const c = await R("combinacion", { p_clave: C, p_a: "venus", p_b: "mars" });
  assert.equal(c.length, 1); assert.deepEqual(c[0].favor.map((x) => x.nombre), ["Cami"]);
  await falla(R("agregar_combinacion", { p_clave: C, p_texto: texto, p_a: "venus", p_b: "mars" }), "ya_propuesto");
});

await prueba("editar: una errata no reinicia, un cambio de cuerpo sí, el título no", async () => {
  const cuerpo = palabras(500);
  const t = await R("proponer", { p_clave: B, ...propuesta({ p_titulo: "Largo", p_autor: "Z", p_cuerpo: cuerpo, p_combinaciones: [["jupiter", "uranus"]] }) });
  const v = t.vinculos[0];
  for (const cl of [A, C, D]) await R("votar", { p_clave: cl, p_vinculo: v, p_valor: "favor" });
  assert.deepEqual(await estado(A, "jupiter", "uranus"), ["validado"]);
  const ed = (cuerpoNuevo, extra = {}) => R("editar_texto", { p_clave: B, p_texto: t.texto_id, p_titulo: "Largo", p_autor: "Z", p_cuerpo: cuerpoNuevo, ...extra });
  // errata: una palabra
  let r = await ed(cuerpo.replace("palabra7 ", "palabrra7 "));
  assert.equal(r.reiniciado, false);
  assert.deepEqual(await estado(A, "jupiter", "uranus"), ["validado"]);
  // solo el título
  r = await ed(cuerpo.replace("palabra7 ", "palabrra7 "), { p_titulo: "Largo (corregido)" });
  assert.equal(r.reiniciado, false);
  assert.equal((await R("combinacion", { p_clave: A, p_a: "jupiter", p_b: "uranus" }))[0].favor.length, 4);
  // cambio de verdad: se reinician los votos y queda solo el de quien lo cargó
  r = await ed(palabras(500, "otra"));
  assert.equal(r.reiniciado, true);
  const c = (await R("combinacion", { p_clave: A, p_a: "jupiter", p_b: "uranus" }))[0];
  assert.equal(c.estado, "debate"); assert.deepEqual(c.favor.map((x) => x.nombre), ["Beto"]); assert.equal(c.contra.length, 0);
  assert.ok(c.texto.editado);
});
await prueba("editar: permisos, límite y títulos repetidos", async () => {
  const c = (await R("combinacion", { p_clave: A, p_a: "jupiter", p_b: "uranus" }))[0].texto;
  const base = { p_texto: c.id, p_titulo: c.titulo, p_autor: c.autor, p_cuerpo: c.cuerpo };
  await falla(R("editar_texto", { p_clave: A, ...base }), "sin_permiso");                    // otra persona
  await R("editar_texto", { p_clave: ADM, ...base });                                         // el admin sí
  await falla(R("editar_texto", { p_clave: B, ...base, p_cuerpo: palabras(2001) }), "texto_largo");
  await falla(R("editar_texto", { p_clave: B, ...base, p_titulo: "Ante la ley", p_autor: "Franz Kafka" }), "texto_repetido");
  await falla(R("editar_texto", { p_clave: B, ...base, p_titulo: " " }), "falta_titulo");
  await falla(R("editar_texto", { p_clave: B, ...base, p_autor: "" }), "falta_autor");
});

await prueba("retirar: cualquiera pide, solo el admin decide", async () => {
  const t = (await R("combinacion", { p_clave: A, p_a: "sun", p_b: "mars" }))[0].texto;
  await R("pedir_retiro", { p_clave: E, p_texto: t.id, p_motivo: "tiene derechos de autor" });
  const c = (await R("combinacion", { p_clave: A, p_a: "sun", p_b: "mars" }))[0].texto;
  assert.equal(c.retiro_pedido, true); assert.equal(c.retiro_motivo, "tiene derechos de autor");
  await falla(R("retiros", { p_clave: E }), "solo_admin");
  const pend = await R("retiros", { p_clave: ADM });
  assert.equal(pend.length, 1); assert.equal(pend[0].texto_id, t.id); assert.equal(pend[0].pedido_por, "Eli");
  assert.equal(pend[0].motivo, "tiene derechos de autor"); assert.deepEqual(pend[0].combinaciones, [["sun", "mars"]]);
  await falla(R("descartar_pedido", { p_clave: E, p_texto: t.id }), "solo_admin");
  await falla(R("borrar_texto", { p_clave: E, p_texto: t.id }), "solo_admin");
  await R("descartar_pedido", { p_clave: ADM, p_texto: t.id });
  assert.deepEqual(await R("retiros", { p_clave: ADM }), []);
  assert.equal((await R("combinacion", { p_clave: A, p_a: "sun", p_b: "mars" }))[0].texto.retiro_pedido, false);
  await R("borrar_texto", { p_clave: ADM, p_texto: t.id });
  assert.deepEqual(await R("combinacion", { p_clave: A, p_a: "sun", p_b: "mars" }), []);
  const resto = await db.query(`select (select count(*) from voto where vinculo_id not in (select id from vinculo))::int sueltos`);
  assert.equal(resto.rows[0].sueltos, 0);
});

await prueba("quitar de una combinación: el admin, o quien lo cargó si nadie más votó", async () => {
  const t = await R("proponer", { p_clave: C, ...propuesta({ p_titulo: "Chico", p_autor: "Q", p_combinaciones: [["mercury"], ["venus"]] }) });
  await falla(R("quitar_combinacion", { p_clave: D, p_vinculo: t.vinculos[0] }), "sin_permiso");
  await R("votar", { p_clave: D, p_vinculo: t.vinculos[1], p_valor: "favor" });
  await falla(R("quitar_combinacion", { p_clave: C, p_vinculo: t.vinculos[1] }), "sin_permiso");   // ya votó otra persona
  await R("quitar_combinacion", { p_clave: C, p_vinculo: t.vinculos[0] });                          // nadie más votó
  assert.equal((await R("combinacion", { p_clave: A, p_a: "mercury" })).length, 0);
  assert.equal((await R("combinacion", { p_clave: A, p_a: "venus" })).length, 1);
  await R("quitar_combinacion", { p_clave: ADM, p_vinculo: t.vinculos[1] });                        // el admin siempre
  const sobra = await db.query(`select count(*)::int n from texto where titulo = 'Chico'`);
  assert.equal(sobra.rows[0].n, 0);                                                                  // sin combinaciones, el texto se va
});

await prueba("umbral del grupo: solo el admin, con valores razonables", async () => {
  await falla(R("ajustar_umbral", { p_clave: A, p_votos: 3, p_num: 2, p_den: 3 }), "solo_admin");
  await falla(R("ajustar_umbral", { p_clave: ADM, p_votos: 0, p_num: 2, p_den: 3 }), "umbral_invalido");
  await falla(R("ajustar_umbral", { p_clave: ADM, p_votos: 3, p_num: 1, p_den: 3 }), "umbral_invalido");   // menos de la mitad
  await falla(R("ajustar_umbral", { p_clave: ADM, p_votos: 3, p_num: 4, p_den: 3 }), "umbral_invalido");
  // «Otro grupo»: umbral 2 votos, 1/2. Una propuesta con un voto a favor más se valida.
  await R("ajustar_umbral", { p_clave: X, p_votos: 2, p_num: 1, p_den: 2 });
  const t = await R("proponer", { p_clave: X, ...propuesta({ p_titulo: "T", p_autor: "A", p_combinaciones: [["sun"]] }) });
  assert.deepEqual(await estado(X, "sun"), ["debate"]);
  const r = await R("votar", { p_clave: Y, p_vinculo: t.vinculos[0], p_valor: "favor" });
  assert.equal(r.estado, "validado");
  // El grupo 1 no cambió.
  assert.equal((await R("sesion", { p_clave: A })).grupo.umbral_votos, 4);
});
await prueba("bajar el umbral revisa los que estaban en debate", async () => {
  // «Ante la ley» quedó en debate con 4 a favor y 4 en contra. Con 4 votos y 1/2 se valida al recalcular.
  assert.deepEqual(await estado(A, "saturn", "pluto"), ["debate"]);
  await R("ajustar_umbral", { p_clave: ADM, p_votos: 4, p_num: 1, p_den: 2 });
  assert.deepEqual(await estado(A, "saturn", "pluto"), ["validado"]);
  await R("ajustar_umbral", { p_clave: ADM, p_votos: 4, p_num: 2, p_den: 3 });                // volver: el validado sigue (≥ la mitad)
  assert.deepEqual(await estado(A, "saturn", "pluto"), ["validado"]);
});

await prueba("expulsar: se van sus votos y se recalculan los estados", async () => {
  const t = await R("proponer", { p_clave: B, ...propuesta({ p_titulo: "Para expulsar", p_autor: "Q", p_combinaciones: [["neptune"]] }) });
  const v = t.vinculos[0];
  for (const cl of [A, C, D]) await R("votar", { p_clave: cl, p_vinculo: v, p_valor: "favor" });
  assert.deepEqual(await estado(A, "neptune"), ["validado"]);
  const miembros = await R("miembros", { p_clave: ADM });
  const dani = miembros.find((m) => m.nombre === "Dani").id;
  await falla(R("expulsar", { p_clave: A, p_miembro: dani }), "solo_admin");
  await falla(R("expulsar", { p_clave: ADM, p_miembro: miembros.find((m) => m.nombre === "Federico").id }), "no_podes_expulsarte");
  await falla(R("expulsar", { p_clave: ADM, p_miembro: gr.id }), "miembro_inexistente");
  await R("expulsar", { p_clave: ADM, p_miembro: dani });
  await falla(R("sesion", { p_clave: D }), "no_autorizado");
  const c = (await R("combinacion", { p_clave: A, p_a: "neptune" }))[0];
  assert.deepEqual(c.favor.map((x) => x.nombre).sort(), ["Ana", "Beto", "Cami"]);
  assert.equal(c.estado, "validado");     // quedó con 3 a favor y ninguno en contra: sigue (solo baja si pasa de la mitad en contra)
  // un expulsado puede volver con otro nombre y otra clave
  await R("unirse", { p_codigo: gr.codigo, p_nombre: "Dani", p_clave: clave(60) });
});

await prueba("actividad: lo último, sin el voto automático de quien propone", async () => {
  const act = await R("actividad", { p_clave: A, p_n: 100 });
  assert.ok(act.length > 5);
  assert.ok(act.every((e) => e.tipo === "texto" || e.tipo === "voto"));
  const t = await R("proponer", { p_clave: C, ...propuesta({ p_titulo: "Reciente", p_autor: "R", p_combinaciones: [["mars"]] }) });
  await R("votar", { p_clave: B, p_vinculo: t.vinculos[0], p_valor: "favor" });
  const ult = await R("actividad", { p_clave: A, p_n: 2 });
  assert.equal(ult.length, 2);
  assert.equal(ult[0].tipo, "voto"); assert.equal(ult[0].quien, "Beto"); assert.equal(ult[0].titulo, "Reciente");
  assert.equal(ult[1].tipo, "texto"); assert.equal(ult[1].quien, "Cami");
  assert.equal(act.filter((e) => e.tipo === "voto" && e.titulo === "Reciente" && e.quien === "Cami").length, 0);
});

// ---- el admin decide solo: cargar ya validado y «validar ahora» ----
const fila = async (cl, a, b, titulo) => (await R("combinacion", { p_clave: cl, p_a: a, p_b: b || null })).find((f) => f.texto.titulo === titulo);

await prueba("admin: cargar un texto ya validado, sin votación (los demás no pueden)", async () => {
  await falla(R("proponer", { p_clave: A, ...propuesta({ p_titulo: "Directo de Ana", p_combinaciones: [["venus", "neptune"]], p_validar: true }) }), "solo_admin");
  assert.equal(await fila(A, "venus", "neptune", "Directo de Ana"), undefined);                  // no quedó nada a medias
  const t = await R("proponer", { p_clave: ADM, ...propuesta({ p_titulo: "Directo", p_autor: "Z", p_combinaciones: [["venus", "neptune"], ["jupiter"]], p_validar: true }) });
  assert.equal(t.vinculos.length, 2);
  for (const [a, b] of [["venus", "neptune"], ["jupiter", null]]) {
    const f = await fila(A, a, b, "Directo");
    assert.equal(f.estado, "validado"); assert.equal(f.forzado, true); assert.equal(f.forzado_por, "Federico");
    assert.deepEqual(f.favor.map((x) => x.nombre), ["Federico"]);
  }
  // proponer «normal» sigue igual: en debate y sin marca
  await R("proponer", { p_clave: ADM, ...propuesta({ p_titulo: "Normal del admin", p_autor: "Z", p_combinaciones: [["venus", "neptune"]] }) });
  const n = await fila(A, "venus", "neptune", "Normal del admin");
  assert.equal(n.estado, "debate"); assert.equal(n.forzado, false);
  // los votos de los demás se registran pero no lo mueven
  const v = (await fila(A, "venus", "neptune", "Directo")).vinculo_id;
  for (const cl of [A, B, C]) await R("votar", { p_clave: cl, p_vinculo: v, p_valor: "contra", p_motivo: "no me gusta" });
  const f = await fila(A, "venus", "neptune", "Directo");
  assert.equal(f.estado, "validado"); assert.equal(f.contra.length, 3);
  // cuenta como validado en la grilla
  const g = (await R("grilla", { p_clave: A })).find((x) => x.a === "venus" && x.b === "neptune");
  assert.equal(g.validados, 1); assert.equal(g.debate, 1);
});

await prueba("admin: «validar ahora» el texto de otro; su voto pasa a favor; los votos ya no lo mueven", async () => {
  const t = await R("proponer", { p_clave: B, ...propuesta({ p_titulo: "De Beto", p_autor: "Y", p_combinaciones: [["mercury", "jupiter"]] }) });
  const v = t.vinculos[0];
  await R("votar", { p_clave: C, p_vinculo: v, p_valor: "contra", p_motivo: "flojo" });
  await R("votar", { p_clave: ADM, p_vinculo: v, p_valor: "contra", p_motivo: "lo pienso" });     // el admin había votado en contra
  await falla(R("validar_ya", { p_clave: A, p_vinculo: v }), "solo_admin");
  await falla(R("validar_ya", { p_clave: X, p_vinculo: v }), "vinculo_inexistente");   // el admin de otro grupo no puede
  assert.equal((await fila(A, "mercury", "jupiter", "De Beto")).estado, "debate");
  const r = await R("validar_ya", { p_clave: ADM, p_vinculo: v });
  assert.equal(r.estado, "validado");
  let f = await fila(ADM, "mercury", "jupiter", "De Beto");
  assert.equal(f.estado, "validado"); assert.equal(f.forzado, true); assert.equal(f.forzado_por, "Federico");
  assert.equal(f.mi_voto, "favor"); assert.equal(f.mi_motivo, null);                               // su voto en contra pasó a favor
  assert.deepEqual(f.favor.map((x) => x.nombre).sort(), ["Beto", "Federico"]); assert.deepEqual(f.contra.map((x) => x.nombre), ["Cami"]);
  // más votos en contra: sigue validado
  for (const cl of [A, E, F]) await R("votar", { p_clave: cl, p_vinculo: v, p_valor: "contra", p_motivo: "no" });
  assert.equal((await fila(A, "mercury", "jupiter", "De Beto")).estado, "validado");
  // quedó en la actividad
  const act = await R("actividad", { p_clave: A, p_n: 100 });
  assert.ok(act.some((e) => e.tipo === "validacion" && e.quien === "Federico" && e.titulo === "De Beto" && e.a === "mercury" && e.b === "jupiter"));
  // y en la copia de seguridad
  const ex = await R("exportar", { p_clave: ADM });
  assert.equal(ex.textos.find((t2) => t2.titulo === "De Beto").combinaciones[0].validado_por_admin, true);
  // devolver a debate: solo el admin; con 2 a favor y 4 en contra no alcanza por votos
  await falla(R("quitar_validacion", { p_clave: A, p_vinculo: v }), "solo_admin");
  const q = await R("quitar_validacion", { p_clave: ADM, p_vinculo: v });
  assert.equal(q.estado, "debate");
  f = await fila(A, "mercury", "jupiter", "De Beto");
  assert.equal(f.forzado, false); assert.equal(f.forzado_por, null);
  assert.equal(f.favor.length, 2);                                                                 // los votos quedaron como estaban
  assert.equal((await R("quitar_validacion", { p_clave: ADM, p_vinculo: v })).estado, "debate");  // repetirlo no rompe nada
});

await prueba("admin: al devolver a debate, si los votos solos alcanzan, queda validado igual", async () => {
  const t = await R("proponer", { p_clave: B, ...propuesta({ p_titulo: "Con votos", p_autor: "W", p_combinaciones: [["sun", "venus"]] }) });
  const v = t.vinculos[0];
  await R("votar", { p_clave: A, p_vinculo: v, p_valor: "favor" });
  await R("validar_ya", { p_clave: ADM, p_vinculo: v });                                            // 3 a favor (Beto, Ana, Federico): sin el admin no llega a 4
  await R("votar", { p_clave: C, p_vinculo: v, p_valor: "favor" });
  await R("votar", { p_clave: E, p_vinculo: v, p_valor: "favor" });
  assert.equal((await R("quitar_validacion", { p_clave: ADM, p_vinculo: v })).estado, "validado");
  assert.equal((await fila(A, "sun", "venus", "Con votos")).forzado, false);
});

await prueba("admin: agregar un texto a otra combinación ya validado", async () => {
  const t = (await fila(A, "sun", "venus", "Con votos")).texto.id;
  await falla(R("agregar_combinacion", { p_clave: A, p_texto: t, p_a: "mars", p_b: "venus", p_validar: true }), "solo_admin");
  await R("agregar_combinacion", { p_clave: ADM, p_texto: t, p_a: "mars", p_b: "venus", p_validar: true });
  const f = await fila(A, "mars", "venus", "Con votos");
  assert.equal(f.estado, "validado"); assert.equal(f.forzado, true);
  await R("agregar_combinacion", { p_clave: ADM, p_texto: t, p_a: "mars", p_b: "saturn" });          // sin la opción: normal
  assert.equal((await fila(A, "mars", "saturn", "Con votos")).forzado, false);
});

await prueba("admin: editar un texto validado por el admin: lo pierde si edita otra persona, lo conserva si edita el admin", async () => {
  const cuerpoViejo = palabras(60), cuerpoNuevo = palabras(60, "otra");
  const t = await R("proponer", { p_clave: B, ...propuesta({ p_titulo: "Edición", p_autor: "V", p_cuerpo: cuerpoViejo, p_combinaciones: [["moon", "saturn"], ["moon", "uranus"]] }) });
  for (const v of t.vinculos) await R("validar_ya", { p_clave: ADM, p_vinculo: v });
  const ed = (cl, cuerpo) => R("editar_texto", { p_clave: cl, p_texto: t.texto_id, p_titulo: "Edición", p_autor: "V", p_cuerpo: cuerpo });
  // una errata no toca nada
  assert.equal((await ed(B, cuerpoViejo.replace("palabra7 ", "palabrra7 "))).reiniciado, false);
  assert.equal((await fila(A, "moon", "saturn", "Edición")).forzado, true);
  // la persona que lo cargó cambia el texto: se reinician los votos y se pierde la validación del admin
  assert.equal((await ed(B, cuerpoNuevo)).reiniciado, true);
  let f = await fila(A, "moon", "saturn", "Edición");
  assert.equal(f.forzado, false); assert.equal(f.estado, "debate"); assert.deepEqual(f.favor.map((x) => x.nombre), ["Beto"]);
  // el admin lo vuelve a validar y es él quien lo cambia: se reinician los votos pero la validación sigue
  await R("validar_ya", { p_clave: ADM, p_vinculo: f.vinculo_id });
  assert.equal((await ed(ADM, cuerpoViejo)).reiniciado, true);
  f = await fila(A, "moon", "saturn", "Edición");
  assert.equal(f.forzado, true); assert.equal(f.estado, "validado"); assert.deepEqual(f.favor.map((x) => x.nombre), ["Beto"]);
  // la otra combinación (que el admin dejó validada antes) quedó en debate por el primer cambio de Beto
  assert.equal((await fila(A, "moon", "uranus", "Edición")).forzado, false);
});

await prueba("admin: ni los votos en contra, ni bajar el umbral, ni expulsar mueven un validado por el admin", async () => {
  const t = await R("proponer", { p_clave: ADM, ...propuesta({ p_titulo: "Firme", p_autor: "U", p_combinaciones: [["mars", "uranus"]], p_validar: true }) });
  const v = t.vinculos[0];
  for (const cl of [A, B, C, E, F]) await R("votar", { p_clave: cl, p_vinculo: v, p_valor: "contra", p_motivo: "no" });   // 5 en contra, 1 a favor: sin la marca volvería a debate
  assert.equal((await fila(A, "mars", "uranus", "Firme")).estado, "validado");
  await R("ajustar_umbral", { p_clave: ADM, p_votos: 8, p_num: 3, p_den: 4 });
  assert.equal((await fila(A, "mars", "uranus", "Firme")).estado, "validado");
  await R("ajustar_umbral", { p_clave: ADM, p_votos: 4, p_num: 2, p_den: 3 });
  const eli = (await R("miembros", { p_clave: ADM })).find((m) => m.nombre === "Eli").id;
  await R("expulsar", { p_clave: ADM, p_miembro: eli });
  const f = await fila(A, "mars", "uranus", "Firme");
  assert.equal(f.estado, "validado"); assert.equal(f.contra.length, 4);
});

await prueba("exportar: solo el admin, con nombres y votos, sin claves", async () => {
  await falla(R("exportar", { p_clave: A }), "solo_admin");
  const ex = await R("exportar", { p_clave: ADM });
  assert.equal(ex.grupo.nombre, "Prueba");
  const kafka = ex.textos.find((t) => t.titulo === "Ante la ley");
  assert.equal(kafka.autor, "Franz Kafka");
  assert.ok(kafka.combinaciones.some((c) => c.planetas.join() === "saturn,pluto" && c.votos.some((v) => v.nombre === "Ana")));
  const json = JSON.stringify(ex);
  assert.ok(!json.includes(A) && !json.includes("clave_hash"));
});

await prueba("avisos en vivo: cada cambio avisa solo al canal de su grupo", async () => {
  const avisos = [];
  const quitar = await db.listen("cambio", (p) => avisos.push(JSON.parse(p)));
  const topic1 = "g:" + (await R("sesion", { p_clave: A })).grupo.id, topic2 = "g:" + (await R("sesion", { p_clave: X })).grupo.id;
  const t = await R("proponer", { p_clave: A, ...propuesta({ p_titulo: "Aviso", p_autor: "Q", p_combinaciones: [["mercury"]] }) });
  await R("votar", { p_clave: B, p_vinculo: t.vinculos[0], p_valor: "favor" });
  await R("borrar_texto", { p_clave: ADM, p_texto: t.texto_id });                                // el borrado también avisa
  await new Promise((r) => setTimeout(r, 100));
  await quitar();
  assert.ok(avisos.length >= 3);
  assert.ok(avisos.every((a) => a.topic === topic1 && a.event === "cambio"), JSON.stringify(avisos[0]));
  assert.ok(avisos.every((a) => a.topic !== topic2));
});

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
