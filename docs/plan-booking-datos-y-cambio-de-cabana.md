# Reservas de Booking con datos del huésped y cambio de cabaña

Dos piezas que se hacen primero en QA (`develop`). El paso a PDN va en un plan aparte y solo con autorización.

## Contexto

- Booking llega por calendario (iCal). Cada noche ocupada es una fila de `channel_stays` (cabaña, fechas y UID), sin
  datos del huésped. En el calendario del panel se dibuja como bloqueo «Booking.com · reserva o cierre».
- Una reserva no se puede cambiar de cabaña. `reschedule` (`src/app/api/admin/action/route.ts`) cambia las fechas y
  elige la cabaña sola con `findUnit`, siempre del mismo tipo. Por eso, el 7 de noviembre las reservas de Booking se
  cancelaron y se rehicieron a mano.
- Ya existe el camino de las importadas: `source = 'import'` entra confirmada, sin pagos y sin correos al huésped
  (`reservation_payment_rules` y los disparadores de correo ya lo respetan).

## Pieza 1: Cambiar de cabaña (primero, porque es la más corta)

**Qué ve el equipo.** En el detalle de la reserva aparece la acción «Cambiar de cabaña» (también en las acciones de la
tabla). Abre una lista con las cabañas físicas libres esas mismas noches: las del mismo tipo primero y después las de
otros tipos, con su capacidad. Se elige una y se guarda. Las fechas no cambian y el valor tampoco.

**Reglas**

- Es para reservas activas: sin confirmar, confirmadas, reprogramadas y en estadía. No es para canceladas, vencidas ni
  finalizadas.
- Solo se ofrecen cabañas libres en todas las noches: sin reservas que aparten fechas, sin bloqueos y sin noches de
  Booking. La restricción `reservations_no_overlap` es la última barrera y responde `DATES_UNAVAILABLE`.
- Cambiar a otro tipo exige que el número de personas quepa en la capacidad máxima de ese tipo. El total se conserva y
  el abono pagado sigue igual.
- En un grupo se mueve solo esa cabaña. El resto del grupo no cambia.
- No manda correo al huésped, porque la estadía es la misma. Queda en el historial de la reserva y en las
  notificaciones del equipo («VF-XXXXX pasó de Cabaña 3 a Cabaña 5»).
- Si la reserva viene de Booking (pieza 2), el panel avisa: «Muévela también en el extranet de Booking a la Cabaña N».

**Archivos**

- `src/app/api/admin/action/route.ts`: acción nueva `move` con `{ cabinTypeId, unit }`. Valida el estado y la
  capacidad, comprueba que esté libre con `loadOccupancy` y `findUnit`, y actualiza `cabin_type_id` y `unit` sin tocar
  fechas ni `quote`.
- `src/lib/booking.ts`: `freeUnitsFor(occ, types, ci, co, ignoreCode)` para armar la lista de cabañas libres. El
  cliente usa la misma función con los datos que ya tiene.
- `src/lib/offline/ops.ts` y `engine.ts`: operación `move` con la misma validación local. El servidor decide al
  sincronizar. Si choca, la operación queda con su error, como hoy pasa con el reagendado.
- `src/lib/mock/mock-server.ts`: la misma acción.
- `src/components/admin/reservation-detail.tsx`: acción `move` en `useReservationActions` (icono de flechas, gesto
  animado) y el modal `MoveCabinDialog`.
- `src/components/admin/reservations.tsx`: el icono en `ACTION_ICON`.
- Migración `supabase/migrations/20261108010000_cambio_de_cabana_y_booking.sql` (la misma de la pieza 2):
  - `notify_reservation_change` avisa del cambio de cabaña cuando cambian `cabin_type_id` o `unit` y no las fechas.
  - El correo de reagendado no se dispara cuando solo cambia la cabaña.

## Pieza 2: Completar los datos de una reserva de Booking

**Qué ve el equipo**

- Al hacer clic en una noche de Booking en el calendario se abre su detalle: cabaña, fechas y texto del iCal. Ahí está
  el botón «Completar datos de la reserva».
- El formulario es el de «Nueva reserva» con la cabaña y las fechas ya puestas y bloqueadas, y el canal «Booking.com».
- El equipo copia del extranet: nombre, celular, documento y correo (opcionales), personas, ciudad, número de reserva
  de Booking (en notas) y el valor total que muestra Booking.
- Se guarda como reserva **confirmada · Booking.com**, sin pedir abono, con el saldo por cobrar en recepción. El
  huésped queda en Clientes con su historial.
- En el calendario desaparece el bloqueo gris y queda la barra de la reserva con el nombre del huésped.
- Las noches de Booking sin completar se pueden filtrar («Booking sin datos») para que nada se quede sin nombre.

**Reglas**

- Entra con `source = 'import'` y `channel = 'Booking.com'`. Así no se mandan correos ni push de «reserva nueva», igual
  que con las importadas. No inventamos pagos: Booking cobra o garantiza por su lado. Si el huésped ya pagó en Booking,
  se registra el pago después, como cualquier pago.
- La noche de Booking queda **enlazada** a la reserva: columna nueva `channel_stays.reservation_code`. Una noche
  enlazada deja de ocupar por su cuenta, porque ocupa la reserva. No se cuenta dos veces ni salta el aviso de sobreventa.
- Si Booking cancela (la noche deja de venir en el iCal) y estaba enlazada, la reserva **no** se cancela sola. El equipo
  recibe el aviso «Booking canceló la reserva de la Cabaña N del X al Y (VF-XXXXX): revísala y cancélala en el panel».
- Si el equipo cambia las fechas o la cabaña de una reserva enlazada, o la cancela, se rompe el enlace. La noche de
  Booking vuelve a ocupar hasta que se cambie también en el extranet, y el panel lo recuerda con un aviso. Así el panel
  nunca vende una noche que Booking sigue teniendo.
- Una noche de Booking que ya pasó también se puede completar, para el historial y los reportes. Esa reserva entra como
  finalizada.

**Archivos**

- Migración `20261108010000_cambio_de_cabana_y_booking.sql`:
  - Columna `channel_stays.reservation_code` (referencia a `reservations.code`, `on delete set null`, única cuando no
    es nula).
  - `free_unit` ignora las noches enlazadas.
  - Disparador en `reservations`: al cancelar o al cambiar fechas, tipo o cabaña de una reserva enlazada, limpia el
    enlace y deja el aviso.
  - Tipo de aviso `channel_cancelled` en las comprobaciones de notificaciones.
- `src/app/api/admin/channels/route.ts` (o `booking`): `POST …/stays/:id/complete`. Valida que la noche siga activa y
  sin enlazar, crea la reserva importada con las mismas validaciones de huésped que `validateManualReservation` y enlaza
  la noche en la misma operación (función SQL `complete_channel_stay` para que sea atómico).
- `src/lib/server/channels.ts`: en `applyStays`, si una noche que se va estaba enlazada, avisa con `channel_cancelled`.
- Ocupación: excluir las noches enlazadas en `src/lib/server/db.ts` (consulta de `channel_stays`), `src/lib/booking.ts`
  (`channelBlocks`), `src/lib/offline/data.ts` y `src/lib/mock/mock-server.ts`.
- `src/lib/types.ts` y `database.types.ts` regenerados: `ChannelStay.reservationCode`.
- Panel:
  - `src/components/admin/calendar/shared.tsx` y `timeline.tsx`: clic en la noche de Booking → `ChannelStayDetail`.
  - `src/components/admin/new-reservation.tsx`: modo «desde Booking» con cabaña y fechas fijas, sin bloque de pago y
    con «Valor total en Booking».
  - `src/components/admin/reservation-detail.tsx`: insignia «Booking.com · enlazada a la Cabaña N».
  - Filtro «Booking sin datos» en Reservas o en el calendario.
- Sin conexión: completar una noche de Booking requiere conexión (la noche puede haber cambiado en Booking). El botón se
  deshabilita sin conexión con el mensaje «Necesitas conexión para enlazar con Booking».

## Orden de trabajo en QA

1. Migración en QA (`pnpm db:qa:*`) y tipos regenerados.
2. Pieza 1: servidor → sin conexión y simulador → panel.
3. Pieza 2: servidor y sincronización → ocupación → panel.
4. Commit en `develop` y push solo con tu autorización. Nada en PDN.

## Verificación (sin mandar push ni correos reales)

- `npx tsc --noEmit`, `npx eslint` y `vitest` sobre `src/lib/offline` (pruebas nuevas para `move` y para la ocupación
  con noches enlazadas).
- SQL en QA dentro de `begin … rollback`:
  - Mover una reserva a una cabaña libre funciona. A una ocupada responde con el choque.
  - Completar una noche de Booking crea la reserva importada, enlaza la noche y `free_unit` cuenta esa cabaña una vez.
  - Cancelar la reserva enlazada limpia el enlace y la noche vuelve a ocupar.
  - Quitar la noche (simulando que Booking canceló) deja el aviso `channel_cancelled`.
- En el navegador, local contra QA con tu sesión (vaca-fifi-dev, puerto 3010), usando reservas de prueba creadas como
  importadas para no disparar push:
  - «Cambiar de cabaña» lista solo las libres y guarda.
  - Una noche de Booking de QA se completa y el calendario muestra la reserva en lugar del bloqueo.

## Decisiones que propongo (cámbialas si no te sirven)

- Cambiar de cabaña permite **otro tipo**, conservando el total. La alternativa es solo el mismo tipo.
- La reserva de Booking **no se cancela sola** cuando Booking la cancela: solo avisa.
- Documento y correo **opcionales** al completar datos de Booking, porque el extranet no siempre los muestra.
