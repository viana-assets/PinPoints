import { defineConfig } from "vitest/config";
import path from "path";

// Testlauf für die reinen Rechenfunktionen (Roadmap Phase 12). Bewusst kein jsdom und keine
// Komponententests: geprüft wird zuerst die Logik, an der später Geld hängt – Preise, Rabatte,
// Gültigkeitszeiträume, Kalenderwochen, Lagerplatz-Nummerierung.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
