set client_min_messages = warning;
-- =====================================================================
--  AHP Web · Historia clínica + Agenda
--  Esquema para Supabase (PostgreSQL)
--  Ejecutar UNA vez en: Supabase → SQL Editor → New query → Run
--  Es seguro volver a ejecutarlo (usa IF NOT EXISTS / OR REPLACE).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- Función de normalización (sin tildes, minúsculas) usable en índices
create or replace function public.norm(t text) returns text
language sql immutable parallel safe security definer set search_path = public, extensions as $$
  select regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t,''))), '\s+', ' ', 'g')
$$;

-- ---------------------------------------------------------------------
--  USUARIOS / PERFILES
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  nombre        text not null default '',
  rol           text not null default 'recepcion' check (rol in ('medico','recepcion')),
  activo        boolean not null default false,
  firma_linea1  text,            -- p.ej. nombre del médico
  firma_linea2  text,            -- p.ej. "Reg. 1239-83"
  agenda_id     int,
  created_at    timestamptz not null default now()
);

-- ¿El usuario que llama es un usuario activo? (todos los activos son administradores)
create or replace function public.es_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo)
$$;

-- Crea el perfil cuando alguien se registra. El PRIMER usuario queda activo
-- (administrador inicial); los demás quedan inactivos hasta que un
-- administrador los active desde la app (Usuarios).
create or replace function public.crear_perfil_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare primero boolean;
begin
  select not exists (select 1 from public.perfiles where activo) into primero;
  insert into public.perfiles (id, email, nombre, rol, activo)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)),
          case when (new.raw_user_meta_data->>'rol') in ('medico','recepcion')
               then new.raw_user_meta_data->>'rol' else 'recepcion' end,
          primero)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- Para la pantalla de login: saber si ya existe algún usuario (sin exponer datos)
create or replace function public.hay_usuarios() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where activo)
$$;

-- ---------------------------------------------------------------------
--  CONFIGURACIÓN (encabezados de impresión, etc.)
-- ---------------------------------------------------------------------
create table if not exists public.configuracion (
  clave  text primary key,
  valor  jsonb
);

-- ---------------------------------------------------------------------
--  CATÁLOGOS
-- ---------------------------------------------------------------------
create table if not exists public.entidades (
  id      serial primary key,
  nombre  text unique not null,
  nit     text,
  activo  boolean not null default true
);

create table if not exists public.ocupaciones (
  nombre text primary key
);

create table if not exists public.plantillas (
  id         serial primary key,
  nombre     text not null,
  categoria  text not null default 'Otro',   -- Laboratorio | Imágenes | Medicamento | Otro
  contenido  text not null default '',
  legacy_id  text unique
);

-- ---------------------------------------------------------------------
--  PACIENTES
-- ---------------------------------------------------------------------
create table if not exists public.pacientes (
  id                     uuid primary key default gen_random_uuid(),
  legacy_id              text unique,          -- clave del sistema anterior (ARCOCOV/AHP)
  no_historia            text,
  tipo_documento         text,
  numero_documento       text,
  primer_nombre          text,
  segundo_nombre         text,
  primer_apellido        text,
  segundo_apellido       text,
  nombre_completo        text not null,
  fecha_nacimiento       date,
  lugar_nacimiento       text,
  genero                 text,
  estado_civil           text,
  ocupacion              text,
  telefono               text,
  telefono_oficina       text,
  telefono_movil         text,
  telefono_otro          text,
  correo                 text,
  direccion              text,
  lugar_residencia       text,
  codigo_residencia      text,
  zona                   text,
  responsable            text,
  responsable_parentesco text,
  responsable_telefono   text,
  acompanante            text,
  acompanante_telefono   text,
  nombre_madre           text,
  nombre_padre           text,
  entidad                text,
  vinculacion            text,
  no_afiliacion          text,
  eps                    text,
  eps_vinculacion        text,
  remitido               text,
  notas                  text,
  notas_privadas         text,
  registro_seguimiento   text,
  busqueda               text,                -- llenado por trigger (nombre + documento + historia normalizados)
  created_at             timestamptz not null default now(),
  created_by             uuid default auth.uid(),
  updated_at             timestamptz not null default now()
);

create or replace function public.pacientes_preparar() returns trigger
language plpgsql as $$
begin
  if coalesce(trim(new.nombre_completo),'') = '' then
    new.nombre_completo := trim(regexp_replace(concat_ws(' ', new.primer_nombre, new.segundo_nombre,
                                  new.primer_apellido, new.segundo_apellido), '\s+', ' ', 'g'));
  end if;
  new.busqueda := public.norm(concat_ws(' ', new.nombre_completo, new.numero_documento, new.no_historia));
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_pacientes_preparar on public.pacientes;
create trigger trg_pacientes_preparar before insert or update on public.pacientes
  for each row execute function public.pacientes_preparar();

create index if not exists pacientes_busqueda_trgm on public.pacientes using gin (busqueda extensions.gin_trgm_ops);
create index if not exists pacientes_doc_idx       on public.pacientes (numero_documento);
create index if not exists pacientes_hist_idx      on public.pacientes (no_historia);
create index if not exists pacientes_nombre_idx    on public.pacientes (public.norm(nombre_completo));

-- ---------------------------------------------------------------------
--  AGENDAS Y CITAS
-- ---------------------------------------------------------------------
create table if not exists public.agendas (
  id              serial primary key,
  nombre          text unique not null,
  identificacion  text,
  intervalo_min   int not null default 15,
  activo          boolean not null default true,
  usuario_id      uuid references public.perfiles(id) on delete set null
);

create table if not exists public.agenda_horarios (
  agenda_id      int references public.agendas(id) on delete cascade,
  dia            int not null check (dia between 1 and 7),   -- 1 = lunes … 7 = domingo
  manana_inicio  time,
  manana_fin     time,
  tarde_inicio   time,
  tarde_fin      time,
  primary key (agenda_id, dia)
);

create table if not exists public.agenda_notas (
  id         bigserial primary key,
  agenda_id  int references public.agendas(id) on delete cascade,
  fecha      date not null,
  nota       text not null,
  legacy_id  text unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists public.citas (
  id                     bigserial primary key,
  legacy_id              text unique,
  agenda_id              int references public.agendas(id) on delete set null,
  fecha                  date not null,
  hora_inicio            time not null,
  hora_fin               time,
  tipo                   text not null default 'Cita Médica',   -- Cita Médica | Cita Personal
  clasificacion          text,                                  -- Nueva, Control, Revisión, Procedimiento, Cirugía…
  paciente_id            uuid references public.pacientes(id) on delete set null,
  paciente_nombre        text,                                  -- texto (citas personales o antiguas sin enlace)
  descripcion            text,
  observacion            text,
  estado                 text not null default 'asignada'
                          check (estado in ('asignada','confirmada','en_espera','en_atencion','atendida','no_asistio','cancelada')),
  confirmacion_contacto  text,
  confirmada_en          timestamptz,
  llegada_en             timestamptz,
  motivo_cancelacion     text,
  cancelada_en           timestamptz,
  cancelada_por          text,
  registro_usuario       text,
  created_at             timestamptz not null default now(),
  created_by             uuid default auth.uid()
);
create index if not exists citas_fecha_idx    on public.citas (agenda_id, fecha, hora_inicio);
create index if not exists citas_paciente_idx on public.citas (paciente_id, fecha desc);

-- ---------------------------------------------------------------------
--  DOCUMENTOS CLÍNICOS (historia clínica / evolución)
--  Una vez FIRMADO un documento no se puede modificar ni borrar
--  (Res. 1995/1999). Las correcciones se hacen con notas aclaratorias.
-- ---------------------------------------------------------------------
create table if not exists public.consultas (
  id                      bigserial primary key,
  legacy_id               text unique,
  paciente_id             uuid not null references public.pacientes(id) on delete restrict,
  cita_id                 bigint references public.citas(id) on delete set null,
  no_documento            int,
  tipo                    text not null check (tipo in ('historia_clinica','evolucion')),
  fecha                   timestamp not null default (now() at time zone 'America/Bogota'),
  clasificacion           text,
  profesional             text,
  profesional_id          uuid default auth.uid(),
  motivo_consulta         text,
  enfermedad_actual       text,
  antecedentes_personales text,
  revision_sistemas       text,
  antecedentes_familiares text,
  examen_fisico           text,
  diagnostico             text,
  conducta                text,
  evolucion               text,
  firmada                 boolean not null default false,
  firmada_en              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists consultas_paciente_idx on public.consultas (paciente_id, fecha desc);

create or replace function public.consultas_proteger() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.firmada then raise exception 'Un documento clínico firmado no se puede eliminar'; end if;
    return old;
  end if;
  if old.firmada then
    -- único cambio permitido: desvincular la cita (si la cita se elimina)
    if (to_jsonb(new) - 'cita_id' - 'updated_at') = (to_jsonb(old) - 'cita_id' - 'updated_at') then
      return new;
    end if;
    raise exception 'Un documento clínico firmado no se puede modificar. Use una nota aclaratoria.';
  end if;
  if new.firmada and not old.firmada then new.firmada_en := now(); end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_consultas_proteger on public.consultas;
create trigger trg_consultas_proteger before update or delete on public.consultas
  for each row execute function public.consultas_proteger();

create table if not exists public.notas_aclaratorias (
  id           bigserial primary key,
  consulta_id  bigint not null references public.consultas(id) on delete restrict,
  texto        text not null,
  autor        text,
  autor_id     uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

-- Órdenes / prescripciones (exámenes de laboratorio, imágenes, medicamentos)
create table if not exists public.ordenes (
  id            bigserial primary key,
  legacy_id     text unique,
  paciente_id   uuid not null references public.pacientes(id) on delete restrict,
  consulta_id   bigint references public.consultas(id) on delete set null,
  fecha         timestamp not null default (now() at time zone 'America/Bogota'),
  categoria     text not null default 'Laboratorio',
  nombre        text not null,
  contenido     text not null default '',
  profesional   text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists ordenes_paciente_idx on public.ordenes (paciente_id, fecha desc);

-- Adjuntos (resultados de exámenes en PDF/JPG, etc.)
create table if not exists public.adjuntos (
  id              bigserial primary key,
  legacy_id       text unique,
  paciente_id     uuid not null references public.pacientes(id) on delete restrict,
  nombre          text not null,
  archivo         text,           -- nombre original del archivo
  storage_path    text,           -- ruta dentro del bucket "adjuntos" (null = aún no subido)
  mime            text,
  tamano          bigint,
  fecha           timestamp not null default (now() at time zone 'America/Bogota'),
  registrado_por  text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists adjuntos_paciente_idx on public.adjuntos (paciente_id, fecha desc);
create index if not exists adjuntos_archivo_idx  on public.adjuntos (archivo);

-- ---------------------------------------------------------------------
--  AUDITORÍA (quién hizo qué y cuándo, incluidos accesos a historias)
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id          bigserial primary key,
  fecha       timestamptz not null default now(),
  usuario_id  uuid default auth.uid(),
  usuario     text,
  tabla       text,
  registro    text,
  accion      text,
  detalle     jsonb
);
create index if not exists auditoria_fecha_idx on public.auditoria (fecha desc);

create or replace function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text; reg text;
begin
  -- Durante la importación masiva no se audita fila por fila
  if current_setting('ahp.importando', true) = 'si' then return coalesce(new, old); end if;
  select coalesce(nombre, email) into u from public.perfiles where id = auth.uid();
  reg := coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', '');
  insert into public.auditoria (usuario, tabla, registro, accion, detalle)
  values (u, tg_table_name, reg, tg_op,
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new))
               when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['pacientes','consultas','notas_aclaratorias','ordenes','adjuntos','citas','perfiles'] loop
    execute format('drop trigger if exists trg_auditar on public.%I', t);
    execute format('create trigger trg_auditar after insert or update or delete on public.%I for each row execute function public.auditar()', t);
  end loop;
end $$;

-- Registrar que alguien abrió la historia de un paciente
create or replace function public.registrar_acceso(p_paciente uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_activo() then raise exception 'No autorizado'; end if;
  insert into public.auditoria (usuario, tabla, registro, accion)
  select coalesce(nombre, email), 'pacientes', p_paciente::text, 'CONSULTA_HISTORIA'
  from public.perfiles where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
--  BÚSQUEDA DE PACIENTES (cédula, nombre o número de historia)
-- ---------------------------------------------------------------------
create or replace function public.buscar_pacientes(q text, limite int default 30)
returns table (
  id uuid, nombre_completo text, tipo_documento text, numero_documento text, no_historia text,
  fecha_nacimiento date, telefono text, telefono_movil text, entidad text,
  ultima_consulta timestamp, total_consultas bigint
)
language sql stable security invoker set search_path = public as $$
  with t as (select public.norm(q) as nq)
  select p.id, p.nombre_completo, p.tipo_documento, p.numero_documento, p.no_historia,
         p.fecha_nacimiento, p.telefono, p.telefono_movil, p.entidad,
         (select max(c.fecha) from public.consultas c where c.paciente_id = p.id),
         (select count(*)     from public.consultas c where c.paciente_id = p.id)
  from public.pacientes p, t
  where t.nq <> ''
    and (p.numero_documento = q or p.no_historia = q
         or p.busqueda like all (select '%' || w || '%' from unnest(string_to_array(t.nq, ' ')) w))
  order by (p.numero_documento = q or p.no_historia = q) desc,
           (select max(c.fecha) from public.consultas c where c.paciente_id = p.id) desc nulls last,
           p.nombre_completo
  limit limite
$$;

-- Resumen para el tablero
create or replace function public.estadisticas() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'pacientes', (select count(*) from public.pacientes),
    'consultas', (select count(*) from public.consultas),
    'adjuntos',  (select count(*) from public.adjuntos),
    'citas_hoy', (select count(*) from public.citas
                  where fecha = (now() at time zone 'America/Bogota')::date and estado <> 'cancelada')
  )
$$;

-- Importación masiva: inserta un lote (ignora los que ya existen) y devuelve cuántos entraron.
-- Desactiva la auditoría fila por fila sólo dentro de la llamada.
drop function if exists public.importar_lote(text, jsonb, text);
create or replace function public.importar_lote(tabla text, filas jsonb, conflicto text)
returns integer
language plpgsql security invoker set search_path = public as $$
declare cols text; n integer;
begin
  if not public.es_activo() then raise exception 'No autorizado'; end if;
  if tabla not in ('pacientes','consultas','ordenes','adjuntos','citas','plantillas',
                   'entidades','ocupaciones','agenda_notas') then
    raise exception 'Tabla no permitida: %', tabla;
  end if;
  perform set_config('ahp.importando', 'si', true);
  select string_agg(quote_ident(k), ',') into cols
  from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(filas) e) s;
  execute format(
    'insert into public.%1$I (%2$s)
       select %2$s from jsonb_populate_recordset(null::public.%1$I, $1)
     on conflict (%3$I) do nothing', tabla, cols, conflicto) using filas;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
--  SEGURIDAD (RLS): sólo usuarios activos ven o modifican datos
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['configuracion','entidades','ocupaciones','plantillas','pacientes','agendas',
                           'agenda_horarios','agenda_notas','citas','consultas','notas_aclaratorias',
                           'ordenes','adjuntos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_select on public.%I', t);
    execute format('drop policy if exists p_insert on public.%I', t);
    execute format('drop policy if exists p_update on public.%I', t);
    execute format('drop policy if exists p_delete on public.%I', t);
    execute format('create policy p_select on public.%I for select to authenticated using (public.es_activo())', t);
    execute format('create policy p_insert on public.%I for insert to authenticated with check (public.es_activo())', t);
    execute format('create policy p_update on public.%I for update to authenticated using (public.es_activo()) with check (public.es_activo())', t);
  end loop;
  -- Borrado sólo donde tiene sentido (nunca historias clínicas, notas, órdenes ni pacientes)
  foreach t in array array['configuracion','entidades','ocupaciones','plantillas','agenda_horarios','agenda_notas','adjuntos'] loop
    execute format('create policy p_delete on public.%I for delete to authenticated using (public.es_activo())', t);
  end loop;
end $$;

-- Consultas: borrar sólo borradores (no firmados)
drop policy if exists p_delete on public.consultas;
create policy p_delete on public.consultas for delete to authenticated
  using (public.es_activo() and not firmada);

-- Perfiles: cada quien ve el suyo; los activos ven y administran todos
alter table public.perfiles enable row level security;
drop policy if exists perfiles_select on public.perfiles;
drop policy if exists perfiles_update on public.perfiles;
create policy perfiles_select on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_activo());
create policy perfiles_update on public.perfiles for update to authenticated
  using (public.es_activo()) with check (public.es_activo());

-- Auditoría: sólo lectura para usuarios activos; nadie la modifica
alter table public.auditoria enable row level security;
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria for select to authenticated using (public.es_activo());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke insert, update, delete on public.auditoria from authenticated;
grant execute on function public.hay_usuarios() to anon, authenticated;

-- ---------------------------------------------------------------------
--  ALMACENAMIENTO DE ARCHIVOS (bucket privado "adjuntos")
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', false)
on conflict (id) do nothing;

drop policy if exists adjuntos_leer    on storage.objects;
drop policy if exists adjuntos_subir   on storage.objects;
drop policy if exists adjuntos_editar  on storage.objects;
drop policy if exists adjuntos_borrar  on storage.objects;
create policy adjuntos_leer   on storage.objects for select to authenticated using (bucket_id = 'adjuntos' and public.es_activo());
create policy adjuntos_subir  on storage.objects for insert to authenticated with check (bucket_id = 'adjuntos' and public.es_activo());
create policy adjuntos_editar on storage.objects for update to authenticated using (bucket_id = 'adjuntos' and public.es_activo());
create policy adjuntos_borrar on storage.objects for delete to authenticated using (bucket_id = 'adjuntos' and public.es_activo());

-- Configuración inicial (encabezado de impresión). Se puede cambiar desde la app.
insert into public.configuracion (clave, valor) values
  ('encabezado', '{"linea1":"","linea2":"","linea3":"","telefono":""}')
on conflict (clave) do nothing;

-- Tiempo real: la agenda del médico se actualiza sola cuando recepción agenda
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.citas;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
