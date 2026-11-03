# Panel sin conexión

Cómo funciona, cómo se prueba y qué revisar en los celulares. El diagnóstico y las decisiones están en [plan-offline-first.md](plan-offline-first.md); el paso a producción, en [plan-pdn-offline.md](plan-pdn-offline.md).

## Activarlo

`NEXT_PUBLIC_OFFLINE=1` **al compilar**. Sin ella, el panel funciona como siempre y no usa nada de esto. Nunca está activo en modo simulado.

## Dónde está cada cosa

| Pieza                                  | Archivo                                                         |
| -------------------------------------- | --------------------------------------------------------------- |
| Cada tipo de escritura                 | `src/lib/offline/ops.ts`                                        |
| Cola, proyección y sincronización      | `src/lib/offline/engine.ts`                                     |
| IndexedDB                              | `src/lib/offline/store.ts`                                      |
| Sesión local y cuenta en uso           | `src/lib/offline/session.ts`                                    |
| Enlace con `api.admin.*`               | `src/lib/offline/runtime.ts`, `src/lib/client/api.ts`           |
| Indicador, marcas y página de revisión | `src/components/admin/sync.tsx`                                 |
| Aplicación sin internet                | `public/sw.js`, `scripts/build.mjs`                             |
| Servidor                               | `syncRoute` en `src/lib/server/http.ts`, `api/admin/sync/*`     |
| Base de datos                          | `supabase/migrations/20261102200000_sincronizacion_offline.sql` |

## Agregar una escritura nueva

1. La ruta usa `syncRoute` en lugar de `route`. Si edita una fila con `version`, respeta `baseVersionOf(req)`.
2. Se agrega la operación en `ops.ts`: `request`, `apply`, `result` y, si aplica, `validate`, `version`, `view` y `family`.
3. `api.admin.*` la envuelve con `mutate(...)`.
4. Si la tabla es nueva, lleva disparador `log_sync_change` y una entrada en `LOAD` de `api/admin/sync/pull/route.ts`.

## Pruebas

Unitarias, en CI: `pnpm test`.

Reales, solo en local, porque usan la base de QA:

```bash
node scripts/qa-test-users.mjs
```

```bash
NEXT_PUBLIC_OFFLINE=1 NEXT_PUBLIC_E2E_HOOKS=1 pnpm build
```

```bash
pnpm test:e2e
```

`e2e/modules.spec.ts` genera unas pocas notificaciones push (un pago que confirma una reserva y comprobantes): avisa antes de correrla. Los correos van a `delivered@resend.dev`. Todo lo que crean las pruebas lleva la etiqueta `e2e-` y se borra al final.

Comprobación de la migración, en una transacción revertida y solo en QA:

```bash
npx supabase db query --linked --yes --file scripts/qa-sync-check.sql
```

## Lista para probar en los celulares

Esto no se pudo probar automáticamente. Hazlo con el panel de QA, una vez en Android con Chrome y otra en iPhone con Safari.

1. Instala el panel como app (en iPhone: Compartir → Agregar a inicio) y entra con internet. Espera un minuto.
2. Activa el modo avión. Cierra la app del todo y ábrela: debe abrir con los datos.
3. Abre una reserva que nunca hayas abierto en ese celular.
4. Agrega una nota y registra un pago. Debe decir «Guardado en este dispositivo».
5. Cierra la app, ábrela otra vez y comprueba que siguen ahí.
6. Quita el modo avión con la app abierta. En unos segundos debe decir «En línea»; comprueba la nota desde el computador.
7. Con señal mala o wifi sin internet: el indicador debe terminar en «Sin conexión» y nada debe perderse.
8. Solo en iPhone: deja pasar más de 7 días sin abrir la app instalada y comprueba que los datos siguen. Si no siguen, avísame: es el riesgo conocido de Safari.
