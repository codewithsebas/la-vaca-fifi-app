# Plan para PDN: panel sin conexión

Estado: **pendiente de autorización. Nada de este plan se ha ejecutado en PDN** (`menpgghjhztsswnmpzjk`). Aplicada y probada solo en QA (`tknhymkjuxmohywwaxnv`). Sigue el protocolo de [docs/migraciones.md](migraciones.md). Las migraciones pendientes de [docs/plan-pdn-2026-11.md](plan-pdn-2026-11.md) van **antes**.

### Migración `20261102200000_sincronizacion_offline.sql`

**Objetivo:** lo que el servidor necesita para sincronizar sin perder ni duplicar nada: versiones, registro de cambios con tombstones, registro de operaciones y pago idempotente.

**Objetos afectados:**

- Tablas nuevas: `sync_changes`, `sync_ops`.
- Columna `version` en `reservations`, `blocks`, `cabin_types`, `rate_seasons`, `client_profiles`, `bathrooms`, `bathroom_blocks`, `payment_proofs`, `site_settings`, `site_services`.
- Columna `client_op_id` e índice único parcial en `payments`, `reservation_notes`, `client_entries`.
- Funciones nuevas: `bump_version`, `log_sync_change`, `sync_cursor`, `sync_pull`, `purge_sync_log`.
- Función reemplazada: `register_manual_payment` (dos parámetros opcionales más; las llamadas anteriores siguen funcionando).
- Disparadores: `*_version` en las 10 tablas con versión; `*_sync` en 14 tablas.
- Políticas RLS en `sync_changes` y `sync_ops`.
- Publicación `supabase_realtime`: agrega `sync_changes`.
- Cron: `limpiar-registro-de-sincronizacion`, diario.

**Operaciones destructivas o incompatibles:** `drop function register_manual_payment(text, payment_kind, text, integer)`, recreada en la misma transacción con parámetros opcionales. No hay `DROP` de tablas o columnas, cambios de tipo ni `NOT NULL` sin valor por defecto.

**Riesgo para los datos de PDN:** ninguna fila existente cambia de valor. `add column ... default` no reescribe las tablas. Cada cambio futuro agrega una fila a `sync_changes` (se limpia a los 90 días). `sync_changes.row_key` guarda la clave del cliente (tipo y número de documento) y solo la lee el equipo.

**Orden de ejecución:**

1. Migraciones de `docs/plan-pdn-2026-11.md`, si siguen pendientes.
2. Respaldo verificado: `pnpm db:pdn:backup`.
3. Esta migración, en una transacción, y su registro en el historial.
4. Validaciones.
5. Despliegue de `main` **con `NEXT_PUBLIC_OFFLINE` sin definir**: el panel sigue funcionando como hoy, ya con la corrección del pago doble.
6. Prueba en un dispositivo y luego `NEXT_PUBLIC_OFFLINE=1` en el build de Hostinger.

**Validaciones posteriores:**

- `select count(*) from public.reservations` igual antes y después; lo mismo en `payments`.
- Las 10 tablas tienen `version` y `select max(version)` es 1 justo después de migrar, salvo actividad.
- `scripts/qa-sync-check.sql` **no se corre en PDN** (es solo para QA). En PDN se valida con un cambio real: crear y borrar un bloqueo lejano desde el panel y comprobar sus dos filas en `sync_changes`.
- `select * from cron.job where jobname = 'limpiar-registro-de-sincronizacion'`.
- El sitio público y el panel responden; crear una reserva de prueba solo si el negocio lo autoriza.

**Rollback:**

- Primero, apagar `NEXT_PUBLIC_OFFLINE` y redesplegar. Atención: lo que esté en la cola de cada dispositivo no se envía mientras esté apagada, y sigue guardado.
- Si hay que revertir la base, en este orden: quitar el cron; `alter publication supabase_realtime drop table public.sync_changes`; borrar los disparadores `*_sync` y `*_version`; borrar `sync_pull`, `sync_cursor`, `log_sync_change`, `bump_version`, `purge_sync_log`; borrar `sync_changes` y `sync_ops`; recrear `register_manual_payment` de 4 parámetros (`20261101190000_pago_manual_con_valor.sql`). Las columnas `version` y `client_op_id` pueden quedarse: no estorban.
- Requiere que la aplicación desplegada sea la anterior, porque las rutas nuevas leen esas columnas.

**Respaldo:** ruta y fecha del respaldo verificado: _(por completar antes de ejecutar)_

### Antes de activar la bandera en PDN

Decide con esto delante: una reserva creada sin conexión es **provisional** hasta sincronizar. Los límites completos están en la sección 4 de [plan-offline-first.md](plan-offline-first.md).
