# Plan: una reserva con varias cabañas

Decisiones del usuario (2026-11-05): en el panel **y** en la web; un solo pago para todo el grupo;
un solo correo con todas las cabañas; todas con las mismas fechas.

## Idea central

Cada cabaña sigue siendo una fila de `reservations`, como hoy. Las filas de un grupo comparten
`group_code`: el código de la **reserva principal** (la primera). El huésped solo ve y usa ese código.

Así no cambian el calendario, la disponibilidad, la restricción que evita reservas dobles, los baños
ni la sincronización. Lo que sí cambia es lo que se suma o se avisa: correos, avisos push, pagos,
plazo del abono y la página del huésped.

## 1. Base de datos (migración nueva, solo QA)

- `reservations.group_code text null`, con índice. Principal: `group_code = code`. Sin grupo: `null`.
- Las filas del grupo se insertan en **una sola sentencia** (insert de varias filas): si una cabaña ya
  no está libre, no se crea ninguna.
- Correos (`enqueue_reservation_emails`, `register_manual_payment`): solo la principal encola
  "recibida", "confirmada", "vencida", "pago total". El correo arma la lista con todas las del grupo.
  "Cancelada" y "reprogramada" de una sola cabaña sí salen, y dicen qué cabaña.
- Avisos al panel (`notify_reservation_change`): uno por grupo, no uno por cabaña.
- Pago del grupo: función nueva `register_group_payment(p_group_code, p_kind, p_amount, …)`.
  Reparte el monto entre las cabañas: el abono, el abono de cada una; el pago completo, lo que debe cada
  una; un valor libre, en proporción a lo que debe cada una (lo que sobra del redondeo va a la principal).
  Una sola transacción y una sola operación sin conexión.
- Plazo del abono: todas tienen el mismo `deposit_due_at`, así que vencen juntas; un solo correo.
- Comprobantes del huésped: se suben a la principal y, al aprobarlos, se reparten igual que un pago.

## 2. Panel

- **Nueva reserva:** botón "Agregar otra cabaña". Cada cabaña con su tipo, número y personas;
  huésped, fechas, pago y plazo, una sola vez. El total y el abono se ven sumados y por cabaña.
- **Detalle:** franja "Grupo VF-XXXXX · 3 cabañas" con enlaces a las otras. Pagos, saldo y correos se
  muestran del grupo. Cancelar ofrece "solo esta cabaña" o "todo el grupo".
- **Calendario:** las reservas del grupo llevan una marca común; al pasar o tocar una, se resaltan las demás.
- **Sin conexión:** primera versión, crear grupos y registrar pagos de grupo pide conexión (aviso claro).
  Ver y editar cada cabaña sin conexión sigue funcionando como hoy.

## 3. Web pública

- En el paso de cabaña se puede agregar más de una (con sus personas). Las fechas son las mismas.
- Disponibilidad: se comprueba que haya unidades libres para todas a la vez.
- Resumen, abono y página "Mi reserva" muestran el grupo con un solo código y un solo total.

## 4. Pruebas

- Pruebas unitarias: reparto de pagos, elección de unidades para varias cabañas del mismo tipo,
  totales del grupo.
- Copia con `NEXT_PUBLIC_USE_MOCK_API=1` en :3016 y Playwright: crear grupo en panel y web, pagar,
  cancelar una cabaña. El simulador (`mock-server.ts`) aprende los grupos.
- Contra QA real: solo la migración y lecturas. Crear un grupo en QA manda correos y push: se avisa antes.

## Orden

1. Migración en QA y tipos.
2. Crear grupo y pagar en el panel.
3. Correos y avisos.
4. Web pública.
5. Pruebas.

PDN después, con plan propio.
