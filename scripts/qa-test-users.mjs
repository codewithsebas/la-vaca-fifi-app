// Crea (o reactiva) las dos cuentas de prueba del panel en QA: una «admin» y una «recepcion». Sus claves quedan en
// .env.test.local, que git ignora. Se niega a correr contra otra base que no sea QA. Uso: node scripts/qa-test-users.mjs
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const QA = "tknhymkjuxmohywwaxnv";
const FILE = ".env.test.local";
const parse = (file) =>
  Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_0-9]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );

const env = parse(".env.local");
if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes(QA)) {
  console.error("✖ .env.local no apunta a QA.");
  process.exit(1);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
const saved = existsSync(FILE) ? parse(FILE) : {};
const accounts = [
  { prefix: "E2E_ADMIN", email: "e2e-admin@lavacafifi.test", role: "admin", name: "Prueba Administrador" },
  { prefix: "E2E_RECEPCION", email: "e2e-recepcion@lavacafifi.test", role: "recepcion", name: "Prueba Recepción" },
];

const { data, error } = await admin.listUsers({ page: 1, perPage: 200 });
if (error) throw error;
const out = [];
for (const a of accounts) {
  const password = saved[`${a.prefix}_PASSWORD`] || randomBytes(18).toString("base64url");
  const found = data.users.find((u) => u.email === a.email);
  const attrs = { password, email_confirm: true, app_metadata: { role: a.role }, user_metadata: { full_name: a.name }, ban_duration: "none" };
  const { error: e } = found ? await admin.updateUserById(found.id, attrs) : await admin.createUser({ email: a.email, ...attrs });
  if (e) throw e;
  out.push(`${a.prefix}_EMAIL=${a.email}`, `${a.prefix}_PASSWORD=${password}`);
  console.log(`✔ ${a.email} (${a.role})`);
}
writeFileSync(FILE, out.join("\n") + "\n");
console.log(`✔ Claves en ${FILE}`);
