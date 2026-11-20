-- Rol superadministrador.
--
-- · Rol nuevo 'superadmin' (app_metadata.role): todo lo del administrador y, además, el registro de actividad
--   (migración siguiente) y las cuentas de otros superadministradores. is_staff() e is_admin() lo incluyen, así que todas
--   las políticas y funciones que ya usan esas funciones lo aceptan. Las políticas antiguas que comparaban el JWT con
--   'admin' directamente pasan a is_admin().
-- · No cambia ninguna cuenta: el rol se le da a una persona desde Empleados (solo otro superadministrador) o a mano en
--   Supabase Auth (app_metadata.role = 'superadmin').

-- ───────────── Roles ─────────────
create or replace function public.is_staff() returns boolean
language sql
stable
set search_path = ''
as $$
  select public.panel_role() in ('superadmin', 'admin', 'recepcion')
$$;

create or replace function public.is_admin() returns boolean
language sql
stable
set search_path = ''
as $$
  select public.panel_role() in ('superadmin', 'admin')
$$;

create or replace function public.is_superadmin() returns boolean
language sql
stable
set search_path = ''
as $$
  select public.panel_role() = 'superadmin'
$$;

-- Políticas antiguas con el rol escrito a mano: pasan a is_admin() (tipos de cabaña, temporadas, contenido y fotos del sitio).
do $$
declare
  p record;
  old_expr constant text := '((( SELECT auth.jwt() AS jwt) -> ''app_metadata''::text) ->> ''role''::text) = ''admin''::text';
  new_expr constant text := '( SELECT public.is_admin() AS is_admin)';
  sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (position(old_expr in coalesce(qual, '')) > 0 or position(old_expr in coalesce(with_check, '')) > 0)
  loop
    sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then sql := sql || format(' using (%s)', replace(p.qual, old_expr, new_expr)); end if;
    if p.with_check is not null then sql := sql || format(' with check (%s)', replace(p.with_check, old_expr, new_expr)); end if;
    execute sql;
  end loop;
  if exists (
    select 1 from pg_policies
    where schemaname in ('public', 'storage') and coalesce(qual, '') || coalesce(with_check, '') like '%''admin''::text%'
  ) then
    raise warning 'Quedan políticas que comparan el rol con ''admin'' directamente: revisarlas para el superadministrador.';
  end if;
end;
$$;

