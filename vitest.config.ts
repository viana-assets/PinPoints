import { defineConfig } from "vitest/config";
import path from "path";

// Testlauf (Roadmap Phase 12, seit v106 auch Komponenten – Fahrplan C6).
//
// Die reinen Rechenfunktionen (`tests/*.test.ts`) laufen in Node – geprüft wird zuerst die Logik,
// an der Geld hängt: Preise, Rabatte, Gültigkeitszeiträume, Kalenderwochen, Lagerplätze.
//
// Komponententests (`tests/*.test.tsx`) laufen in jsdom, einem nachgebauten Browser ohne Bildschirm.
// Sie tragen dafür oben die Zeile `// @vitest-environment jsdom` – die Rechentests bleiben so schnell
// und brauchen keinen Browser. Geprüft wird dort, was ein Mensch sieht: ob eine Meldung der
// Datenbank lesbar ankommt, ob ein Knopf gesperrt ist, ob ohne Netz das Richtige dasteht.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  // JSX übersetzt in den Tests Vite, mit der neuen Umwandlung ohne `import React` – wie Next.js
  // (tsconfig: "jsx": "react-jsx").
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
