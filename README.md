# La Vaca Fifí

Sitio web y sistema de reservas de La Vaca Fifí (vereda Pajonales, a 5 minutos de Murillo, Tolima): cabañas de colores con baño privado, balcón con vista a la montaña y desayuno americano incluido, y restaurante de finca. Next.js 16 (App Router) + React 19 + Tailwind CSS 4.

## Marca

- Logo: `public/logo-la-vaca-fifi.svg` (vector original) y `public/logo-la-vaca-fifi.png` (768 px, lo usan el sitio, los íconos de la app y los correos). Sello con los colores del letrero de la entrada y la vaca Holstein con su corona de flores. Si cambias el SVG, vuelve a exportar el PNG del mismo tamaño.
- Nombre: Alegreya SC (versalitas, como el letrero), en `components/brand/logo.tsx`.
- Paleta: «Letrero» (verde de finca, dorado de las letras, coral de las flores y terracota en los botones), en `lib/theme.ts` y `app/globals.css`. Se cambia desde el panel (Contenido del sitio → Colores).
- Fotos del cliente en `public/fotos/`: se ven en el sitio mientras no se suba otra desde el panel.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build
```

## Rutas

| Ruta                        | Qué es                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                         | Portada: presentación, cotizador de reserva, cabañas, servicios, la finca, ubicación, políticas y contacto                                                      |
| `/reservar`                 | Reserva en 4 pasos (acepta `?checkIn&checkOut&adults&children&type&pet&deco` desde la portada). El último paso retiene las fechas y abre el pago: abono o total |
| `/confirmacion?ref=`        | Resultado del pago al volver de la pasarela (aprobado, en proceso, rechazado), con la reserva y sus próximos pasos                                              |
| `/mi-reserva`               | Consulta de una reserva con código y correo: estado, lo pagado, saldo, plazos y botón de pago (abono o total; saldo antes de llegar o tras el check-in)         |
| `/pago-simulado?ref=`       | Pasarela simulada para desarrollo (sin llaves de Wompi)                                                                                                         |
| `/politicas`, `/privacidad` | Textos legales                                                                                                                                                  |
| `/admin/*`                  | Panel de administración (noindex). Una página por módulo, ver abajo                                                                                             |
| `/correos`                  | Vista previa de las plantillas de correo transaccional (noindex)                                                                                                |

### Panel

`app/admin/layout.tsx` monta el marco común (`components/admin/shell.tsx`): sesión, datos, tiempo real, menú, migas de pan, avisos y confirmaciones. Cada módulo es su propia ruta; el mapa de módulos y rutas está en `components/admin/routes.ts`. Los filtros y vistas de cada página se guardan en la URL (`?vista=…`), así que volver atrás o compartir un enlace conserva el estado.

| Ruta                                                            | Módulo                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/admin`                                                        | Dashboard: llegadas, salidas, pagos por completar (abonos y saldos con su plazo) y ocupación de la semana               |
| `/admin/calendario`                                             | Ocupación por cabaña (`?vista=dia\|3dias\|semana\|mes&fecha=&cabana=`)                                                  |
| `/admin/reservas`, `/admin/reservas/[codigo]`                   | Lista con filtros y ficha de cada reserva                                                                               |
| `/admin/pagos`                                                  | Transacciones (iniciadas, en proceso, aprobadas, rechazadas, por reembolsar), pagos recibidos y lo pendiente por cobrar |
| `/admin/clientes`, `/admin/clientes/[cc-123…]`                  | Clientes y su ficha con valoración interna                                                                              |
| `/admin/bloqueos`                                               | Bloqueos (`?nuevo=1&cabana=&unidad=&fecha=` o `?editar=<id>` abren el editor)                                           |
| `/admin/finanzas`                                               | Análisis de ingresos por periodo                                                                                        |
| `/admin/cabanas`, `/admin/cabanas/nueva`, `/admin/cabanas/[id]` | Cabañas del sitio                                                                                                       |
| `/admin/tarifas`                                                | Tarifa base y temporadas (`?temporada=nueva\|<id>`)                                                                     |
| `/admin/contenido/[seccion]`                                    | Contenido del sitio por zona (portada, la finca, horarios, políticas, contacto, pagos, redes)                           |
| `/admin/notificaciones`                                         | Historial de avisos                                                                                                     |
| `/admin/configuracion`                                          | Sonido, tiempo real, vista del calendario y sesión                                                                      |

## Dónde se edita cada cosa

- `lib/config.ts`: datos del negocio (teléfonos, dirección, tarifas, capacidad, horarios, políticas, % de abono, modo de pago del abono).
- Fotos: se suben desde el panel (Contenido del sitio y la ficha de cada cabaña) a Supabase Storage. Mientras un hueco o una cabaña no tenga foto subida, el sitio muestra la del diseño, de `public/fotos/` (`DEFAULT_PHOTOS` en `lib/site.ts` y las fotos de cada cabaña en `lib/config.ts`).
- `lib/content.ts`: fotos de «La finca» (experiencias) y servicios por defecto de la portada.
- `lib/emails.ts`: correos (HTML + texto plano). La confirmación de reserva y el mensaje del equipo se envían con Resend (`lib/server/mailer.ts`).
- `lib/payments.ts`: reglas de pago compartidas (minutos de retención, hora para pagar el saldo, etapas que ve el huésped).
- `app/globals.css`: tokens de color, tipografía y componentes base (paleta "Letrero"; las demás están en `lib/theme.ts` y se eligen en el panel).

Pendiente de completar en `lib/config.ts` y en la política de privacidad: `{CORREO_RESERVAS}`, `{DATOS_DE_PAGO}`, `{RAZON_SOCIAL}`, `{NIT}` y `{FECHA_DE_VIGENCIA}`.

Por confirmar con el cliente (vienen de Booking.com, Google Maps y otros portales): tarifas por cabaña y por persona adicional, número de cabañas de cada tipo (`units`), política de cambios de fecha y el % de abono. Las reservas se identifican con códigos `VF-XXXXX`.

## Backend (Next.js + Supabase)

Las rutas `app/api/*` implementan el contrato que usa el front (`lib/api.ts`) sobre Postgres en Supabase.

| Ruta                                                                                                           | Acceso                                              |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `GET /api/cabin-types`, `GET /api/availability`, `GET /api/availability/calendar`                              | Público                                             |
| `POST /api/reservations` (cabecera `Idempotency-Key`), `GET /api/reservations/lookup`                          | Público                                             |
| `POST /api/payments`, `GET /api/payments/status`, `POST /api/payments/simulate` (solo desarrollo)              | Público (código + correo, o la referencia del pago) |
| `POST /api/payments/webhook`                                                                                   | Eventos de Wompi (firma con `WOMPI_EVENTS_SECRET`)  |
| `GET/POST /api/admin/emails`                                                                                   | Sesión de administrador                             |
| `POST /api/admin/login`, `POST /api/admin/logout`                                                              | Supabase Auth                                       |
| `GET /api/admin/data`, `POST /api/admin/action`, `POST/DELETE /api/admin/blocks`, `PUT /api/admin/cabin-types` | Sesión con `app_metadata.role = "admin"`            |

**Seguridad.** Las rutas públicas usan la clave secreta solo en el servidor y validan todo (fechas, capacidad, campos, antispam). El panel usa la sesión del administrador, así que RLS limita el acceso. El rol `anon` no tiene permisos sobre ninguna tabla. La restricción `reservations_no_overlap` (exclusión GiST) impide en la base de datos que una unidad tenga dos reservas activas cruzadas, incluso con solicitudes simultáneas.

**Tiempo real.** El panel escucha `postgres_changes` con la sesión del administrador (RLS). El sitio público no puede leer reservas, así que la disponibilidad se sincroniza con un aviso: un trigger (`broadcast_availability`) publica en el canal público de Realtime `availability` la cabaña y las noches afectadas (sin datos personales) cada vez que cambia la ocupación, y el navegador vuelve a consultar la API (`lib/availability-sync.ts`). «Mi reserva» funciona igual: cada reserva tiene una clave aleatoria (`live_key`) que solo devuelve la consulta con código y correo, y el trigger `broadcast_reservation_change` publica un aviso vacío en `reserva:<clave>` cuando cambia el estado, las fechas, los valores o un comprobante (`lib/live-sync.ts`). El aviso solo dispara una nueva consulta; la API sigue validando. Un job de `pg_cron` (`plazos-de-pago`, cada minuto) vence las retenciones sin abono y registra los saldos vencidos. El panel también escucha `payments` y `email_outbox`; «Mi reserva» y la página del pago reciben el aviso cuando cambia un pago.

**Pagos (Wompi).** Una reserva solo se confirma con el abono aprobado:

1. El último paso del formulario retiene las fechas (`pending_deposit`, `HOLD_MINUTES` = 30 min), el huésped elige pagar el abono o el total, y se abre el Web Checkout de Wompi con firma de integridad y `expiration-time` igual al fin de la retención.
2. Wompi aprueba o rechaza. El resultado llega por el evento (`/api/payments/webhook`) y también al volver (`/confirmacion?ref&id` consulta la transacción con la llave privada).
3. `settle_payment` (Postgres) registra la transacción de forma idempotente y, si se aprobó, confirma la reserva, suma lo pagado (con el pago total, el saldo queda en cero) y encola el correo de confirmación, todo en una transacción. Un pago que llega cuando las fechas ya no están disponibles (o duplicado) queda marcado «por reembolsar», nunca crea una doble reserva.
4. Con la reserva confirmada, el huésped puede pagar el saldo cuando quiera antes de llegar. Si llega con saldo, el check-in fija `balance_due_at` = check-in + 1 hora (trigger) y lo paga desde «Mi reserva»; `start_payment` rechaza pagos fuera de plazo. Al vencer, `run_payment_deadlines` (pg_cron cada minuto y la API antes de leer) registra `balance_overdue_at` y avisa al panel; el equipo puede registrar el pago en recepción. El check-out exige el saldo pagado (lo impide la base de datos).

Estados: la reserva usa los de siempre (`pending_deposit` → `confirmed` → `checked_in` → `completed`); el saldo se deriva de `balance_due_at`, `balance_overdue_at` y `balance_paid_at`; cada intento de pago es un abono (`deposit`), un pago total (`full`) o un saldo (`balance`), y tiene `initiated`, `pending`, `approved`, `declined`, `error` o `expired` (tablas `payments` y `payment_transactions`).

En desarrollo local, el CDN de Wompi rechaza un retorno a `localhost`: se vuelve por `lavacafifi.localhost` (el navegador lo resuelve a tu equipo) y el resultado se verifica con la llave privada, porque el evento de Wompi no llega a tu máquina. Para recibir eventos en local usa un túnel https y configura su URL en Wompi.

**Correos (Resend).** La confirmación la encola la base de datos (`email_outbox`, una por reserva) y se envía después de responder al huésped: si Resend falla, la reserva sigue confirmada, el error queda en la fila, el panel recibe un aviso y el correo se reintenta con espera creciente (o desde la ficha de la reserva). Sin dominio verificado en Resend, el remitente `onboarding@resend.dev` solo puede enviar al correo de tu cuenta.

**Esquema.** `supabase/migrations/` (tablas `cabin_types`, `reservations`, `reservation_notes`, `blocks`). Tarifas, capacidad máxima y número de cabañas por tipo (`units`) viven en `cabin_types`; las tarifas se editan en el panel, `units` en el Table Editor de Supabase.

### Puesta en marcha

1. Copia `.env.example` a `.env.local` y completa la URL, la clave publicable y `SUPABASE_SECRET_KEY` (Dashboard → Project Settings → API Keys → Secret keys), las cuatro llaves de Wompi y `RESEND_API_KEY`. Nada secreto lleva el prefijo `NEXT_PUBLIC_`.
2. En producción: define `NEXT_PUBLIC_SITE_URL`, configura en Wompi la URL de eventos `https://<tu-dominio>/api/payments/webhook`, verifica tu dominio en Resend y define `EMAIL_FROM`.
3. Crea el usuario administrador en Dashboard → Authentication → Users → Add user (correo y contraseña, marcado como confirmado).
4. Dale el rol de administrador (SQL Editor):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
where email = 'tu-correo@ejemplo.com';
```

5. Recomendado: desactiva los registros públicos en Authentication → Sign In / Providers (solo entran cuentas creadas por ti).

### Modo simulado

Con `NEXT_PUBLIC_USE_MOCK_API=1` la app funciona sin backend (`lib/mock-server.ts`, datos en el `localStorage` del navegador, login de prueba con cualquier correo; los pagos usan la pasarela simulada y los correos se dan por enviados). Para simular errores del envío: `localStorage.setItem('vf-mock-settings', '{"post":"409"}')` (también `422`, `429`, `network`, `slow`).
