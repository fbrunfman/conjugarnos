-- =====================================================================================
-- Conjugarnos · base de datos (Postgres, pensada para Supabase)
--
-- Cómo usarlo: en Supabase → SQL Editor → pegar todo este archivo → Run. Se puede volver a correr.
--
-- Cómo funciona la seguridad (en criollo):
--   · Nadie lee ni escribe las tablas directamente: las tablas tienen RLS activado y sin políticas,
--     y se les sacaron los permisos a los roles anon y authenticated.
--   · Todo pasa por las funciones de abajo, que verifican quién sos con tu «clave personal» (un secreto
--     que se genera en tu navegador; acá solo se guarda su huella sha256, nunca la clave).
--   · No hay contraseñas ni mails: entrás con el link de invitación + un nombre. La clave personal
--     queda guardada en tu navegador y también sirve como «link para volver» desde otro dispositivo.
--   · Cada cambio avisa por Realtime (Broadcast) al canal del grupo «g:<id del grupo>». El aviso no lleva
--     contenido: solo dice «algo cambió» y cada pantalla vuelve a pedir lo suyo.
--
-- Reglas de partida (a probar con el grupo): se valida con 4 votos a favor y al menos 2/3 a favor.
-- Un texto validado vuelve a «en debate» si baja de la mitad a favor. Hasta 2000 palabras por texto.
-- =====================================================================================

-- ---------- utilidades ----------

create or replace function _planetas() returns text[] language sql immutable as
$$ select array['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'] $$;

create or replace function _palabras(t text) returns int language sql immutable as
$$ select case when btrim(coalesce(t, '')) = '' then 0
               else array_length(regexp_split_to_array(btrim(t), '\s+'), 1) end $$;

-- ---------- tablas ----------

create table if not exists grupo (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(btrim(nombre)) between 1 and 60),
  codigo        text not null unique,          -- el de los links de invitación
  codigo_admin  text unique,                   -- de un solo uso: quien entra con él queda de admin
  umbral_votos  int  not null default 4 check (umbral_votos between 1 and 50),
  umbral_num    int  not null default 2,       -- fracción mínima a favor: num/den (por defecto 2/3)
  umbral_den    int  not null default 3,
  max_palabras  int  not null default 2000 check (max_palabras between 50 and 20000),
  creado        timestamptz not null default now(),
  check (umbral_den between 1 and 10 and umbral_num between 1 and umbral_den and umbral_num * 2 >= umbral_den)
);

create table if not exists miembro (
  id         uuid primary key default gen_random_uuid(),
  grupo_id   uuid not null references grupo(id) on delete cascade,
  nombre     text not null check (length(btrim(nombre)) between 1 and 40),
  clave_hash bytea not null unique,
  rol        text not null default 'miembro' check (rol in ('admin', 'miembro')),
  creado     timestamptz not null default now()
);
create unique index if not exists miembro_nombre_unico on miembro (grupo_id, lower(btrim(nombre)));

create table if not exists texto (
  id                 uuid primary key default gen_random_uuid(),
  grupo_id           uuid not null references grupo(id) on delete cascade,
  titulo             text not null check (length(btrim(titulo)) between 1 and 200),
  autor              text not null check (length(btrim(autor)) between 1 and 120),
  cuerpo             text not null,                  -- el texto, la biografía; en una película o una canción puede quedar vacío
  palabras           int  not null,
  clase              text not null default 'texto' check (clase in ('texto', 'biografia', 'pelicula', 'cancion')),
  enlace             text,                           -- solo películas y canciones: un link (tráiler, YouTube, Spotify…)
  cargado_por        uuid references miembro(id) on delete set null,
  retiro_pedido_por  uuid references miembro(id) on delete set null,
  retiro_motivo      text check (retiro_motivo is null or length(retiro_motivo) <= 300),
  creado             timestamptz not null default now(),
  editado            timestamptz
);
-- Versiones anteriores tenían fuente, traductor y tipo: si la base ya existía, se sacan (no pasa nada si no estaban).
alter table texto drop column if exists fuente, drop column if exists traductor, drop column if exists tipo;
-- Si la base ya existía de antes: se suman la clase (texto, biografía, película o canción) y el link, y el cuerpo puede quedar vacío
-- en películas y canciones. Las reglas llevan nombre para poder volver a correr esto sin repetirlas.
alter table texto add column if not exists clase text not null default 'texto' check (clase in ('texto', 'biografia', 'pelicula', 'cancion'));
alter table texto add column if not exists enlace text;
alter table texto drop constraint if exists texto_cuerpo_check;      -- la regla de antes: el cuerpo no podía estar vacío
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'texto'::regclass and conname = 'texto_cuerpo_largo') then
    alter table texto add constraint texto_cuerpo_largo check (length(cuerpo) <= 200000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'texto'::regclass and conname = 'texto_cuerpo_requerido') then
    alter table texto add constraint texto_cuerpo_requerido check (clase in ('pelicula', 'cancion') or length(btrim(cuerpo)) >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'texto'::regclass and conname = 'texto_enlace_valido') then
    alter table texto add constraint texto_enlace_valido check (enlace is null or (length(enlace) <= 500 and enlace ~* '^https?://[^[:space:]]+$'));
  end if;
end $$;
create index if not exists texto_grupo on texto (grupo_id);

-- Un vínculo = un texto propuesto para una combinación (un planeta, o dos en el orden de siempre: Sol…Plutón).
create table if not exists vinculo (
  id          uuid primary key default gen_random_uuid(),
  texto_id    uuid not null references texto(id) on delete cascade,
  grupo_id    uuid not null references grupo(id) on delete cascade,
  planeta_a   text not null check (planeta_a = any (_planetas())),
  planeta_b   text check (planeta_b is null or planeta_b = any (_planetas())),
  estado      text not null default 'debate' check (estado in ('debate', 'validado')),
  validado_en timestamptz,
  forzado     boolean not null default false,   -- el admin lo validó él solo: los votos no lo mueven (hasta que lo devuelva a debate)
  forzado_por uuid references miembro(id) on delete set null,
  forzado_en  timestamptz,
  propuesto_por uuid references miembro(id) on delete set null,   -- quien propuso este texto para esta combinación
  justificacion text check (justificacion is null or length(btrim(justificacion)) between 1 and 500),   -- «lo agrego porque…» (opcional)
  creado      timestamptz not null default now(),
  check (planeta_b is null or array_position(_planetas(), planeta_a) < array_position(_planetas(), planeta_b))
);
-- Si la base ya existía de antes, se suman las columnas nuevas (no pasa nada si ya estaban).
alter table vinculo add column if not exists forzado boolean not null default false,
                    add column if not exists forzado_por uuid references miembro(id) on delete set null,
                    add column if not exists forzado_en timestamptz;
create unique index if not exists vinculo_unico on vinculo (texto_id, planeta_a, coalesce(planeta_b, ''));
create index if not exists vinculo_combo on vinculo (grupo_id, planeta_a, planeta_b);

create table if not exists voto (
  vinculo_id uuid not null references vinculo(id) on delete cascade,
  miembro_id uuid not null references miembro(id) on delete cascade,
  valor      text not null check (valor in ('favor', 'contra')),
  motivo     text check (motivo is null or length(btrim(motivo)) between 1 and 200),
  auto       boolean not null default false,   -- el voto a favor que cuenta de entrada para quien propone
  creado     timestamptz not null default now(),
  cambiado   timestamptz not null default now(),
  primary key (vinculo_id, miembro_id),
  check (valor = 'favor' or motivo is not null)
);

-- Si la base ya existía de antes: se suman la justificación y quién propuso cada texto. Para lo que ya estaba, quien lo propuso es
-- quien conserva el voto automático o, si ya no, quien cargó el texto. (Esto corre una sola vez: cuando la columna todavía no existe.)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vinculo' and column_name = 'propuesto_por') then
    alter table vinculo add column propuesto_por uuid references miembro(id) on delete set null;
    update vinculo v set propuesto_por = coalesce((select o.miembro_id from voto o where o.vinculo_id = v.id and o.auto limit 1),
                                                  (select t.cargado_por from texto t where t.id = v.texto_id));
  end if;
end $$;
alter table vinculo add column if not exists justificacion text check (justificacion is null or length(btrim(justificacion)) between 1 and 500);

-- Un comentario es de un texto (se ve en todas las combinaciones donde está). Si la persona se va del grupo, el comentario queda.
create table if not exists comentario (
  id         uuid primary key default gen_random_uuid(),
  texto_id   uuid not null references texto(id) on delete cascade,
  grupo_id   uuid not null references grupo(id) on delete cascade,
  miembro_id uuid references miembro(id) on delete set null,
  cuerpo     text not null check (length(btrim(cuerpo)) between 1 and 1000),
  creado     timestamptz not null default now()
);
create index if not exists comentario_texto on comentario (texto_id, creado);

-- ---------- permisos: las tablas quedan cerradas ----------

alter table grupo    enable row level security;
alter table miembro  enable row level security;
alter table texto    enable row level security;
alter table vinculo  enable row level security;
alter table voto     enable row level security;
alter table comentario enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on grupo, miembro, texto, vinculo, voto, comentario from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on grupo, miembro, texto, vinculo, voto, comentario from authenticated;
  end if;
end $$;

-- ---------- avisos en vivo ----------

create or replace function _avisar() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare g uuid;
begin
  if tg_table_name = 'grupo' then g := coalesce(new.id, old.id);
  elsif tg_table_name = 'voto' then
    select grupo_id into g from vinculo where id = coalesce(new.vinculo_id, old.vinculo_id);
  else g := coalesce(new.grupo_id, old.grupo_id);
  end if;
  if g is not null then
    begin
      perform realtime.send(jsonb_build_object('t', tg_table_name), 'cambio', 'g:' || g::text, false);
    exception when others then null;   -- si Realtime no está, la app igual funciona (consulta cada tanto)
    end;
  end if;
  return null;
end $$;

drop trigger if exists avisar_grupo   on grupo;
drop trigger if exists avisar_miembro on miembro;
drop trigger if exists avisar_texto   on texto;
drop trigger if exists avisar_vinculo on vinculo;
drop trigger if exists avisar_voto    on voto;
drop trigger if exists avisar_comentario on comentario;
create trigger avisar_grupo   after update on grupo                       for each row execute function _avisar();
create trigger avisar_miembro after insert or delete on miembro           for each row execute function _avisar();
create trigger avisar_texto   after update or delete on texto             for each row execute function _avisar();
create trigger avisar_vinculo after insert or update or delete on vinculo for each row execute function _avisar();
create trigger avisar_voto    after insert or update or delete on voto    for each row execute function _avisar();
create trigger avisar_comentario after insert or delete on comentario  for each row execute function _avisar();

-- ---------- ayudas internas (no se pueden llamar desde afuera) ----------

create or replace function _yo(p_clave text) returns miembro
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m miembro;
begin
  if p_clave is null or length(p_clave) < 32 or length(p_clave) > 128 then
    raise exception 'no_autorizado';
  end if;
  select * into m from miembro where clave_hash = sha256(convert_to(p_clave, 'UTF8'));
  if not found then raise exception 'no_autorizado'; end if;
  return m;
end $$;

create or replace function _admin(m miembro) returns void
language plpgsql immutable as $$
begin
  if m.rol <> 'admin' then raise exception 'solo_admin'; end if;
end $$;

-- La clase de lo que se propone: texto (por defecto), biografía, película o canción.
create or replace function _clase(p_clase text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare c text := coalesce(nullif(btrim(p_clase), ''), 'texto');
begin
  if c not in ('texto', 'biografia', 'pelicula', 'cancion') then raise exception 'clase_invalida'; end if;
  return c;
end $$;

-- El link, si lo hay: solo para películas y canciones, y tiene que ser http o https.
create or replace function _enlace(p_clase text, p_enlace text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare e text := nullif(btrim(coalesce(p_enlace, '')), '');
begin
  if e is null then return null; end if;
  if p_clase not in ('pelicula', 'cancion') then raise exception 'enlace_no_corresponde'; end if;
  if length(e) > 500 or e !~* '^https?://[^[:space:]]+$' then raise exception 'enlace_invalido'; end if;
  return e;
end $$;

-- Pone en orden una combinación y la valida. Devuelve {a, b}.
create or replace function _combo(p_a text, p_b text) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare a text := nullif(btrim(p_a), ''); b text := nullif(btrim(p_b), ''); t text;
begin
  if a is null and b is not null then a := b; b := null; end if;
  if a is null or not (a = any (_planetas())) then raise exception 'planeta_invalido'; end if;
  if b is not null then
    if not (b = any (_planetas())) or a = b then raise exception 'planeta_invalido'; end if;
    if array_position(_planetas(), a) > array_position(_planetas(), b) then t := a; a := b; b := t; end if;
  end if;
  return jsonb_build_object('a', a, 'b', b);
end $$;

-- Recalcula el estado de un vínculo con los votos de ahora y el umbral de su grupo.
--   en debate → validado: votos a favor ≥ umbral y fracción a favor ≥ num/den.
--   validado → en debate: si quedan menos de la mitad a favor (o ningún voto).
create or replace function _recalcular(p_vinculo uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v vinculo; g grupo; f int; c int; nuevo text;
begin
  select * into v from vinculo where id = p_vinculo;
  if not found then return; end if;
  if v.forzado then   -- lo validó el admin: los votos no lo mueven; solo «devolver a debate»
    if v.estado <> 'validado' then update vinculo set estado = 'validado', validado_en = coalesce(validado_en, now()) where id = p_vinculo; end if;
    return;
  end if;
  select * into g from grupo where id = v.grupo_id;
  select count(*) filter (where valor = 'favor'), count(*) filter (where valor = 'contra')
    into f, c from voto where vinculo_id = p_vinculo;
  if v.estado = 'validado' then
    nuevo := case when f + c = 0 or f * 2 < f + c then 'debate' else 'validado' end;
  else
    nuevo := case when f >= g.umbral_votos and f * g.umbral_den >= g.umbral_num * (f + c) then 'validado' else 'debate' end;
  end if;
  if nuevo <> v.estado then
    update vinculo set estado = nuevo, validado_en = case when nuevo = 'validado' then now() end where id = p_vinculo;
  end if;
end $$;

-- El admin deja un vínculo validado por su cuenta (lo usan proponer, agregar_combinacion y validar_ya).
create or replace function _forzar(p_vinculo uuid, p_miembro uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update vinculo set forzado = true, forzado_por = p_miembro, forzado_en = now(),
         estado = 'validado', validado_en = coalesce(validado_en, now())
   where id = p_vinculo and not forzado;
$$;

-- Cuántas palabras distintas hay entre dos cuerpos (para distinguir una errata de un cambio de verdad).
create or replace function _cambios(p_viejo text, p_nuevo text) returns int
language sql immutable as $$
  with a as (select w, count(*) c from unnest(regexp_split_to_array(lower(btrim(p_viejo)), '\s+')) w group by w),
       b as (select w, count(*) c from unnest(regexp_split_to_array(lower(btrim(p_nuevo)), '\s+')) w group by w)
  select coalesce(sum(abs(coalesce(a.c, 0) - coalesce(b.c, 0))), 0)::int from a full join b using (w)
$$;

create or replace function _sesion(m miembro) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g grupo;
begin
  select * into g from grupo where id = m.grupo_id;
  return jsonb_build_object(
    'miembro', jsonb_build_object('id', m.id, 'nombre', m.nombre, 'rol', m.rol),
    'grupo', jsonb_build_object('id', g.id, 'nombre', g.nombre, 'umbral_votos', g.umbral_votos,
                                'umbral_num', g.umbral_num, 'umbral_den', g.umbral_den, 'max_palabras', g.max_palabras),
    'invitacion', case when m.rol = 'admin' then g.codigo end);
end $$;

-- ---------- crear el grupo (solo desde el SQL Editor, como dueño de la base) ----------

create or replace function crear_grupo(p_nombre text, p_umbral_votos int default 4) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g grupo;
begin
  insert into grupo (nombre, codigo, codigo_admin, umbral_votos)
  values (btrim(p_nombre), substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
          substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), p_umbral_votos)
  returning * into g;
  return jsonb_build_object('id', g.id, 'codigo', g.codigo, 'codigo_admin', g.codigo_admin);
end $$;

-- ---------- entrar ----------

create or replace function ping() returns text language sql stable as $$ select 'ok'::text $$;

create or replace function unirse(p_codigo text, p_nombre text, p_clave text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g grupo; m miembro; es_admin boolean := false; nom text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  if p_clave is null or length(p_clave) < 32 or length(p_clave) > 128 then raise exception 'clave_invalida'; end if;
  if length(nom) < 1 or length(nom) > 40 then raise exception 'nombre_invalido'; end if;
  select * into g from grupo where codigo = btrim(p_codigo);
  if not found then
    select * into g from grupo where codigo_admin = btrim(p_codigo);
    if not found then raise exception 'invitacion_invalida'; end if;
    es_admin := true;
  end if;
  begin
    insert into miembro (grupo_id, nombre, clave_hash, rol)
    values (g.id, nom, sha256(convert_to(p_clave, 'UTF8')), case when es_admin then 'admin' else 'miembro' end)
    returning * into m;
  exception when unique_violation then
    if exists (select 1 from miembro where clave_hash = sha256(convert_to(p_clave, 'UTF8'))) then
      raise exception 'clave_invalida';
    end if;
    raise exception 'nombre_en_uso';
  end;
  if es_admin then update grupo set codigo_admin = null where id = g.id; end if;
  return _sesion(m);
end $$;

create or replace function sesion(p_clave text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return _sesion(_yo(p_clave));
end $$;

-- ---------- ver ----------

-- La grilla: por cada combinación que tiene algo, cuántos textos validados y cuántos en debate.
create or replace function grilla(p_clave text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('a', planeta_a, 'b', planeta_b, 'validados', validados, 'debate', debate))
    from (select planeta_a, planeta_b,
                 count(*) filter (where estado = 'validado') as validados,
                 count(*) filter (where estado = 'debate') as debate
          from vinculo where grupo_id = m.grupo_id group by planeta_a, planeta_b) x), '[]'::jsonb);
end $$;

-- Todo lo de una combinación exacta: los textos, su estado, la justificación de quien lo propuso, los votos con nombre y motivo y los comentarios de cada texto.
create or replace function combinacion(p_clave text, p_a text, p_b text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); c jsonb := _combo(p_a, p_b);
begin
  return coalesce((select jsonb_agg(z.fila order by z.orden, z.creado) from (
    select (case when v.estado = 'validado' then 0 else 1 end) as orden, v.creado,
      jsonb_build_object(
        'vinculo_id', v.id, 'estado', v.estado, 'creado', v.creado,
        'forzado', v.forzado, 'forzado_por', (select x.nombre from miembro x where x.id = v.forzado_por),
        'justificacion', v.justificacion, 'propuesto_por', (select x.nombre from miembro x where x.id = v.propuesto_por), 'propuesto_por_id', v.propuesto_por,
        'texto', jsonb_build_object('id', t.id, 'titulo', t.titulo, 'autor', t.autor, 'cuerpo', t.cuerpo, 'palabras', t.palabras,
                  'cargado_por', mp.nombre, 'cargado_por_id', t.cargado_por, 'editado', t.editado,
                  'retiro_pedido', t.retiro_pedido_por is not null, 'retiro_motivo', t.retiro_motivo,
                  'clase', t.clase, 'enlace', t.enlace,
                  'comentarios', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'quien', mc.nombre, 'quien_id', c.miembro_id,
                                                                              'cuerpo', c.cuerpo, 'creado', c.creado) order by c.creado)
                                           from comentario c left join miembro mc on mc.id = c.miembro_id
                                           where c.texto_id = t.id), '[]'::jsonb)),
        'favor', coalesce((select jsonb_agg(jsonb_build_object('nombre', mv.nombre) order by o.cambiado)
                           from voto o join miembro mv on mv.id = o.miembro_id
                           where o.vinculo_id = v.id and o.valor = 'favor'), '[]'::jsonb),
        'contra', coalesce((select jsonb_agg(jsonb_build_object('nombre', mv.nombre, 'motivo', o.motivo) order by o.cambiado)
                            from voto o join miembro mv on mv.id = o.miembro_id
                            where o.vinculo_id = v.id and o.valor = 'contra'), '[]'::jsonb),
        'mi_voto', (select o.valor from voto o where o.vinculo_id = v.id and o.miembro_id = m.id),
        'mi_motivo', (select o.motivo from voto o where o.vinculo_id = v.id and o.miembro_id = m.id)
      ) as fila
    from vinculo v
    join texto t on t.id = v.texto_id
    left join miembro mp on mp.id = t.cargado_por
    where v.grupo_id = m.grupo_id and v.planeta_a = c->>'a' and v.planeta_b is not distinct from (c->>'b')
  ) z), '[]'::jsonb);
end $$;

create or replace function miembros(p_clave text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'rol', x.rol, 'creado', x.creado,
      'textos', (select count(*) from texto t where t.cargado_por = x.id),
      'votos', (select count(*) from voto o where o.miembro_id = x.id and not o.auto)) order by x.creado)
    from miembro x where x.grupo_id = m.grupo_id), '[]'::jsonb);
end $$;

-- Lo último que pasó en el grupo: quién propuso qué, quién votó, quién comentó (sin el comentario) y qué validó el admin por su cuenta.
create or replace function actividad(p_clave text, p_n int default 30) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave);
begin
  return coalesce((select jsonb_agg(x.e order by x.cuando desc) from (
    select u.e, u.cuando from (
      select jsonb_build_object('tipo', 'texto', 'quien', mp.nombre, 'titulo', t.titulo, 'clase', t.clase, 'cuando', t.creado) as e, t.creado as cuando
      from texto t left join miembro mp on mp.id = t.cargado_por where t.grupo_id = m.grupo_id
      union all
      select jsonb_build_object('tipo', 'voto', 'quien', mv.nombre, 'valor', o.valor, 'titulo', t.titulo,
                                'a', v.planeta_a, 'b', v.planeta_b, 'estado', v.estado, 'cuando', o.cambiado), o.cambiado
      from voto o join miembro mv on mv.id = o.miembro_id join vinculo v on v.id = o.vinculo_id join texto t on t.id = v.texto_id
      where v.grupo_id = m.grupo_id and not o.auto
      union all
      select jsonb_build_object('tipo', 'validacion', 'quien', mf.nombre, 'titulo', t.titulo, 'a', v.planeta_a, 'b', v.planeta_b, 'cuando', v.forzado_en), v.forzado_en
      from vinculo v join texto t on t.id = v.texto_id left join miembro mf on mf.id = v.forzado_por
      where v.grupo_id = m.grupo_id and v.forzado
      union all
      select jsonb_build_object('tipo', 'comentario', 'quien', mc.nombre, 'titulo', t.titulo, 'cuando', c.creado), c.creado
      from comentario c join texto t on t.id = c.texto_id left join miembro mc on mc.id = c.miembro_id
      where c.grupo_id = m.grupo_id
    ) u order by u.cuando desc limit greatest(1, least(coalesce(p_n, 30), 100))
  ) x), '[]'::jsonb);
end $$;

-- ---------- proponer ----------

-- p_combinaciones: [["saturn","pluto"], ["saturn"]]  (una pareja, o un planeta solo)
-- p_validar (solo admin): el texto queda validado desde el principio en todas las combinaciones, sin votación.
-- p_justificacion (opcional, hasta 500 caracteres): por qué se propone; se guarda en cada combinación elegida.
-- p_clase: 'texto' (por defecto), 'biografia', 'pelicula' o 'cancion'. Texto y biografía llevan cuerpo; película y canción pueden no llevarlo.
-- p_enlace (opcional, solo película y canción): un link http(s), por ejemplo el de la canción.
drop function if exists proponer(text, text, text, text, text, text, text, jsonb);   -- la firma de antes (con fuente, traductor y tipo)
drop function if exists proponer(text, text, text, text, jsonb);                    -- la firma de antes (sin p_validar)
drop function if exists proponer(text, text, text, text, jsonb, boolean);           -- la firma de antes (sin p_justificacion)
drop function if exists proponer(text, text, text, text, jsonb, boolean, text);     -- la firma de antes (sin p_clase ni p_enlace)
create or replace function proponer(p_clave text, p_titulo text, p_autor text, p_cuerpo text, p_combinaciones jsonb,
                                    p_validar boolean default false, p_justificacion text default null,
                                    p_clase text default 'texto', p_enlace text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); g grupo; t texto; v vinculo; combo jsonb; combos jsonb[] := '{}'; ids uuid[] := '{}';
        n int; ya uuid; el jsonb; j text := nullif(btrim(coalesce(p_justificacion, '')), ''); cl text := _clase(p_clase); en text := _enlace(_clase(p_clase), p_enlace);
begin
  if coalesce(p_validar, false) then perform _admin(m); end if;
  if j is not null and length(j) > 500 then raise exception 'justificacion_larga'; end if;
  select * into g from grupo where id = m.grupo_id;
  if jsonb_typeof(p_combinaciones) is distinct from 'array' or jsonb_array_length(p_combinaciones) = 0 then raise exception 'sin_combinacion'; end if;
  if jsonb_array_length(p_combinaciones) > 12 then raise exception 'demasiadas_combinaciones'; end if;
  if length(btrim(coalesce(p_titulo, ''))) = 0 then raise exception 'falta_titulo'; end if;
  if length(btrim(coalesce(p_autor, ''))) = 0 then raise exception 'falta_autor'; end if;
  if cl in ('texto', 'biografia') and length(btrim(coalesce(p_cuerpo, ''))) = 0 then raise exception 'falta_texto'; end if;
  n := _palabras(p_cuerpo);
  if n > g.max_palabras then raise exception 'texto_largo'; end if;
  for el in select * from jsonb_array_elements(p_combinaciones) loop
    if jsonb_typeof(el) is distinct from 'array' or jsonb_array_length(el) not between 1 and 2 then raise exception 'planeta_invalido'; end if;
    combo := _combo(el->>0, el->>1);
    if not (combo = any (combos)) then combos := combos || combo; end if;
  end loop;
  select id into ya from texto where grupo_id = g.id and clase = cl and lower(btrim(titulo)) = lower(btrim(p_titulo)) and lower(btrim(autor)) = lower(btrim(p_autor)) limit 1;
  if ya is not null then raise exception 'texto_repetido' using detail = ya::text; end if;

  insert into texto (grupo_id, titulo, autor, cuerpo, palabras, cargado_por, clase, enlace)
  values (g.id, btrim(p_titulo), btrim(p_autor), btrim(coalesce(p_cuerpo, '')), n, m.id, cl, en)
  returning * into t;
  foreach combo in array combos loop
    insert into vinculo (texto_id, grupo_id, planeta_a, planeta_b, propuesto_por, justificacion)
    values (t.id, g.id, combo->>'a', combo->>'b', m.id, j) returning * into v;
    insert into voto (vinculo_id, miembro_id, valor, auto) values (v.id, m.id, 'favor', true);
    perform _recalcular(v.id);
    if coalesce(p_validar, false) then perform _forzar(v.id, m.id); end if;
    ids := ids || v.id;
  end loop;
  return jsonb_build_object('texto_id', t.id, 'vinculos', to_jsonb(ids));
end $$;

-- Proponer un texto que ya está cargado a otra combinación.
drop function if exists agregar_combinacion(text, uuid, text, text);   -- la firma de antes (sin p_validar)
drop function if exists agregar_combinacion(text, uuid, text, text, boolean);   -- la firma de antes (sin p_justificacion)
create or replace function agregar_combinacion(p_clave text, p_texto uuid, p_a text, p_b text default null, p_validar boolean default false,
                                               p_justificacion text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); t texto; combo jsonb := _combo(p_a, p_b); v vinculo; j text := nullif(btrim(coalesce(p_justificacion, '')), '');
begin
  if coalesce(p_validar, false) then perform _admin(m); end if;
  if j is not null and length(j) > 500 then raise exception 'justificacion_larga'; end if;
  select * into t from texto where id = p_texto and grupo_id = m.grupo_id;
  if not found then raise exception 'texto_inexistente'; end if;
  begin
    insert into vinculo (texto_id, grupo_id, planeta_a, planeta_b, propuesto_por, justificacion)
    values (t.id, t.grupo_id, combo->>'a', combo->>'b', m.id, j) returning * into v;
  exception when unique_violation then raise exception 'ya_propuesto';
  end;
  insert into voto (vinculo_id, miembro_id, valor, auto) values (v.id, m.id, 'favor', true);
  perform _recalcular(v.id);
  if coalesce(p_validar, false) then perform _forzar(v.id, m.id); end if;
  return jsonb_build_object('vinculo_id', v.id);
end $$;

-- Poner, cambiar o sacar la justificación de un texto en una combinación: quien lo propuso, o el admin. Vacía = sin justificación.
create or replace function justificar(p_clave text, p_vinculo uuid, p_justificacion text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); v vinculo; j text := nullif(btrim(coalesce(p_justificacion, '')), '');
begin
  select * into v from vinculo where id = p_vinculo and grupo_id = m.grupo_id;
  if not found then raise exception 'vinculo_inexistente'; end if;
  if m.rol <> 'admin' and v.propuesto_por is distinct from m.id then raise exception 'sin_permiso'; end if;
  if j is not null and length(j) > 500 then raise exception 'justificacion_larga'; end if;
  update vinculo set justificacion = j where id = v.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- votar ----------

create or replace function votar(p_clave text, p_vinculo uuid, p_valor text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); v vinculo; mot text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v from vinculo where id = p_vinculo and grupo_id = m.grupo_id;
  if not found then raise exception 'vinculo_inexistente'; end if;
  if p_valor not in ('favor', 'contra') then raise exception 'voto_invalido'; end if;
  if p_valor = 'contra' and mot is null then raise exception 'falta_motivo'; end if;
  if mot is not null and length(mot) > 200 then raise exception 'motivo_largo'; end if;
  insert into voto (vinculo_id, miembro_id, valor, motivo, auto)
  values (v.id, m.id, p_valor, case when p_valor = 'contra' then mot end, false)
  on conflict (vinculo_id, miembro_id) do update
    set valor = excluded.valor, motivo = excluded.motivo, auto = false, cambiado = now();
  perform _recalcular(v.id);
  return jsonb_build_object('estado', (select estado from vinculo where id = v.id));
end $$;

create or replace function quitar_voto(p_clave text, p_vinculo uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave);
begin
  if not exists (select 1 from vinculo where id = p_vinculo and grupo_id = m.grupo_id) then raise exception 'vinculo_inexistente'; end if;
  delete from voto where vinculo_id = p_vinculo and miembro_id = m.id;
  perform _recalcular(p_vinculo);
  return jsonb_build_object('estado', (select estado from vinculo where id = p_vinculo));
end $$;

-- ---------- el admin decide solo ----------

-- Validar ahora: el voto del admin alcanza. Además de dejar la marca, su voto queda a favor (si votaba en contra, se cambia).
-- Los demás siguen pudiendo votar, pero los votos ya no mueven este vínculo hasta que el admin lo devuelva a debate.
create or replace function validar_ya(p_clave text, p_vinculo uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); v vinculo;
begin
  perform _admin(m);
  select * into v from vinculo where id = p_vinculo and grupo_id = m.grupo_id;
  if not found then raise exception 'vinculo_inexistente'; end if;
  insert into voto (vinculo_id, miembro_id, valor, motivo, auto) values (v.id, m.id, 'favor', null, false)
  on conflict (vinculo_id, miembro_id) do update
    set valor = 'favor', motivo = null,
        auto = case when voto.valor = 'favor' then voto.auto else false end,
        cambiado = case when voto.valor = 'favor' then voto.cambiado else now() end;
  perform _forzar(v.id, m.id);
  return jsonb_build_object('estado', 'validado');
end $$;

-- Devolver a debate: se saca la marca y el texto se juzga de nuevo solo con los votos (si alcanzan, queda validado igual).
create or replace function quitar_validacion(p_clave text, p_vinculo uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); v vinculo;
begin
  perform _admin(m);
  select * into v from vinculo where id = p_vinculo and grupo_id = m.grupo_id;
  if not found then raise exception 'vinculo_inexistente'; end if;
  if v.forzado then
    update vinculo set forzado = false, forzado_por = null, forzado_en = null, estado = 'debate', validado_en = null where id = v.id;
    perform _recalcular(v.id);
  end if;
  return jsonb_build_object('estado', (select estado from vinculo where id = v.id));
end $$;

-- ---------- editar, retirar, borrar ----------

-- Puede editar quien cargó el texto o el admin. Cambiar el cuerpo reinicia los votos (y la validación del admin, si edita otra persona); corregir una errata, no
-- (se considera errata si cambian hasta 3 palabras, o el 2 % del texto).
drop function if exists editar_texto(text, uuid, text, text, text, text, text, text);   -- la firma de antes
-- La clase no se cambia. p_enlace: solo para película y canción (vacío = sin link).
drop function if exists editar_texto(text, uuid, text, text, text);   -- la firma de antes (sin p_enlace)
create or replace function editar_texto(p_clave text, p_texto uuid, p_titulo text, p_autor text, p_cuerpo text, p_enlace text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); t texto; g grupo; n int; cambia int; limite int; reinicia boolean; v record; en text;
begin
  select * into t from texto where id = p_texto and grupo_id = m.grupo_id;
  if not found then raise exception 'texto_inexistente'; end if;
  if m.rol <> 'admin' and t.cargado_por is distinct from m.id then raise exception 'sin_permiso'; end if;
  select * into g from grupo where id = m.grupo_id;
  if length(btrim(coalesce(p_titulo, ''))) = 0 then raise exception 'falta_titulo'; end if;
  if length(btrim(coalesce(p_autor, ''))) = 0 then raise exception 'falta_autor'; end if;
  if t.clase in ('texto', 'biografia') and length(btrim(coalesce(p_cuerpo, ''))) = 0 then raise exception 'falta_texto'; end if;
  en := _enlace(t.clase, p_enlace);
  n := _palabras(p_cuerpo);
  if n > g.max_palabras then raise exception 'texto_largo'; end if;
  if exists (select 1 from texto where grupo_id = t.grupo_id and id <> t.id and clase = t.clase
             and lower(btrim(titulo)) = lower(btrim(p_titulo)) and lower(btrim(autor)) = lower(btrim(p_autor))) then
    raise exception 'texto_repetido';
  end if;
  cambia := _cambios(t.cuerpo, coalesce(p_cuerpo, ''));
  limite := 2 * greatest(3, ceil(_palabras(t.cuerpo) * 0.02)::int);   -- cada palabra cambiada cuenta 2 (una sale, una entra)
  reinicia := cambia > limite;
  update texto set titulo = btrim(p_titulo), autor = btrim(p_autor), cuerpo = btrim(coalesce(p_cuerpo, '')), palabras = n, enlace = en, editado = now()
   where id = t.id;
  if reinicia then
    delete from voto where vinculo_id in (select id from vinculo where texto_id = t.id);
    -- La validación del admin era sobre el texto de antes: si lo cambia otra persona se pierde; si lo cambia el admin, sigue.
    update vinculo set estado = case when forzado and m.rol = 'admin' then 'validado' else 'debate' end,
                       validado_en = case when forzado and m.rol = 'admin' then validado_en end,
                       forzado_por = case when forzado and m.rol = 'admin' then forzado_por end,
                       forzado_en = case when forzado and m.rol = 'admin' then forzado_en end,
                       forzado = (forzado and m.rol = 'admin')
     where texto_id = t.id;
    if t.cargado_por is not null then
      for v in select id from vinculo where texto_id = t.id loop
        insert into voto (vinculo_id, miembro_id, valor, auto) values (v.id, t.cargado_por, 'favor', true);
        perform _recalcular(v.id);
      end loop;
    end if;
  end if;
  return jsonb_build_object('reiniciado', reinicia);
end $$;

-- Cualquier miembro puede pedir que se retire un texto; el admin decide.
create or replace function pedir_retiro(p_clave text, p_texto uuid, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave);
begin
  update texto set retiro_pedido_por = m.id, retiro_motivo = nullif(left(btrim(coalesce(p_motivo, '')), 300), '')
   where id = p_texto and grupo_id = m.grupo_id;
  if not found then raise exception 'texto_inexistente'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Los pedidos de retiro que están esperando al admin.
create or replace function retiros(p_clave text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave);
begin
  perform _admin(m);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'texto_id', t.id, 'titulo', t.titulo, 'autor', t.autor, 'motivo', t.retiro_motivo,
      'pedido_por', (select nombre from miembro where id = t.retiro_pedido_por),
      'combinaciones', coalesce((select jsonb_agg(case when v.planeta_b is null then jsonb_build_array(v.planeta_a)
                                                       else jsonb_build_array(v.planeta_a, v.planeta_b) end)
                                 from vinculo v where v.texto_id = t.id), '[]'::jsonb)) order by t.creado)
    from texto t where t.grupo_id = m.grupo_id and t.retiro_pedido_por is not null), '[]'::jsonb);
end $$;

create or replace function descartar_pedido(p_clave text, p_texto uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave);
begin
  perform _admin(m);
  update texto set retiro_pedido_por = null, retiro_motivo = null where id = p_texto and grupo_id = m.grupo_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function borrar_texto(p_clave text, p_texto uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave);
begin
  perform _admin(m);
  delete from texto where id = p_texto and grupo_id = m.grupo_id;
  if not found then raise exception 'texto_inexistente'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Sacar un texto de una combinación (no del grupo): el admin, o quien lo cargó si nadie más votó.
create or replace function quitar_combinacion(p_clave text, p_vinculo uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); v vinculo; t texto;
begin
  select * into v from vinculo where id = p_vinculo and grupo_id = m.grupo_id;
  if not found then raise exception 'vinculo_inexistente'; end if;
  select * into t from texto where id = v.texto_id;
  if m.rol <> 'admin' then
    if t.cargado_por is distinct from m.id
       or exists (select 1 from voto where vinculo_id = v.id and miembro_id <> m.id) then
      raise exception 'sin_permiso';
    end if;
  end if;
  delete from vinculo where id = v.id;
  if not exists (select 1 from vinculo where texto_id = t.id) then delete from texto where id = t.id; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- comentarios ----------

-- Comentar un texto: cualquiera del grupo, hasta 1000 caracteres.
create or replace function comentar(p_clave text, p_texto uuid, p_cuerpo text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); c text := btrim(coalesce(p_cuerpo, '')); nuevo uuid;
begin
  if not exists (select 1 from texto where id = p_texto and grupo_id = m.grupo_id) then raise exception 'texto_inexistente'; end if;
  if length(c) = 0 then raise exception 'falta_comentario'; end if;
  if length(c) > 1000 then raise exception 'comentario_largo'; end if;
  insert into comentario (texto_id, grupo_id, miembro_id, cuerpo) values (p_texto, m.grupo_id, m.id, c) returning id into nuevo;
  return jsonb_build_object('id', nuevo);
end $$;

-- Borrar un comentario: quien lo escribió, o quien administra el grupo.
create or replace function borrar_comentario(p_clave text, p_comentario uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); c comentario;
begin
  select * into c from comentario where id = p_comentario and grupo_id = m.grupo_id;
  if not found then raise exception 'comentario_inexistente'; end if;
  if m.rol <> 'admin' and c.miembro_id is distinct from m.id then raise exception 'sin_permiso'; end if;
  delete from comentario where id = c.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- el grupo ----------

create or replace function ajustar_umbral(p_clave text, p_votos int, p_num int, p_den int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave);
begin
  perform _admin(m);
  if p_votos is null or p_votos < 1 or p_votos > 50 then raise exception 'umbral_invalido'; end if;
  if p_den is null or p_num is null or p_den < 1 or p_den > 10 or p_num < 1 or p_num > p_den or p_num * 2 < p_den then raise exception 'umbral_invalido'; end if;
  update grupo set umbral_votos = p_votos, umbral_num = p_num, umbral_den = p_den where id = m.grupo_id;
  -- Los textos que estaban en debate se revisan con el umbral nuevo; los ya validados siguen hasta que bajen de la mitad.
  perform _recalcular(id) from vinculo where grupo_id = m.grupo_id and estado = 'debate';
  return _sesion(m);
end $$;

create or replace function expulsar(p_clave text, p_miembro uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave); x miembro; ids uuid[];
begin
  perform _admin(m);
  select * into x from miembro where id = p_miembro and grupo_id = m.grupo_id;
  if not found then raise exception 'miembro_inexistente'; end if;
  if x.id = m.id then raise exception 'no_podes_expulsarte'; end if;
  select coalesce(array_agg(vinculo_id), '{}') into ids from voto where miembro_id = x.id;
  delete from miembro where id = x.id;           -- sus votos se van con él; sus textos quedan sin autor
  perform _recalcular(i) from unnest(ids) i;
  return jsonb_build_object('ok', true);
end $$;

-- Copia de seguridad de todo el grupo (solo el admin). No incluye claves.
create or replace function exportar(p_clave text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m miembro := _yo(p_clave);
begin
  perform _admin(m);
  return jsonb_build_object(
    'exportado', now(),
    'grupo', (select jsonb_build_object('nombre', nombre, 'umbral_votos', umbral_votos, 'umbral_num', umbral_num,
                                        'umbral_den', umbral_den, 'max_palabras', max_palabras) from grupo where id = m.grupo_id),
    'miembros', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'rol', rol, 'desde', creado) order by creado)
                          from miembro where grupo_id = m.grupo_id), '[]'::jsonb),
    'textos', coalesce((select jsonb_agg(jsonb_build_object(
        'clase', t.clase, 'titulo', t.titulo, 'autor', t.autor, 'cuerpo', t.cuerpo, 'enlace', t.enlace,
        'cargado_por', (select nombre from miembro where id = t.cargado_por), 'creado', t.creado,
        'comentarios', coalesce((select jsonb_agg(jsonb_build_object('quien', mc.nombre, 'cuerpo', c.cuerpo, 'creado', c.creado) order by c.creado)
                                 from comentario c left join miembro mc on mc.id = c.miembro_id where c.texto_id = t.id), '[]'::jsonb),
        'combinaciones', coalesce((select jsonb_agg(jsonb_build_object(
            'planetas', case when v.planeta_b is null then jsonb_build_array(v.planeta_a) else jsonb_build_array(v.planeta_a, v.planeta_b) end,
            'estado', v.estado, 'validado_por_admin', v.forzado,
            'propuesto_por', (select nombre from miembro where id = v.propuesto_por), 'justificacion', v.justificacion,
            'votos', coalesce((select jsonb_agg(jsonb_build_object('nombre', mv.nombre, 'valor', o.valor, 'motivo', o.motivo) order by o.cambiado)
                               from voto o join miembro mv on mv.id = o.miembro_id where o.vinculo_id = v.id), '[]'::jsonb)))
          from vinculo v where v.texto_id = t.id), '[]'::jsonb)) order by t.creado)
      from texto t where t.grupo_id = m.grupo_id), '[]'::jsonb));
end $$;

-- ---------- quién puede llamar qué ----------

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on function %s from authenticated', f.sig); end if;
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and p.proname in ('ping', 'unirse', 'sesion', 'grilla', 'combinacion', 'miembros', 'actividad', 'proponer',
                               'agregar_combinacion', 'justificar', 'votar', 'quitar_voto', 'validar_ya', 'quitar_validacion', 'editar_texto', 'pedir_retiro', 'retiros', 'descartar_pedido',
                               'borrar_texto', 'quitar_combinacion', 'comentar', 'borrar_comentario', 'ajustar_umbral', 'expulsar', 'exportar')
  loop
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('grant execute on function %s to anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
