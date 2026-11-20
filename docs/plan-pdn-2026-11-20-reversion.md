# Plan para PDN: quitar el cierre automático (20 de noviembre)

Estado: **pasos 0 a 3 hechos el 20 de noviembre, con autorización; falta el paso 4 (revisión con sesión).** `main` en
`1d6c7aa`, publicado por Hostinger en unos 165 s; portada, `/reservar`, `/mi-reserva`, `/login` y `/admin` en 200 y el panel
ya sin código del cierre automático. Respaldo en
`~/respaldos-la-vaca-fifi/2026-11-20T14-21-38/` (119 reservas, 87 pagos, los 28 `-AUTO`). Migración aplicada a las 14:23 UTC
(9:23 a. m.) en una transacción con su fila en el historial. Resultado: 85 confirmadas, 2 completadas, 59 pagos, 0 pagos
automáticos, sin `auto_closing` ni `auto_closed_at`, `run_auto_checkouts` anterior, sin avisos ni correos nuevos; las 28
reservas idénticas a `cierre-automatico-antes.json` (0 diferencias). Ningún paso se ejecuta sin la autorización explícita del responsable.

El 20 de noviembre se subió a PDN el cierre automático de estadías ([plan-pdn-2026-11-20.md](plan-pdn-2026-11-20.md)), que
cerró 28 reservas y dio por pagados $5.378.300. El mismo día el responsable pidió **quitarlo y dejar todo como antes**. Este
plan sube esa reversión, que ya está probada en QA (`develop`, `9e21774`).

## Urgencia

El cierre sigue activo en PDN: cada día a las **12:30 p. m.** cierra las estadías que salen ese día y les da el saldo por
pagado. Si la reversión no se aplica antes de las 12:30 del día siguiente, se cerrarán también las que salgan ese día (la
migración las deshace igual, pero conviene evitarlo).

## Qué sube

| Commit    | Qué trae                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------- |
| `e033b8d` | Quita el cierre automático del panel y agrega la migración que lo quita de la base y deshace los cierres |
| `9e21774` | Ajuste de esa migración (ejecuta antes un disparador diferido) y tipos de QA                             |
| `3e7b8c0` | Primer ingreso: la foto es opcional y se piden nombre y apellido, en un campo vacío                      |
| `1c32dd1` | Solo documentación                                                                                       |

Se conserva el canal «Booking.com» de las reservas de Booking. Sin variables de entorno ni dependencias nuevas.

## Qué hace la migración `20261120010000_quitar_cierre_automatico`

Todo en una transacción:

1. `run_auto_checkouts`, `notify_reservation_change` y `enqueue_reservation_emails` vuelven a sus versiones anteriores
   (copiadas tal cual de `20261105050000` y `20261105020000`): a las 12:30 solo se completan las estadías en curso ya pagadas
   y se avisa «Check-out pendiente» de las que tienen saldo. Se borra `auto_closing()`.
2. Para cada reserva con `auto_closed_at`:
   - se borran sus pagos `provider = 'auto'` y se descuentan de lo pagado;
   - el abono y el saldo que marcó el cierre (con la hora del cierre) vuelven a quedar sin pagar; el check-in que puso (con
     la hora de llegada) se quita; lo que ya estaba registrado antes no se toca;
   - vuelve a «Confirmada» (o «En estadía» si tenía un check-in real).
3. Se ejecuta el disparador diferido `reservations_bump_unpaid` (`set constraints all immediate`) y se borran los avisos
   «auto_closed».
4. Se quitan `reservations.auto_closed_at`, el proveedor `'auto'` y el tipo de aviso `'auto_closed'`.

No escribe al huésped ni deja avisos: ningún cambio pasa a cancelada, vencida ni a saldo pagado.

## Riesgo para los datos de PDN

- **Las 28 reservas vuelven a como estaban el 20 de noviembre a las 6:36 a. m.** Comprobado por lectura en PDN: aplicando la
  misma lógica a los datos actuales, las 28 quedan idénticas a `cierre-automatico-antes.json` (estado, lo pagado, abono, saldo
  y check-in), sin diferencias.
- Se borran 28 pagos «sin confirmar» ($5.378.300): Finanzas de noviembre vuelve a lo que mostraba antes.
- Si alguien del equipo registró un pago real a una de esas reservas después del cierre, se conserva (solo se borran los
  `provider = 'auto'`), pero el abono y el saldo se recalculan como arriba: el paso 0 lo revisa.
- Probado en QA el 20 de noviembre: 12 reservas devueltas sin diferencias, 0 pagos automáticos, ningún aviso ni correo nuevo.

## Por qué en este orden

Primero la migración: detiene el cierre en ese mismo momento. La versión del panel que hoy está en PDN funciona sin la columna
(no la pide por nombre). Después el código, que quita del panel las etiquetas del cierre y trae el cambio del primer ingreso.

## Pasos

### 0. Inventario, solo lectura (necesita el CLI con la cuenta de PDN)

```sql
select version from supabase_migrations.schema_migrations order by version desc limit 1;            -- 20261120000000
select count(*) from public.reservations where auto_closed_at is not null;                          -- 28 (o más si el cron cerró otras)
select count(*), sum(amount) from public.payments where provider = 'auto';                          -- 28, 5.378.300
-- Pagos reales registrados después del cierre en reservas cerradas (deben revisarse antes):
select p.reservation_code, p.amount, p.created_at from public.payments p
  join public.reservations r on r.code = p.reservation_code
 where r.auto_closed_at is not null and p.provider <> 'auto' and p.created_at > r.auto_closed_at;  -- vacío
select status, count(*) from public.reservations group by 1 order by 1;
select count(*) from public.payments;
```

Y la comprobación de que la reversión deja cada reserva igual que antes del cierre (la consulta de
`undo_check.sql`, comparada con `cierre-automatico-antes.json`). Si algo no coincide, se detiene el plan.

**Resultado (20 de noviembre, 9:20 a. m., solo lectura):** última migración `20261120000000`; 28 reservas cerradas y 28 pagos
`auto` por $5.378.300, como se esperaba; ningún pago real registrado después del cierre en esas reservas; ninguna estadía
abierta sale hoy. Reservas: 57 confirmadas, 6 sin abono, 20 canceladas, 6 vencidas, 30 completadas (119). Pagos: 87 (uno real
nuevo desde la mañana, en otra reserva). La reversión deja las 28 idénticas a `cierre-automatico-antes.json` (0
diferencias). Después de la migración se espera: 85 confirmadas, 2 completadas y 59 pagos.

### 1. Respaldo (con Docker Desktop encendido)

```bash
supabase db dump --remote=menpgghjhztsswnmpzjk  # roles, esquema y datos en ~/respaldos-la-vaca-fifi/<fecha>/
```

Se comprueba que los archivos no estén vacíos (y que traigan los 28 pagos `auto`, para poder volver a este punto).

### 2. Migración

`20261120010000_quitar_cierre_automatico.sql` en una transacción, con su fila en `supabase_migrations.schema_migrations`.
Luego, por lectura:

```sql
select count(*) from public.payments where provider not in ('wompi', 'simulado', 'manual');   -- 0
select to_regproc('public.auto_closing');                                          -- null
select count(*) from information_schema.columns where table_name = 'reservations' and column_name = 'auto_closed_at'; -- 0
select pg_get_functiondef('public.run_auto_checkouts'::regproc) like '%checkout_pending%';                           -- true
select status, count(*) from public.reservations group by 1 order by 1;           -- 28 más en «Confirmada», 28 menos en «Completada»
select count(*) from public.payments;                                             -- 28 menos
select count(*) from public.admin_notifications where created_at > now() - interval '10 minutes'; -- 0
select count(*) from public.email_outbox where created_at > now() - interval '10 minutes';        -- 0
```

Y las 28 reservas comparadas una por una con `cierre-automatico-antes.json`: sin diferencias.

### 3. Código

Merge de `develop` en `main` y push. Hostinger publica solo (unos 2 minutos). Se revisa que la portada, `/reservar`,
`/mi-reserva`, `/login` y `/admin` respondan 200.

### 4. Validación con la sesión del responsable

- Una de las 28 (por ejemplo, una de Booking): «Confirmada», con su saldo pendiente, sin pago «Sin confirmar».
- Avisos: ya no está «Se cerraron 28 estadías automáticamente».
- Finanzas de noviembre: sin los $5.378.300.

## Si algo sale mal

| Falla en | Qué hacer                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| Paso 2   | La transacción se deshace sola; la base queda como estaba. Se revisa el error (en QA ya se corrigió uno).        |
| Paso 3   | Hostinger deja la versión anterior; si no publica en 10 minutos, redesplegar a mano. Revertir el merge si falla. |
| Paso 4   | Restaurar desde el respaldo del paso 1 las filas de `reservations` y `payments` de las 28 reservas.              |

## A tener en cuenta

- Las 28 reservas quedan otra vez abiertas con su saldo: el equipo tiene que registrar a mano los pagos reales y el check-out.
- La reserva VF-S34P7 (Mario Aldana, vencida el 20 de noviembre sin abono) no la tocó el cierre ni la toca esta reversión.
- GitHub Actions sigue bloqueado por facturación: la validación se hizo a mano (`pnpm check` con 130 pruebas y `pnpm build`).
