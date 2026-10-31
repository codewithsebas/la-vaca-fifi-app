import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/public\//, replacement: fileURLToPath(new URL("./public/", import.meta.url)) },
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
