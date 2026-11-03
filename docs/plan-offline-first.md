# Panel Offline-First: diagnóstico y plan

Estado: **aprobado e implementado en `develop`, aplicado solo en QA, detrás de `NEXT_PUBLIC_OFFLINE=1`.** PDN no se ha tocado. Cómo funciona y cómo se prueba: [offline.md](offline.md). Paso a producción: [plan-pdn-offline.md](plan-pdn-offline.md). Auditoría hecha sobre `0e45435`.

## 1. Conclusión

- **El panel es buen candidato.** Casi todo lo que muestra se calcula en el navegador a partir de un solo objeto, `AdminData`. Listados, filtros, búsquedas, calendario, finanzas y estadísticas funcionarán sin conexión si ese objeto se conserva en el dispositivo.
- **Lo difícil está en el servidor y en las reglas de negocio.** Hoy no hay versiones, ni registro de cambios, ni tombstones, ni idempotencia en pagos y reservas. Disponibilidad y pagos los decide el servidor, y un dispositivo sin conexión no puede garantizarlos.
- **Propuesta:** copia local en IndexedDB, cola persistente y un motor central de sincronización. Los módulos no se reescriben: siguen usando `useAdmin()` y `api.admin.*`.
- **Hay límites reales** (sección 4). Una reserva creada sin conexión es provisional, y unas pocas operaciones no pueden hacerse sin internet. Necesito tu decisión sobre esto (sección 8).

## 2. Diagnóstico

### 2.1 Datos y estado

| Pieza                      | Hoy                                                                                                  | Consecuencia sin conexión                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Lectura                    | `Gated` y `Panel` (`shell.tsx`) piden `GET /api/admin/data` y guardan todo en memoria                | Sin red, «No pudimos abrir el panel». Al recargar se pierde todo                           |
| Actualización              | `reload()` vuelve a pedir **todo** ante cada aviso de tiempo real                                    | No es incremental. El aviso solo cubre 6 tablas                                            |
| Escritura                  | unas 60 llamadas `api.admin.*` en los módulos, cada una espera la respuesta para actualizar la vista | Sin red, error y el cambio se pierde                                                       |
| Service Worker             | `public/sw.js` guarda solo `offline.html` y maneja push. No guarda la aplicación                     | Abrir el panel sin red muestra la página de «sin conexión». Solo se registra en producción |
| Rutas dinámicas            | `reservas/[codigo]`, `clientes/[cliente]` y `cabanas/[id]` reciben el parámetro desde el servidor    | Una reserva nunca abierta no se puede abrir sin red, aunque sus datos estén guardados      |
| Datos fuera de `AdminData` | Empleados, estado del correo, URL firmada de comprobantes, estado de push                            | Necesitan caché propia o quedan solo en línea                                              |

### 2.2 Base de datos

- **Sin versiones.** Hay `updated_at` en varias tablas, pero no en `reservation_notes`, `client_entries`, `payment_proofs`, `bathroom_blocks` ni `admin_notifications`, y ninguna ruta lo usa para detectar conflictos. Hoy la última escritura gana en silencio.
- **Sin tombstones.** Los borrados son físicos (bloqueos, baños, temporadas, servicios, cabañas, registros de cliente). Otro dispositivo no puede enterarse de que algo se borró.
- **Sin registro de cambios.** No hay forma de preguntar «qué cambió desde X».
- **Identificadores del servidor.** Código de reserva, `id` de bloqueos, baños y temporadas, slug de cabaña y notas (`bigint`). Sin conexión no se pueden referenciar sin cambios.
- **Idempotencia casi inexistente en el panel.** Solo la tienen el correo del equipo (`requestId`) y la importación (`external_ref`).
- **Efectos colaterales en la base.** `reservations_emails` y `email_outbox_dispatch` encolan y disparan correos. `notify_reservation_change` genera avisos y push. `run_payment_deadlines` vence retenciones. Todo eso ocurrirá **al sincronizar**, no cuando el usuario actuó.

### 2.3 Qué significa «tenant» aquí

**No hay multi-tenant.** Ninguna tabla tiene `tenant_id` o `business_id`. RLS solo pregunta `is_staff()` o `is_admin()`, y todo el equipo ve los mismos datos. Por eso **no propongo agregar `tenant_id`**: sería complejidad sin uso.

El aislamiento real tiene tres fronteras, y esas son las que se probarán:

1. **Entorno:** QA y PDN nunca comparten almacén local (el nombre de la base local incluye el `project-ref`).
2. **Usuario:** cada cuenta tiene su propia base local y su propia cola. Una operación de la cuenta A nunca se envía con la sesión de B, y el servidor lo rechaza si ocurre.
3. **Rol:** `recepcion` no recibe la lista de empleados ni puede ejecutar operaciones de administrador. El servidor revalida el permiso de cada operación al sincronizar.

### 2.4 Autenticación y permisos

- La sesión de Supabase vive en cookies que `@supabase/ssr` administra. La aplicación no guarda credenciales. Eso se mantiene: **ni contraseñas ni tokens en IndexedDB**.
- Los permisos están en tres capas (`lib/permissions.ts`, `requireStaff`/`requireAdmin`, y RLS con disparadores) y no cambian.
- El panel trata cualquier 401 o 403 como cierre de sesión. El motor debe distinguirlos: un 403 en una operación («ya no tienes permiso») no debe sacar al usuario ni descartar sus cambios.

### 2.5 Defectos actuales que esto corrige

1. **Riesgo de pago doble, hoy, sin offline.** `request()` (`lib/client/api.ts`) reintenta **cualquier** método tras un error de red o timeout, incluido `POST /admin/action`. Si la respuesta de un pago se pierde, `register_manual_payment` puede registrarlo dos veces, porque no tiene clave de idempotencia. Lo mismo vale para notas. Se corrige en la Fase 1 aunque no se siga con el resto.
2. **Marcar notificaciones como leídas se pierde sin avisar.** `useMarkRead` ignora el error (`catch {}`).

### 2.6 Inventario de operaciones

Política: **A** aditiva, no entra en conflicto · **M** máquina de estados, el servidor valida la transición · **V** versión con fusión por campos · **L** solo en línea.

| Módulo y endpoint                                                    | Operación                            | Política  | Qué pasa si falla al sincronizar                                                      |
| -------------------------------------------------------------------- | ------------------------------------ | --------- | ------------------------------------------------------------------------------------- |
| Reservas · `POST /reservations`                                      | Crear (código generado localmente)   | M         | Fechas ocupadas: pasa a «Revisar» con opción de otras fechas, otra unidad o descartar |
| Reservas · `POST /action` `guest`                                    | Editar huésped                       | V         | Fusión por campos; si es el mismo campo, elige el usuario                             |
| Reservas · `action` `note`                                           | Nota                                 | A         | Solo falla si la reserva ya no existe                                                 |
| Pagos · `action` `confirm`, `balance`                                | Registrar pago                       | A + aviso | Ver «Pagos» en 3.5. **Nunca se descarta solo**                                        |
| Reservas · `action` `checkin`, `checkout`, `cancel`, `extend_hold`   | Cambio de estado                     | M         | Si ya está en ese estado, cuenta como hecho. Si la transición no aplica, «Revisar»    |
| Reservas · `action` `reschedule`                                     | Reprogramar                          | M         | `DATES_UNAVAILABLE`: «Revisar»                                                        |
| Comprobantes · `POST /proofs`                                        | Aprobar o rechazar                   | V         | Otro lo revisó: «Revisar»                                                             |
| Comprobantes · `GET /proofs`                                         | Ver archivo                          | Caché     | Solo los ya abiertos o precargados. Sin caché: aviso claro                            |
| Bloqueos · `/blocks`, `/bathroom-blocks`                             | Crear, editar, borrar                | V         | `RESERVATION_CONFLICT`, `BLOCK_OVERLAP`, o ya borrado: «Revisar»                      |
| Baños · `/bathrooms`                                                 | Crear, editar, borrar                | V         | Igual                                                                                 |
| Clientes · `PUT /clients`                                            | Valoración                           | V         | Fusión por campos                                                                     |
| Clientes · `POST`, `DELETE /clients`                                 | Registros                            | A         | Borrar algo ya borrado cuenta como hecho                                              |
| Temporadas · `/seasons`, tarifas · `/cabin-types`                    | Crear, editar, borrar                | V         | Cruce de temporadas: «Revisar»                                                        |
| Cabañas · `/cabins`, `/cabins/photos`                                | CRUD, orden y fotos                  | V         | `HAS_RESERVATIONS`, unidades con reservas: «Revisar». Fotos en cola como Blob         |
| Condiciones · `/payment-terms`                                       | Guardar                              | V         | Elegir la tuya o la del servidor                                                      |
| Contenido · `/site`, `/services`, `/photos` (módulo apagado hoy)     | Guardar                              | V         | Igual                                                                                 |
| Notificaciones · `/notifications`                                    | Marcar leídas                        | A         | Solo avanza: no hay conflicto                                                         |
| Correos · `/emails`                                                  | Enviar y reintentar                  | A         | Ya es idempotente. La vista avisa que saldrá al sincronizar                           |
| Importar · `/import`                                                 | Lote de filas                        | A         | `external_ref` evita duplicados. El informe por fila llega al sincronizar             |
| Perfil · `/profile`, `/profile/photo`                                | Nombre y foto                        | V         | Última del propio usuario                                                             |
| Perfil · `/profile` contraseña; Empleados · `/employees` (escritura) | Contraseñas y cuentas                | **L**     | Ver sección 4                                                                         |
| Acceso · `/login`; Push · `/push`                                    | Ingresar, suscribir este dispositivo | **L**     | Dependen del servidor o del servicio de push                                          |

Nota: el huésped sube los comprobantes desde el sitio público. El panel solo los revisa, así que la cola de archivos cubre únicamente las fotos.

## 3. Arquitectura propuesta

```
Módulos (useAdmin, api.admin.* con la misma firma)
        │ lee data                 │ escribe
        ▼                          ▼
  Proyección  ◄───────────  Cola persistente (outbox)
  base + pendientes                │
        ▲                          ▼ en orden, con reintentos
  Copia base (IndexedDB)    Motor de sincronización ──► Rutas /api/admin/* actuales
        ▲                                                + syncable(): idempotencia y versión
        └────────── pull incremental ◄── sync_pull ◄── sync_changes (disparadores)
```

### 3.1 Lectura

- `src/lib/offline/` tendrá la **copia base**: lo último confirmado por el servidor, por colección, en una base IndexedDB `vf-{projectRef}-{userId}`.
- `data` pasa a ser `proyectar(base, pendientes)`: la copia base más las operaciones pendientes reaplicadas con funciones puras. Cuando llega una confirmación o un cambio remoto, se recalcula sin perder lo pendiente. **Los módulos no cambian su forma de leer.**
- Disponibilidad, cotización y validaciones usan las mismas funciones de `lib/booking.ts`, que ya corren en el navegador.
- `navigator.storage.persist()` para pedir que el navegador no borre los datos.

### 3.2 Escritura

Un **registro central de operaciones** (`defineOp`) describe cada tipo una sola vez: permiso, validación local, efecto local, cómo se envía, cómo se fusiona y de qué depende. No hay lógica por módulo.

`api.admin.*` conserva su firma. Toda escritura se guarda primero en la cola y luego:

- **Con conexión y sin nada pendiente antes:** se envía de inmediato y el formulario recibe la respuesta real. Los errores siguen saliendo en sus campos, como hoy.
- **Sin conexión, o si el envío se agota por tiempo:** el llamador recibe una respuesta de éxito construida con la proyección local, y el aviso dice «Guardado en este dispositivo».

Así las unas 60 llamadas actuales casi no se tocan. Las ediciones seguidas del mismo registro se **compactan** en una sola operación. Los pagos y las notas nunca se compactan.

### 3.3 Sincronización

**Subida.** Cola FIFO con dependencias por registro: si una operación queda en «Revisar», se detienen las que dependen de ella y las demás siguen. Reintentos con espera creciente y aleatoria (de 1 s a 5 min) ante errores de red y 5xx. Se usa Web Locks para que un solo tab sincronice y BroadcastChannel para avisar a los demás. La conexión se comprueba con un `ping` real, porque `navigator.onLine` da falsos positivos.

**Bajada.** `sync_pull(cursor)` devuelve solo lo que cambió. `/admin/data` queda para la carga inicial y para cuando el cursor ya es demasiado viejo. El tiempo real pasa a ser solo la señal de «hay cambios»: una suscripción a `sync_changes`, más la de avisos que ya existe.

### 3.4 Cambios en el servidor

Migraciones **aditivas**. La aplicación actual sigue funcionando con ellas, y se aplican solo en QA.

| Objeto                                                  | Para qué                                                                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version bigint` + disparador                           | Control de concurrencia en reservas, bloqueos, cabañas, temporadas, perfiles, baños, comprobantes, configuración y servicios                                        |
| `sync_changes` (`seq`, `xid8`, tabla, clave, operación) | Registro de cambios y **tombstones**, alimentado por disparadores. Cubre también lo que hacen el cron y el sitio público. Conservación: 90 días                     |
| `sync_pull(...)`                                        | Lee solo hasta `pg_snapshot_xmin`, para no saltarse transacciones que aún no terminan. Un cursor simple por `seq` o por fecha sí se las saltaría y perdería cambios |
| `sync_ops` (`op_id`, `user_id`, estado, respuesta)      | Registro de idempotencia. RLS por usuario. Repetir una operación devuelve la respuesta guardada                                                                     |
| `client_op_id unique` en `payments`, notas y registros  | Atomicidad donde importa: un pago no se duplica ni si el servidor cae a mitad de camino                                                                             |
| `register_manual_payment(..., p_op_id, p_occurred_at)`  | Pago idempotente, con la fecha real en que se recibió el dinero                                                                                                     |
| Rutas aceptan identificadores del cliente               | Código de reserva, UUID de bloqueos y baños, slug de cabaña. Un código repetido responde `ID_TAKEN` y el motor genera otro                                          |
| `syncable(handler)` en `lib/server/http.ts`             | Envoltura de las rutas actuales: lee `Idempotency-Key` y la versión base. **No se reescribe la validación, los permisos ni RLS**                                    |
| `GET /api/admin/sync/ping`, `GET /api/admin/sync/pull`  | Comprobar conexión y sesión; traer cambios                                                                                                                          |

**Por qué no hay un `POST /sync` en lote:** cada operación pasa por la misma ruta de siempre, con sus validaciones. Hay una sola lógica de negocio que mantener, y el volumen de este negocio no necesita lotes.

**Caso límite aceptado:** si el servidor cae entre aplicar un cambio y guardarlo en `sync_ops`, el reintento detecta una versión distinta y lo manda a «Revisar». Puede pedir una revisión de más, pero no duplica ni pierde nada. Los pagos no tienen este caso, porque son atómicos con `client_op_id`.

### 3.5 Conflictos

Ninguna operación se pierde en silencio: lo que el servidor no acepta queda en **«Revisar»** con los dos valores, y el usuario decide.

| Situación                                   | Comportamiento                                                                                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline contra online, **campos distintos** | Fusión automática a tres bandas                                                                                                                                  |
| Offline contra online, **mismo campo**      | «Revisar»: lo tuyo y lo del servidor, elige uno                                                                                                                  |
| Registro borrado con cambios locales        | «Revisar»: recrear con tus datos o descartar                                                                                                                     |
| Borrar algo que otro modificó               | «Revisar»: muestra qué cambió antes de confirmar                                                                                                                 |
| Dos usuarios hacen la misma transición      | Se considera hecha. Sin error ni correo repetido                                                                                                                 |
| **Pagos**                                   | La operación lleva `paid_amount` base. Si el servidor tiene otro valor, «Revisar»: «se registró otro pago mientras estabas sin conexión». Evita cobrar dos veces |
| Fechas ocupadas al sincronizar              | «Revisar»: otras fechas, otra unidad o descartar                                                                                                                 |
| Sin permiso al sincronizar                  | «Revisar», sin cerrar la sesión ni descartar                                                                                                                     |
| Varias ediciones seguidas                   | Se compactan si son del mismo tipo; si no, se envían en orden                                                                                                    |
| Fallo a mitad de la cola                    | Lo confirmado queda hecho y el resto continúa desde donde iba                                                                                                    |

### 3.6 Aplicación sin conexión (Service Worker)

Está en el plan porque es necesario, pero **no es la solución**: solo entrega la aplicación, y los datos viven en IndexedDB. Las respuestas de `/api/*` nunca se guardan en su caché.

- `_next/static/*`: primero la caché. Los archivos llevan hash y son inmutables.
- Navegaciones en `/admin/*`: primero la red, y si falla, la copia guardada de esa ruta o de otra con la misma estructura.
- Precarga tras iniciar sesión, usando una lista generada al final de `scripts/build.mjs` (agrega un paso; no cambia SWC WASM, webpack ni standalone).
- Las cuatro páginas dinámicas toman el parámetro de `usePathname()` en el cliente.

**Lo comprobé en el código de Next 16.4.1:** `canonicalUrl` sale de `window.location` y, si falla la petición RSC, Next recurre a la navegación normal del navegador. El servidor no pone datos privados en esas páginas. Aun así depende de detalles internos de Next, y por eso es lo primero que se prueba (Fase 0).

### 3.7 Interfaz

- **Indicador discreto en el encabezado** (móvil y escritorio), con texto e ícono: En línea · Sin conexión · Sincronizando 2 de 5 · 3 pendientes · Revisar 1.
- **Marca por registro:** «Guardado en este dispositivo» o «Por revisar», en reservas, bloqueos, clientes y demás, con un solo componente alimentado por la cola. Lo sincronizado no lleva marca.
- **Nueva página `/admin/sincronizacion`:** pendientes, errores y conflictos con sus acciones.
- Sincronizar nunca bloquea: no hay spinners globales.
- En acciones que envían correo, un aviso: «El correo al huésped saldrá al sincronizar».

### 3.8 Seguridad

- Sin contraseñas ni tokens en IndexedDB. Lo que lleve contraseña **nunca entra en la cola**.
- **Cerrar sesión:** con cero pendientes, borra la base local. Con pendientes, avisa: sincronizar, o descartar de forma explícita mostrando qué se pierde.
- **Otra cuenta en el mismo navegador:** otra base. La cola de A queda guardada y solo se envía cuando A vuelva a entrar.
- **Abrir sin conexión:** entra el último usuario validado en este dispositivo y queda bloqueado si lleva más de N días sin validar con el servidor (decisión 3).
- **Sesión vencida al reconectar:** la sincronización se pausa y pide ingresar. Nada se pierde.
- **Servidor:** repite todas las validaciones, y `sync_ops` rechaza una operación ajena. Una operación cuenta como sincronizada solo con su respuesta.

## 4. Límites reales

Prefiero decírtelos ahora. Algunos contradicen lo que pediste al pie de la letra.

1. **Sin conexión no se puede garantizar disponibilidad.** Dos personas sin conexión pueden prometer la misma cabaña. La restricción de exclusión impide la doble reserva en la base, pero **la segunda se entera al sincronizar**, y para entonces quizá ya le dijo que sí a un huésped. Por eso la reserva aparece como **provisional**. Ninguna arquitectura evita esto.
2. **Solo en línea, por seguridad:**
   - Iniciar sesión: verificar una contraseña sin el servidor exigiría guardarla o guardar su hash.
   - Cambiar contraseñas y crear empleados: la cola tendría la contraseña en el dispositivo.
   - Cambiar rol o desactivar empleados: propongo también solo en línea, porque «ya le quité el acceso» sin que el servidor lo sepa da una falsa seguridad.
   - Activar push en el dispositivo.
3. **La primera vez hace falta internet** en cada dispositivo y cuenta.
4. **La sincronización corre con el panel abierto.** La sincronización en segundo plano solo existe en navegadores Chromium. Queda fuera de esta versión: al abrir el panel, sincroniza sola.
5. **Borrar los datos del navegador borra lo pendiente,** sin remedio. Safari puede borrar datos de un sitio sin uso en 7 días. En iPhone hay que **instalar el panel como app** y sincronizar con frecuencia.
6. **Comprobantes y fotos solo si ya están en el dispositivo.** Se precargan los comprobantes pendientes, dentro de un límite de espacio.
7. **Correos y avisos salen al sincronizar,** quizá horas después de la acción. La fecha del correo será la del envío.
8. **Plazos de retención:** los vence el servidor. Sin conexión, el panel puede mostrar pendiente una reserva que ya venció.

## 5. Fases

Cada fase termina con `pnpm check` y `pnpm build` en verde, y con el panel funcionando en línea como hoy. Todo queda detrás de `NEXT_PUBLIC_OFFLINE=1` hasta la Fase 6. No hago commit ni push sin que lo pidas.

| Fase | Contenido                                                                                                                                                                                 | Se da por buena cuando                                                                                       | Tamaño |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| 0    | **Prueba de concepto.** Playwright y `fake-indexeddb` (solo desarrollo). Service Worker sobre el build standalone real copiado fuera del repo. Abrir rutas dinámicas sin red              | Recargar sin red `/admin/reservas/<código no visitado>` hidrata bien. **Si falla, te aviso antes de seguir** | S      |
| 1    | **Servidor.** Migración en QA (sección 3.4), `syncable`, `sync_pull`, `ping` y corrección del pago doble                                                                                  | Pruebas de disparadores y RLS en transacción revertida. Sitio y panel sin cambios de comportamiento          | M      |
| 2    | **Lectura sin conexión.** IndexedDB, sesión local por usuario, carga inicial, delta, Service Worker e indicador. Las escrituras aún dicen «requiere conexión»                             | Pruebas 1, 2, 6 (lectura) y 11                                                                               | L      |
| 3    | **Cola y motor.** Registro de operaciones, proyección, reintentos, multi-tab. Primer módulo completo: **bloqueos**, más notas y notificaciones                                            | Pruebas 3, 4, 5, 6, 7, 8 y 10 sobre bloqueos                                                                 | L      |
| 4    | **Reservas y pagos,** lo más delicado: crear, cobrar, estados, reprogramar y comprobantes. Página de conflictos                                                                           | Pruebas 9 y 10 sobre reservas, incluidos pago doble y fechas ocupadas                                        | L      |
| 5    | **Resto:** baños, clientes, tarifas, cabañas con fotos, condiciones, contenido, perfil, correos e importador                                                                              | Pruebas 3 a 7 en cada módulo. Revisión de las unas 60 llamadas                                               | L      |
| 6    | **Cierre:** borrado al cerrar sesión, límites de espacio, retención, las 12 pruebas completas, lista para probar en celulares, documentación y **plan escrito para PDN** (sin ejecutarlo) | Las 12 pruebas pasan. Informe de qué se probó de verdad                                                      | M      |

**PDN queda fuera de este trabajo.** Exige plan, respaldo verificado y tu autorización, según `docs/migraciones.md`. Además, PDN tiene migraciones anteriores pendientes (`docs/plan-pdn-2026-11.md`) que van primero.

## 6. Riesgos

| Riesgo                                                                                | Prob. | Impacto | Mitigación                                                                                                            |
| ------------------------------------------------------------------------------------- | ----- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Next cambia sus detalles internos y deja de hidratar la página guardada               | Media | Alto    | Fase 0 y prueba E2E permanente. `next` está fijado en una versión exacta                                              |
| El efecto local no coincide con lo que hace el servidor                               | Media | Medio   | Reductores puros con pruebas, y el servidor siempre manda: su respuesta reemplaza lo local                            |
| Validaciones de fecha contra «hoy» fallan al sincronizar otro día (`ci < todayISO()`) | Alta  | Medio   | La validación usa `occurredAt`, con tolerancia limitada. Si no alcanza, «Revisar»                                     |
| Desplegar con operaciones de una versión anterior en la cola                          | Media | Alto    | Operaciones con `schemaVersion`, y las rutas siguen aceptando el formato anterior                                     |
| Hora incorrecta en el dispositivo                                                     | Media | Medio   | La hora del servidor manda en todo menos en el pago. Se guarda la diferencia y se limita `p_occurred_at`              |
| Se llena el espacio del navegador                                                     | Baja  | Alto    | Fotos con límite y borrado de las menos usadas. Si la cola no puede guardar, error visible en lugar de un éxito falso |
| Se agrava el costo de los disparadores en `reservations`                              | Baja  | Medio   | `sync_changes` es un solo `insert` pequeño y se limpia por cron                                                       |
| Regresión en el panel en línea                                                        | Media | Alto    | Todo pasa por la bandera, por módulos, y se revisa cada fase                                                          |
| Datos personales de huéspedes en un dispositivo perdido                               | Baja  | Alto    | Decisión 3: borrado al cerrar sesión, caducidad y cifrado de disco                                                    |
| Correos o push reales durante las pruebas en QA                                       | Alta  | Bajo    | Decisión 4                                                                                                            |

## 7. Pruebas obligatorias

**Unitarias (Vitest):** proyección, compactación, fusión, dependencias, reintentos y aislamiento con `fake-indexeddb`.

**Reales (Playwright):** con Chromium, build standalone y base de QA. Sin conexión con `context.setOffline(true)`, que corta la red de verdad, también para el Service Worker.

| #   | Prueba                        | Cómo                                                                                                           |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Sincronización inicial        | Abrir con red, comprobar colecciones en IndexedDB contra la base                                               |
| 2   | Navegar sin conexión          | Todos los módulos, y una reserva no visitada                                                                   |
| 3-5 | Crear, editar, eliminar       | Por módulo, con marca «Guardado en este dispositivo»                                                           |
| 6   | Recargar sin conexión         | `page.reload()` y también cerrar y reabrir el navegador                                                        |
| 7   | Sincronización automática     | Volver a conectar sin tocar nada y verificar **en la base**                                                    |
| 8   | Errores y reintentos          | `page.route` responde 500, corta a media petición, y pierde la respuesta tras aplicar (el caso del pago doble) |
| 9   | Modificaciones simultáneas    | Dos contextos con cuentas distintas: uno sin conexión y otro en línea, en cada fila de 3.5                     |
| 10  | Sin duplicados ni pérdidas    | Conteos y sumas de pagos antes y después, directo en la base                                                   |
| 11  | Aislamiento                   | A y B en el mismo navegador; sesión de B con operación de A; `recepcion` contra operación de administrador     |
| 12  | Panel normal tras sincronizar | Repetir el flujo en línea y comparar la proyección contra `/admin/data`                                        |

**Lo que no podré probar yo, y te lo diré así en el informe:** Safari, iPhone y Android reales, incluido el borrado de datos de iOS. Te dejaré una lista corta para hacerlo en tus celulares. Tampoco una red móvil real e inestable, solo su simulación.

## 8. Decisiones que necesito

1. **Reservas sin conexión: ¿se permiten como provisionales, con el riesgo del punto 1 de la sección 4?** Recomiendo **sí**, con la marca visible. La alternativa es que crear reservas exija conexión, lo que incumple parte de lo que pediste.
2. **Empleados y contraseñas solo en línea** (punto 2 de la sección 4). Recomiendo **sí**; leer la lista sí funciona sin conexión.
3. **Datos de huéspedes en el dispositivo.** Recomiendo: borrar al cerrar sesión, bloquear tras **30 días** sin validar con el servidor, y **no** cifrar IndexedDB en esta versión. La llave tendría que vivir en el mismo navegador, así que daría poca protección real a cambio de bastante complejidad. Para equipos compartidos, conviene cifrado de disco del sistema. Revisa si esto encaja con el manejo de datos personales del negocio.
4. **Efectos reales en las pruebas de QA.** Los correos irán a `delivered@resend.dev`, una dirección de prueba de Resend, así que ningún huésped los recibe. El **push sí llegaría a tu celular** en cada cambio de estado. Recomiendo que silencies las notificaciones de QA durante las pruebas; te aviso antes de cada tanda.
5. **Fecha del pago:** recomiendo usar la fecha real en que se recibió (hasta 30 días atrás, nunca futura) para que Finanzas la cuente en su día, no en el día en que se sincronizó.
6. **Dos cuentas de prueba en QA** (una `admin`, una `recepcion`), creadas por script y con las claves en `.env.test.local`, que git ignora. Recomiendo **sí**: la prueba 9 no se puede hacer sin ellas.

## 9. Dependencias nuevas

- `idb`: envoltura pequeña de IndexedDB. Va en producción.
- `fake-indexeddb`, `@playwright/test`: solo desarrollo. Las pruebas E2E quedan como `pnpm test:e2e`, de uso local, porque necesitan los secretos de QA. CI sigue igual.
