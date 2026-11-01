# La Vaca Fifí

Sitio web y sistema de reservas de La Vaca Fifí (vereda Pajonales, a 5 minutos de Murillo, Tolima): cabañas de colores con baño privado, balcón con vista a la montaña y desayuno americano incluido, y restaurante de finca. Next.js 16 (App Router) + React 19 + Tailwind CSS 4.

## Marca

- Logo: `public/logo-la-vaca-fifi.svg` (vector original) y `public/logo-la-vaca-fifi.png` (768 px, lo usan el sitio, los íconos de la app y los correos). Sello con los colores del letrero de la entrada y la vaca Holstein con su corona de flores. Si cambias el SVG, vuelve a exportar el PNG del mismo tamaño.
- Nombre: Alegreya SC (versalitas, como el letrero), en `src/components/brand/logo.tsx`.
- Paleta: «Letrero» (verde de finca, dorado de las letras, coral de las flores y terracota en los botones), en `src/lib/theme.ts` y `src/app/globals.css`. Se cambia desde el panel (Contenido del sitio → Colores).
- Fotos del cliente en `public/fotos/`: se ven en el sitio mientras no se suba otra desde el panel.

## Desarrollo

Requisitos: Node 22 (`.nvmrc`) y pnpm 11 (la versión exacta está en `packageManager`; con Corepack activo se usa sola).

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

| Script                         | Qué hace                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `pnpm dev`                     | Servidor de desarrollo (Turbopack)                                           |
| `pnpm build` / `pnpm start`    | Build de producción (webpack, salida standalone) y servidor                  |
| `pnpm lint`                    | ESLint                                                                       |
| `pnpm typecheck`               | TypeScript sin emitir                                                        |
| `pnpm format` / `format:check` | Prettier (con orden de clases de Tailwind)                                   |
| `pnpm test` / `test:watch`     | Pruebas con Vitest (`src/**/*.test.ts`)                                      |
| `pnpm check`                   | Todo lo anterior menos el build: lo mismo que revisa el CI antes de compilar |
| `pnpm db:qa:*` / `db:pdn:*`    | Base de datos por entorno (`scripts/db.mjs`): ver `docs/migraciones.md`      |

El CI (`.github/workflows/ci.yml`) corre lint, tipos, formato, pruebas y build en cada push o PR a `main` y `develop`.

### Estructura

```
src/
  app/                 rutas (App Router): (site)/ sitio público, admin/ panel, api/ backend
  components/
    admin/             panel (calendar/ en módulos: timeline, month-grid, day-agenda)
    booking/           flujo de reserva: wizard/, calendario de fechas, consulta y estado del pago
    brand/             logo, Fifí, decoraciones y cielo nocturno
    landing/           secciones de la portada
    site/              header, footer, tema, proveedor de contenido, service worker
    ui/                primitivas compartidas (íconos, combobox, choice, floating, status-pill)
    dev/               herramientas de desarrollo (vista previa de correos)
  lib/
    client/            solo navegador: cliente de la API, tiempo real, última reserva, imágenes
    server/            solo servidor (server-only): base de datos, correo, push, env
    mock/              modo simulado (se carga con import dinámico, no entra al bundle de producción)
    supabase/          clientes de Supabase y tipos generados
    *.ts               reglas compartidas: reservas, pagos, formatos, tipos, configuración, contenido
  instrumentation.ts   revisión de variables de entorno al arrancar
  proxy.ts             modo «solo panel» (SOLO_PANEL=1)
supabase/migrations/   esquema de la base de datos
scripts/               utilidades (generar el logo)
```

Convenciones: archivos en kebab-case, imports con el alias `@/` (nunca rutas relativas), URLs en español y código en inglés. Las variables de entorno del servidor se leen siempre desde `src/lib/server/env.ts`.

### Ramas y despliegue

- `main` es producción (PDN): Hostinger (Node.js Web App) despliega cada push a `main`. `develop` es QA: todo desarrollo nuevo va ahí y pasa a `main` solo validado en QA y con autorización.
- Cada entorno usa su propia base de Supabase. Los cambios de esquema siguen el protocolo de `docs/migraciones.md` (nunca se aplican en PDN sin plan y autorización).
- El servidor de Hostinger tiene glibc 2.28: el build usa webpack y el SWC en WASM (`@next/swc-wasm-nodejs`, misma versión que `next`), la config es `next.config.mjs` (JavaScript plano), la salida es `standalone` y pnpm usa `nodeLinker: hoisted`. No cambiar sin probar el build en Hostinger.
- `SOLO_PANEL=1` publica solo el panel: el sitio público redirige a `/admin` y su API responde 404 (`src/proxy.ts`).
- `/correos` es una herramienta de desarrollo: en producción responde 404.
- `APP_ENV` (`qa` | `pdn`) dice en qué entorno corre la app; si la URL de Supabase no es la de ese entorno, el servidor no arranca. En desarrollo local siempre se exige la base de QA.

## Rutas

| Ruta                        | Qué es                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                         | Portada: presentación, cotizador de reserva, cabañas, servicios, la finca, ubicación, políticas y contacto                                                  |
| `/reservar`                 | Reserva en 4 pasos (acepta `?checkIn&checkOut&adults&children&type&pet&deco` desde la portada). El último paso retiene las fechas mientras se paga el abono |
| `/mi-reserva`               | Consulta de una reserva con código y correo: estado, lo pagado, saldo, plazo del abono e instrucciones para pagar por transferencia                         |
| `/politicas`, `/privacidad` | Textos legales                                                                                                                                              |
| `/admin/*`                  | Panel de administración (noindex). Una página por módulo, ver abajo                                                                                         |
| `/correos`                  | Vista previa de las plantillas de correo (solo desarrollo)                                                                                                  |

### Panel

`src/app/admin/layout.tsx` monta el marco común (`src/components/admin/shell.tsx`): sesión, datos, tiempo real, menú, migas de pan, avisos y confirmaciones. Cada módulo es su propia ruta; el mapa de módulos y rutas está en `src/components/admin/routes.ts`. Los filtros y vistas de cada página se guardan en la URL (`?vista=…`), así que volver atrás o compartir un enlace conserva el estado.

| Ruta                                                            | Módulo                                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/admin`                                                        | Dashboard: llegadas, salidas, pagos por completar (abonos con su plazo y saldos) y ocupación de la semana |
| `/admin/calendario`                                             | Ocupación por cabaña (`?vista=dia\|3dias\|semana\|mes&fecha=&cabana=`)                                    |
| `/admin/reservas`, `/admin/reservas/[codigo]`                   | Lista con filtros y ficha de cada reserva                                                                 |
| `/admin/pagos`                                                  | Pagos recibidos, lo pendiente por cobrar y comprobantes de transferencia                                  |
| `/admin/clientes`, `/admin/clientes/[cc-123…]`                  | Clientes y su ficha con valoración interna                                                                |
| `/admin/bloqueos`                                               | Bloqueos (`?nuevo=1&cabana=&unidad=&fecha=` o `?editar=<id>` abren el editor)                             |
| `/admin/finanzas`                                               | Análisis de ingresos por periodo                                                                          |
| `/admin/cabanas`, `/admin/cabanas/nueva`, `/admin/cabanas/[id]` | Cabañas del sitio                                                                                         |
| `/admin/tarifas`                                                | Tarifa base y temporadas (`?temporada=nueva\|<id>`)                                                       |
| `/admin/contenido/[seccion]`                                    | Contenido del sitio por zona (portada, la finca, horarios, políticas, contacto, pagos, redes)             |
| `/admin/notificaciones`                                         | Historial de avisos                                                                                       |
| `/admin/configuracion`                                          | Sonido, tiempo real, vista del calendario y sesión                                                        |

## Dónde se edita cada cosa

- `src/lib/config.ts`: datos del negocio (teléfonos, dirección, tarifas, capacidad, horarios, políticas, % de abono, modo de pago del abono).
- Fotos: se suben desde el panel (Contenido del sitio y la ficha de cada cabaña) a Supabase Storage. Mientras un hueco o una cabaña no tenga foto subida, el sitio muestra la del diseño, de `public/fotos/` (`DEFAULT_PHOTOS` en `src/lib/site.ts` y las fotos de cada cabaña en `src/lib/config.ts`).
- `src/lib/content.ts`: fotos de «La finca» (experiencias) y servicios por defecto de la portada.
- `src/lib/emails.ts`: correos (HTML + texto plano). La confirmación de reserva y el mensaje del equipo se envían con Resend (`src/lib/server/mailer.ts`).
- `src/lib/payments.ts`: reglas de pago compartidas (plazos para pagar el abono, etapas que ve el huésped).
- `src/app/globals.css`: tokens de color, tipografía y componentes base (paleta "Letrero"; las demás están en `src/lib/theme.ts` y se eligen en el panel).

Pendiente de completar en `src/lib/config.ts` y en la política de privacidad: `{CORREO_RESERVAS}`, `{DATOS_DE_PAGO}`, `{RAZON_SOCIAL}`, `{NIT}` y `{FECHA_DE_VIGENCIA}`.

Por confirmar con el cliente (vienen de Booking.com, Google Maps y otros portales): tarifas por cabaña y por persona adicional, número de cabañas de cada tipo (`units`), política de cambios de fecha y el % de abono. Las reservas se identifican con códigos `VF-XXXXX`.

## Backend (Next.js + Supabase)

Las rutas `src/app/api/*` implementan el contrato que usa el front (`src/lib/client/api.ts`) sobre Postgres en Supabase.

| Ruta                                                                                                           | Acceso                                   |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `GET /api/cabin-types`, `GET /api/availability`, `GET /api/availability/calendar`                              | Público                                  |
| `POST /api/reservations` (cabecera `Idempotency-Key`), `GET /api/reservations/lookup`                          | Público                                  |
| `GET/POST /api/admin/emails`                                                                                   | Sesión de administrador                  |
| `POST /api/admin/login`, `POST /api/admin/logout`                                                              | Supabase Auth                            |
| `GET /api/admin/data`, `POST /api/admin/action`, `POST/DELETE /api/admin/blocks`, `PUT /api/admin/cabin-types` | Sesión con `app_metadata.role = "admin"` |

**Seguridad.** Las rutas públicas usan la clave secreta solo en el servidor y validan todo (fechas, capacidad, campos, antispam). El panel usa la sesión del administrador, así que RLS limita el acceso. El rol `anon` no tiene permisos sobre ninguna tabla. La restricción `reservations_no_overlap` (exclusión GiST) impide en la base de datos que una unidad tenga dos reservas activas cruzadas, incluso con solicitudes simultáneas.

**Tiempo real.** El panel escucha `postgres_changes` con la sesión del administrador (RLS). El sitio público no puede leer reservas, así que la disponibilidad se sincroniza con un aviso: un trigger (`broadcast_availability`) publica en el canal público de Realtime `availability` la cabaña y las noches afectadas (sin datos personales) cada vez que cambia la ocupación, y el navegador vuelve a consultar la API (`src/lib/client/availability-sync.ts`). «Mi reserva» funciona igual: cada reserva tiene una clave aleatoria (`live_key`) que solo devuelve la consulta con código y correo, y el trigger `broadcast_reservation_change` publica un aviso vacío en `reserva:<clave>` cuando cambia el estado, las fechas, los valores o un comprobante (`src/lib/client/live-sync.ts`). El aviso solo dispara una nueva consulta; la API sigue validando. Un job de `pg_cron` (`plazos-de-pago`, cada minuto) vence las retenciones sin abono. El panel también escucha `payments` y `email_outbox`; «Mi reserva» recibe el aviso cuando cambia un pago.

**Pagos.** No hay pasarela en línea: el huésped paga por transferencia (o en recepción) y el equipo registra cada pago en la ficha de la reserva.

1. Una reserva nace `pending_deposit` con las fechas retenidas hasta `deposit_due_at` (en la web, 24 horas; en el panel, el plazo que elija el equipo, como máximo hasta el día de llegada). Si no se registra el abono a tiempo, `run_payment_deadlines` (pg_cron cada minuto y la API antes de leer) la pasa a `expired` y las fechas se liberan.
2. `register_manual_payment` (Postgres, solo administradores) registra el abono, el pago total o el saldo en `payments`, confirma la reserva y encola el correo de confirmación, todo en una transacción. Aprobar un comprobante de transferencia hace lo mismo.
3. El check-out exige el saldo pagado (lo impide la base de datos).

Estados: la reserva usa `pending_deposit` → `confirmed` → `checked_in` → `completed`; cada pago es un abono (`deposit`), un pago total (`full`) o un saldo (`balance`).

**Correos (Resend).** La confirmación la encola la base de datos (`email_outbox`, una por reserva) y se envía después de responder al huésped: si Resend falla, la reserva sigue confirmada, el error queda en la fila, el panel recibe un aviso y el correo se reintenta con espera creciente (o desde la ficha de la reserva). Sin dominio verificado en Resend, el remitente `onboarding@resend.dev` solo puede enviar al correo de tu cuenta.

**Esquema.** `supabase/migrations/` (tablas `cabin_types`, `reservations`, `reservation_notes`, `blocks`). Tarifas, capacidad máxima y número de cabañas por tipo (`units`) viven en `cabin_types`; las tarifas se editan en el panel, `units` en el Table Editor de Supabase.

### Puesta en marcha

1. Copia `.env.example` a `.env.local` y completa la URL, la clave publicable y `SUPABASE_SECRET_KEY` (Dashboard → Project Settings → API Keys → Secret keys), y `RESEND_API_KEY`. Nada secreto lleva el prefijo `NEXT_PUBLIC_`.
2. En cada entorno publicado: define `APP_ENV` (`qa` o `pdn`) y `NEXT_PUBLIC_SITE_URL`, verifica tu dominio en Resend y define `EMAIL_FROM`.
3. Crea el usuario administrador en Dashboard → Authentication → Users → Add user (correo y contraseña, marcado como confirmado).
4. Dale el rol de administrador (SQL Editor):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
where email = 'tu-correo@ejemplo.com';
```

5. Recomendado: desactiva los registros públicos en Authentication → Sign In / Providers (solo entran cuentas creadas por ti).

### Modo simulado

Con `NEXT_PUBLIC_USE_MOCK_API=1` la app funciona sin backend (`src/lib/mock/mock-server.ts`, datos en el `localStorage` del navegador, login de prueba con cualquier correo; los correos se dan por enviados). Para simular errores del envío: `localStorage.setItem('vf-mock-settings', '{"post":"409"}')` (también `422`, `429`, `network`, `slow`).
