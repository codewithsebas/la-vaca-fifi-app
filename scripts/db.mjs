// Comandos de base de datos con el entorno siempre explícito: `node scripts/db.mjs <qa|pdn> <acción>`.
// QA: el CLI de Supabase debe estar enlazado a QA (supabase/.temp/project-ref); si no, se niega.
// PDN: solo lectura y respaldo, contra una cadena de conexión que se pasa en el momento (PDN_DB_URL) y nunca se guarda.
// Aplicar migraciones en PDN no está aquí a propósito: se hace a mano, una por una, con un plan aprobado (docs/migraciones.md).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const PROJECTS = { qa: "tknhymkjuxmohywwaxnv", pdn: "menpgghjhztsswnmpzjk" };

const ACTIONS = {
  qa: {
    status: "Migraciones aplicadas en QA frente al repo",
    migrate: "Aplica en QA las migraciones pendientes del repo",
    new: "Crea un archivo de migración nuevo (node scripts/db.mjs qa new <nombre>)",
    types: "Regenera src/lib/supabase/database.types.ts desde QA",
    diff: "Diferencias entre el esquema de QA y las migraciones del repo",
  },
  pdn: {
    status: "Migraciones aplicadas en PDN (solo lectura)",
    backup: "Respaldo completo de PDN (esquema, datos y roles) fuera del repo",
  },
};

const [target, action, ...rest] = process.argv.slice(2);
const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

if (!ACTIONS[target] || !ACTIONS[target][action]) {
  console.log("Uso: node scripts/db.mjs <qa|pdn> <acción>\n");
  for (const [t, acts] of Object.entries(ACTIONS)) for (const [a, d] of Object.entries(acts)) console.log(`  ${t} ${a.padEnd(8)} ${d}`);
  process.exit(target ? 1 : 0);
}

const supabase = (args, opts = {}) => {
  const r = spawnSync("npx", ["supabase", ...args], { stdio: "inherit", shell: process.platform === "win32", ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const linkedRef = () => {
  const f = "supabase/.temp/project-ref";
  return existsSync(f) ? readFileSync(f, "utf8").trim() : null;
};

if (target === "qa") {
  const ref = linkedRef();
  if (ref === PROJECTS.pdn) fail("El CLI está enlazado a PRODUCCIÓN. Enlázalo a QA: npx supabase link --project-ref " + PROJECTS.qa);
  if (ref !== PROJECTS.qa) fail(`El CLI no está enlazado a QA (enlazado: ${ref ?? "ninguno"}). Ejecuta: npx supabase link --project-ref ${PROJECTS.qa}`);
  console.log(`→ QA (${PROJECTS.qa})\n`);

  if (action === "status") supabase(["migration", "list", "--linked"]);
  if (action === "migrate") {
    supabase(["migration", "list", "--linked"]);
    supabase(["db", "push", "--linked"]);
  }
  if (action === "new") {
    if (!rest[0]) fail("Falta el nombre: node scripts/db.mjs qa new <nombre_en_snake_case>");
    supabase(["migration", "new", rest[0]]);
  }
  if (action === "diff") supabase(["db", "diff", "--linked"]);
  if (action === "types") {
    const out = execFileSync("npx", ["supabase", "gen", "types", "typescript", "--linked"], { encoding: "utf8", shell: process.platform === "win32" });
    const header = "// Generado desde el esquema de Supabase de QA (pnpm db:qa:types). No editar a mano.\n";
    writeFileSync("src/lib/supabase/database.types.ts", header + out);
    console.log("✔ src/lib/supabase/database.types.ts actualizado");
  }
}

if (target === "pdn") {
  const url = process.env.PDN_DB_URL?.trim();
  if (!url) fail("Define PDN_DB_URL solo para este comando (cadena de conexión de PDN, Session pooler). No la guardes en .env.local.");
  if (!url.includes(PROJECTS.pdn)) fail("PDN_DB_URL no corresponde al proyecto de producción.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await rl.question(`⚠ PRODUCCIÓN (${PROJECTS.pdn}) · ${ACTIONS.pdn[action]}.\n  Escribe el ref del proyecto para continuar: `);
  rl.close();
  if (typed.trim() !== PROJECTS.pdn) fail("Cancelado.");

  if (action === "status") supabase(["migration", "list", "--db-url", url]);
  if (action === "backup") {
    // Fuera del repo: los respaldos tienen datos de clientes.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dir = join(homedir(), "respaldos-la-vaca-fifi", stamp);
    mkdirSync(dir, { recursive: true });
    supabase(["db", "dump", "--db-url", url, "--role-only", "-f", join(dir, "roles.sql")]);
    supabase(["db", "dump", "--db-url", url, "-f", join(dir, "esquema.sql")]);
    supabase(["db", "dump", "--db-url", url, "--data-only", "--use-copy", "-f", join(dir, "datos.sql")]);
    console.log(`\n✔ Respaldo en ${dir}`);
  }
}
