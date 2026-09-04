import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // L'alias « @/ » de tsconfig : sans lui, tout module qui importe « @/data/… » ou
  // « @/lib/… » (calculateur, pdf-*, db) était intestable sous Vitest — les tests devaient
  // ruser avec des imports relatifs, et les PDF n'avaient aucun test de rendu.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // Évite que Vitest tente de charger le code Next/DB lourd
    globals: false,
  },
});
