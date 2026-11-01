# Migraciones de base de datos: QA → PDN

Flujo obligatorio: **Desarrollo → QA → Validación → Autorización → PDN**.

| Entorno | Rama Git  | Proyecto de Supabase   | Datos                               |
| ------- | --------- | ---------------------- | ----------------------------------- |
| QA      | `develop` | `tknhymkjuxmohywwaxnv` | De prueba                           |
| PDN     | `main`    | `menpgghjhztsswnmpzjk` | Reales (clientes de lavacafifi.com) |

## Reglas

- Nunca conectar QA a la base de PDN ni al revés. La app no arranca si la URL de Supabase no es la de su entorno (`APP_ENV`, `src/lib/server/env.ts`), y en local siempre exige QA.
- El CLI de Supabase vive enlazado a **QA**. Los comandos de base de datos pasan por `scripts/db.mjs`, que se niega a operar sobre QA si el CLI está enlazado a PDN.
- En PDN no se usan `db push`, `db reset`, `--force` ni ninguna sincronización destructiva. Las migraciones se aplican una por una, a mano, con un plan aprobado.
- Nunca se borran datos reales de PDN para que su estructura coincida con QA. Si una migración transforma datos, el plan explica antes cómo se conservan.
- Que una migración funcione en QA no la hace segura en PDN: PDN siempre necesita plan y autorización explícita.
- No se escriben credenciales de PDN en archivos del repositorio ni en `.env.local`.

## Comandos

```bash
pnpm db:qa:status                 # migraciones de QA frente al repo
pnpm db:qa:new nombre_en_snake    # archivo nuevo en supabase/migrations/
pnpm db:qa:migrate                # aplica en QA las migraciones pendientes
pnpm db:qa:types                  # regenera src/lib/supabase/database.types.ts desde QA
pnpm db:qa:diff                   # diferencias entre QA y las migraciones del repo
```

PDN (solo lectura y respaldo; la cadena de conexión se pasa en el momento y no se guarda):

```bash
PDN_DB_URL='postgresql://…' pnpm db:pdn:status
PDN_DB_URL='postgresql://…' pnpm db:pdn:backup   # esquema, datos y roles en ~/respaldos-la-vaca-fifi/<fecha>/
```

## Pasos para llevar un cambio a PDN

1. **Desarrollo (develop).** La migración es un archivo nuevo en `supabase/migrations/`. Nunca se edita una migración ya aplicada en PDN.
2. **QA.** `pnpm db:qa:migrate`, luego `pnpm db:qa:types` y pruebas de la app contra QA.
3. **Validación.** Funcionalidad completa e integridad de datos en QA (conteos antes y después, restricciones, RLS, cron).
4. **Plan para PDN** (plantilla abajo), con el SQL exacto y el impacto sobre los datos reales.
5. **Respaldo de PDN** justo antes (`pnpm db:pdn:backup`), comprobando que los archivos no estén vacíos. Si la migración toca Storage, respaldar también esos objetos.
6. **Autorización explícita** del responsable.
7. **Ejecución en PDN**, migración por migración, en una transacción cuando sea posible, y registro en el historial de migraciones.
8. **Validaciones posteriores** y despliegue de `main`.
9. **Si algo falla:** rollback preparado en el plan o restauración del respaldo.

## Plantilla del plan

```markdown
### Migración <archivo>

**Objetivo:**

**Objetos afectados:** tablas · columnas · relaciones · índices · restricciones · funciones · triggers · políticas RLS · cron · Vault

**Operaciones destructivas o incompatibles:** (DROP, TRUNCATE, columnas eliminadas, cambios de tipo, NOT NULL nuevos)

**Riesgo para los datos de PDN:** (filas afectadas según conteo en PDN, cómo se conservan)

**Orden de ejecución:**

1. …

**Validaciones posteriores:**

- …

**Rollback:**

- …

**Respaldo:** ruta y fecha del respaldo verificado
```
