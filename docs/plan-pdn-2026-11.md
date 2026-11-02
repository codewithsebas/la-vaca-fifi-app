# Plan para PDN: migraciones del 1 de noviembre de 2026

Estado: **pendiente de autorización.** Las cuatro migraciones están aplicadas y probadas solo en QA (`tknhymkjuxmohywwaxnv`). Nada de
este plan se ha ejecutado en PDN (`menpgghjhztsswnmpzjk`). Sigue el protocolo de [docs/migraciones.md](migraciones.md).

Migraciones, en este orden:

1. [`20261101020000_quitar_pagos_en_linea_y_booking.sql`](../supabase/migrations/20261101020000_quitar_pagos_en_linea_y_booking.sql)
2. [`20261101120000_equipo_banos_e_importacion.sql`](../supabase/migrations/20261101120000_equipo_banos_e_importacion.sql)
3. [`20261101190000_pago_manual_con_valor.sql`](../supabase/migrations/20261101190000_pago_manual_con_valor.sql)
4. [`20261101200000_abono_configurable.sql`](../supabase/migrations/20261101200000_abono_configurable.sql)

El SQL exacto es el de esos archivos; no se edita nada para PDN.

## 0. Comprobaciones previas (solo lectura, en PDN)

Antes de pedir la autorización se corren estas consultas en PDN (SQL Editor de Supabase o `psql`, solo lectura) y sus resultados se
anotan aquí. Sirven para saber exactamente qué datos reales toca la migración 1 y confirmar que los administradores no pierden acceso
con la migración 2.

```sql
-- Historial: PDN debe tener aplicadas todas las migraciones anteriores a 20261101020000 y ninguna de estas dos.
select version, name from supabase_migrations.schema_migrations order by version desc limit 8;

-- Migración 1: filas que se perderían (las tablas pueden no existir; si no existen, no hay nada que perder).
select to_regclass('public.channel_bookings')   as channel_bookings,
       to_regclass('public.channel_stays')      as channel_stays,
       to_regclass('public.channel_credentials') as channel_credentials,
       to_regclass('public.channel_calendars')  as channel_calendars,
       to_regclass('public.payment_transactions') as payment_transactions;
-- Para cada tabla que exista:  select count(*) from public.<tabla>;
select count(*) filter (where needs_refund) as pagos_por_reembolsar from public.payments;            -- si la columna existe
select count(*) filter (where pay_token is not null) as enlaces_de_pago from public.reservations;    -- si la columna existe
select count(*) filter (where balance_due_at is not null or balance_overdue_at is not null) as plazos_saldo_en_linea
  from public.reservations;                                                                          -- si las columnas existen
select name from vault.secrets where name in ('channel_sync_url', 'channel_sync_secret');
select jobname, schedule from cron.job order by jobname;

-- Migración 2: cuentas del panel y su rol (deben tener app_metadata.role = 'admin' para conservar el acceso).
select email, raw_app_meta_data ->> 'role' as rol, banned_until from auth.users order by email;
```

Resultados (llenar antes de la autorización):

| Consulta                             | Resultado en PDN |
| ------------------------------------ | ---------------- |
| Última migración aplicada            |                  |
| Filas en tablas `channel_*`          |                  |
| Filas en `payment_transactions`      |                  |
| Pagos con `needs_refund = true`      |                  |
| Reservas con `pay_token`             |                  |
| Reservas con plazo de saldo en línea |                  |
| Secretos de Vault de canales         |                  |
| Tareas de cron                       |                  |
| Cuentas con rol `admin`              |                  |

## 1. Migración `20261101020000_quitar_pagos_en_linea_y_booking.sql`

**Objetivo:** retirar los pagos en línea (Wompi y la pasarela simulada) y la sincronización con Booking.com (iCal y Beds24). Los pagos
los registra el equipo (`register_manual_payment`) y el plazo del abono sigue vigente (`run_payment_deadlines` y el cron de plazos).

**Objetos afectados:**

- Tablas eliminadas: `channel_bookings`, `channel_stays`, `channel_credentials`, `channel_calendars`, `payment_transactions`.
- Columnas eliminadas: `payments.needs_refund`, `reservations.pay_token`, `reservations.balance_due_at`, `reservations.balance_overdue_at`.
- Índice eliminado: `reservations_pay_token_key`.
- Funciones eliminadas: `channel_changes`, `request_channel_sync`, `settle_payment`, `start_payment`, `notify_payment_change`.
- Funciones reemplazadas: `broadcast_availability` (ya no recibe fechas de Booking), `reservation_payment_rules`, `run_payment_deadlines`
  y `notify_reservation_change`.
- Triggers: se eliminan `reservations_channel_changes`, `blocks_channel_changes` y `payments_notify`; se recrean `reservations_notify`
  y `reservations_broadcast_change` sin las columnas eliminadas.
- Realtime: `channel_stays` sale de la publicación `supabase_realtime`.
- Cron: se desprograma `sincronizar-canales`.
- Vault: se borran los secretos `channel_sync_url` y `channel_sync_secret`.

**Se conserva:** la tabla `payments` completa (incluidos los pagos aprobados por la pasarela antes del cambio), `payment_proofs`, el plazo
del abono (`deposit_due_at` y el cron de plazos) y los avisos ya guardados en `admin_notifications`.

**Operaciones destructivas:** sí. `DROP TABLE` de cinco tablas, `DROP COLUMN` de cuatro columnas y borrado de dos secretos de Vault.

**Riesgo para los datos de PDN:** lo que se pierde son datos técnicos de integraciones que dejan de existir: la copia local de las
reservas de Booking (`channel_*`), los registros de transacciones de la pasarela (`payment_transactions`), los enlaces de pago y los plazos
del saldo en línea. Las reservas, los pagos registrados y los clientes no se tocan. Aun así, como no hay vuelta atrás sin respaldo, antes de
ejecutar se exportan esas tablas y columnas a CSV (paso 3.2), además del respaldo completo.

**Validaciones posteriores:**

- `select count(*) from public.reservations` y `select count(*) from public.payments` iguales a los de antes.
- Las tablas y columnas listadas ya no existen; `cron.job` conserva `plazos-de-pago` y no tiene `sincronizar-canales`.
- En el panel (solo lectura, son datos reales): la lista de reservas, la ficha de una reserva y Pagos cargan sin errores.

**Rollback:** no hay rollback por SQL de los datos eliminados. Si algo falla durante la ejecución, la transacción no se confirma y no
cambia nada. Si se detecta un problema después, se restauran del respaldo solo los objetos eliminados (tablas desde los CSV o el volcado,
columnas con `alter table … add column` y `update` desde el CSV).

## 2. Migración `20261101120000_equipo_banos_e_importacion.sql`

**Objetivo:** roles del panel (administrador y recepción), baños con estado y bloqueos, y reservas importadas desde Excel.

**Objetos afectados:**

- Funciones nuevas: `panel_role()`, `is_staff()`, `is_admin()` (leen `app_metadata.role` del JWT), `reservation_role_rules()`.
- Funciones reemplazadas: `register_manual_payment` (permitida a todo el equipo), `reservation_payment_rules` (acepta reservas importadas).
- Políticas RLS: se reemplazan las de administradores en `reservations`, `reservation_notes`, `blocks`, `client_profiles`, `client_entries`,
  `payment_proofs`, `admin_notifications`, `payments`, `email_outbox` y los comprobantes en `storage.objects`: leer, crear y editar pasa a
  todo el equipo; borrar sigue siendo de administradores. Se agregan políticas de lectura para el equipo en `cabin_types`, `rate_seasons`,
  `site_settings`, `site_policies`, `site_photos` y `site_services`.
- Trigger nuevo: `reservations_role_rules` (recepción no puede cancelar).
- Tablas nuevas: `bathrooms` y `bathroom_blocks`, con RLS, permisos y publicación en Realtime.
- Columnas nuevas en `reservations`: `external_ref` (única cuando existe), `channel` y `commission` (con valores por defecto).
- Restricciones ampliadas: `reservations_source_check` (agrega `import`), `reservations_guest_doc_type_check` (agrega `SD`) y
  `client_profiles_client_key_check` (agrega `SD:`).

**Operaciones destructivas o incompatibles:** ninguna sobre datos. Las restricciones se reemplazan por otras más amplias (todas las filas
actuales las cumplen), las columnas nuevas tienen valor por defecto y las políticas se reemplazan dentro de la misma transacción.

**Riesgo para los datos de PDN:** bajo. El único punto a confirmar es el acceso: los administradores actuales deben tener
`app_metadata.role = 'admin'` (las políticas actuales ya lo exigen, así que deberían tenerlo; se confirma con la consulta del paso 0).

**Validaciones posteriores:**

- `select count(*)` de reservas, pagos, clientes y bloqueos iguales a los de antes.
- Existen `bathrooms`, `bathroom_blocks` y las tres columnas nuevas; `pg_policies` muestra las políticas «Equipo …».
- En el panel, con una cuenta de administrador: dashboard, reservas, calendario, pagos, clientes, bloqueos y baños cargan.

**Rollback:** se puede preparar un script inverso (eliminar `bathrooms` y `bathroom_blocks`, las tres columnas si no hay reservas
importadas, el trigger y las funciones nuevas, y recrear las políticas anteriores). Lo preparo y lo pruebo en QA antes de la ejecución si
se autoriza el plan.

## 2b. Migración `20261101190000_pago_manual_con_valor.sql`

**Objetivo:** que el equipo registre el valor que realmente recibió (el abono, todo lo que falta o un valor a elección) y si fue en
efectivo o por transferencia.

**Objetos afectados:** se reemplaza `register_manual_payment` (se elimina la versión de 3 parámetros y se crea la de 4, con `p_amount`
opcional) y se vuelven a dar sus permisos (`authenticated`, `service_role`).

**Cambio de comportamiento:** cualquier pago confirma una reserva pendiente; el primero queda como abono (o pago total, si cubre todo) y
los siguientes como saldo; el saldo queda pagado cuando lo cobrado llega al total. Nunca se acepta más de lo que falta.

**Operaciones destructivas:** ninguna sobre datos (solo se reemplaza una función). Compatible con la app actual de PDN, que llama la
función con `p_code`, `p_kind` y `p_note` por nombre.

**Validaciones posteriores:** `select pg_get_function_identity_arguments('public.register_manual_payment'::regproc);` muestra los cuatro
parámetros. No se registran pagos de prueba en PDN (son datos reales).

**Rollback:** recrear la función anterior (el SQL exacto está en la migración 2) y eliminar la nueva.

## 2c. Migración `20261101200000_abono_configurable.sql`

**Objetivo:** que los administradores configuren el porcentaje del abono para confirmar (Contenido del sitio → Pagos).

**Objetos afectados:** columna nueva `site_settings.deposit_pct` (`smallint`, por defecto 30, entre 1 y 100).

**Operaciones destructivas:** ninguna. Arranca en 30, el valor que se usa hoy, así que nada cambia hasta que un administrador lo edite.
Las reservas existentes conservan el abono de su cotización.

**Validaciones posteriores:** `select deposit_pct from public.site_settings;` devuelve 30.

**Rollback:** `alter table public.site_settings drop column deposit_pct;` (la app vuelve a usar el 30 % del código).

## 3. Orden de ejecución propuesto

1. **Comprobaciones previas** del paso 0 y resultados anotados en la tabla.
2. **Respaldo** justo antes: `PDN_DB_URL='…' pnpm db:pdn:backup`, verificando que los archivos no estén vacíos, más la exportación a CSV
   de las tablas y columnas que elimina la migración 1.
3. **Autorización explícita** con los resultados y la ruta del respaldo.
4. **Migración 1** en una transacción, desde el SQL Editor de PDN (o `psql` con la cadena de PDN pasada en el momento), y registro en
   `supabase_migrations.schema_migrations`.
5. Validaciones de la migración 1.
6. **Migración 2** igual que la 1, y sus validaciones.
7. **Migraciones 3 y 4** (pago con valor y abono configurable), una por una, con sus validaciones.
8. **Despliegue de `main`** (merge de `develop` autorizado) en Hostinger, con `APP_ENV=pdn`.
9. Validaciones en el panel de producción con una cuenta de administrador, y creación de las cuentas de recepción si se quiere.

Si el sitio público de PDN sigue en modo «solo panel» (`SOLO_PANEL=1`), retirar los pagos en línea antes del despliegue no afecta a
huéspedes; si el sitio está abierto, las migraciones y el despliegue van seguidos en la misma ventana. La app actual de PDN sigue
funcionando con las migraciones 2, 3 y 4 aplicadas (agregan permisos, tablas, una columna con valor por defecto y una función compatible).

**Respaldo:** ruta y fecha del respaldo verificado: _(pendiente)_
