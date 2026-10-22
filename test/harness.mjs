// Una base Postgres de verdad (PGlite, en memoria) con el esquema de Conjugarnos cargado.
// Imita lo que trae Supabase: los roles anon/authenticated con permisos por defecto en `public`, y realtime.send.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA = path.join(AQUI, "..", "supabase", "schema.sql");

export async function nuevaBase(carpeta) {
  const db = carpeta ? new PGlite(carpeta) : new PGlite();       // con carpeta, los datos quedan guardados entre corridas
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $$;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    create schema if not exists realtime;
    create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
    language plpgsql as $$ begin perform pg_notify('cambio', json_build_object('topic', topic, 'event', event, 'payload', payload)::text); end $$;
  `);
  await db.exec(fs.readFileSync(SCHEMA, "utf8"));
  return db;
}

const lit = (v) => v === null || v === undefined ? "NULL"
  : typeof v === "number" ? String(v)
  : typeof v === "boolean" ? String(v)
  : "'" + (typeof v === "object" ? JSON.stringify(v) : String(v)).replace(/'/g, "''") + "'";

/** Llama a una función como lo haría PostgREST con la clave pública (rol anon). Devuelve el JSON o tira Error(mensaje). */
export async function rpc(db, nombre, args = {}, rol = "anon") {
  const lista = Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(", ");
  await db.exec(`set role ${rol}`);
  try {
    const r = await db.query(`select ${nombre}(${lista}) as r`);
    return r.rows[0].r;
  } catch (e) {
    const err = new Error(e.message); err.detail = e.detail; throw err;
  } finally {
    await db.exec("reset role");
  }
}

export const clave = (n) => "clave-de-prueba-" + String(n).padStart(16, "0");
export const palabras = (n, prefijo = "palabra") => Array.from({ length: n }, (_, i) => `${prefijo}${i}`).join(" ");
