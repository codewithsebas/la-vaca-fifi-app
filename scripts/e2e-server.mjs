// Servidor de las pruebas de punta a punta: el build standalone real, copiado fuera de node_modules del repo como en Hostinger.
// Lee .env.local (QA) y se niega a correr contra otra base. No pone RESEND_API_KEY: este proceso no envía correos.
import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const QA = "tknhymkjuxmohywwaxnv";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes(QA)) {
  console.error("[e2e] .env.local no apunta a QA: no se arranca.");
  process.exit(1);
}
if (!existsSync(".next/standalone/server.js")) {
  console.error("[e2e] Falta el build: corre NEXT_PUBLIC_OFFLINE=1 pnpm build.");
  process.exit(1);
}

const dir = join(tmpdir(), "vf-e2e-standalone");
rmSync(dir, { recursive: true, force: true });
cpSync(".next/standalone", dir, { recursive: true });
cpSync(".next/static", join(dir, ".next/static"), { recursive: true });
cpSync("public", join(dir, "public"), { recursive: true });

const runtime = { ...env };
delete runtime.RESEND_API_KEY;
const child = spawn(process.execPath, ["server.js"], {
  cwd: dir,
  stdio: "inherit",
  env: { ...process.env, ...runtime, APP_ENV: "qa", NODE_ENV: "production", PORT: process.env.E2E_PORT ?? "3020", HOSTNAME: "127.0.0.1" },
});
child.on("exit", (code) => process.exit(code ?? 1));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill());
