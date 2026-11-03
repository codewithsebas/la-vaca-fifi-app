// `next build --webpack` sin el ruido del SWC nativo: el servidor de Hostinger (glibc 2.28) no puede cargarlo, Next pasa a WASM
// y repite el aviso en cada proceso, sin opción para apagarlo. Solo se ocultan esas dos líneas exactas; todo lo demás se
// imprime igual (también si WASM falla) y el código de salida es el de Next.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createInterface } from "node:readline";

const NOISE = /Attempted to load @next\/swc-linux-x64-(gnu|musl), but (an error occurred: .*GLIBC_.* not found|it was not installed)/;

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const build = spawn(process.execPath, [next, "build", "--webpack"], { stdio: ["inherit", "pipe", "pipe"] });

for (const [from, to] of [
  [build.stdout, process.stdout],
  [build.stderr, process.stderr],
]) {
  createInterface({ input: from, crlfDelay: Infinity }).on("line", (line) => {
    if (!NOISE.test(line)) to.write(line + "\n");
  });
}

build.on("error", (e) => {
  console.error(e);
  process.exit(1);
});
build.on("close", (code) => {
  process.exitCode = code ?? 1;
  if (code === 0) writeAssetList();
});

// Lista de archivos de la compilación para public/sw.js: el panel los guarda todos para abrir sin internet, también los que
// se cargan solo al usarlos (como el lector de Excel). Se genera en cada compilación y no va en git.
function writeAssetList() {
  const root = ".next/static";
  if (!existsSync(root)) return;
  const files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.endsWith(".map"))
    .map(
      (e) =>
        `/_next/static/${join(e.parentPath, e.name)
          .replaceAll("\\", "/")
          .slice(root.length + 1)}`,
    );
  writeFileSync("public/sw-assets.json", JSON.stringify({ build: readFileSync(".next/BUILD_ID", "utf8").trim(), files }));
}
