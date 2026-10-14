-- Evalúa auth.jwt() una sola vez por consulta (lint 0003_auth_rls_initplan).
alter policy "Administradores gestionan tipos de cabaña" on public.cabin_types
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

alter policy "Administradores gestionan reservas" on public.reservations
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

alter policy "Administradores gestionan notas" on public.reservation_notes
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

alter policy "Administradores gestionan bloqueos" on public.blocks
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
