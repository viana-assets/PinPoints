import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// D4 (v100): Jede seitenweise Abfrage (`.range(`) braucht eine eindeutige Sortierung, sonst
// können Zeilen zwischen zwei Seiten doppelt kommen oder fehlen. Der Test liest die Abfragen
// aus lib/api/ und verlangt vor jedem `.range(` als letzte Sortierung einen eindeutigen Schlüssel.
const ORDNER = join(__dirname, "..", "lib", "api");
// `kunde_a, kunde_b` ist der zusammengesetzte Primärschlüssel von `kunden_keine_dublette` (E1, Migration 64).
const EINDEUTIG = [
  /\.order\("id"\)\s*\.range\(/, /\.order\("module_key"\)\s*\.range\(/, /\.order\("tire_storage_id"\)\s*\.range\(/,
  /\.order\("kunde_a"\)\s*\.order\("kunde_b"\)\s*\.range\(/,
];

describe("seitenweise Abfragen sind eindeutig sortiert", () => {
  for (const datei of readdirSync(ORDNER).filter((d) => d.endsWith(".ts"))) {
    const text = readFileSync(join(ORDNER, datei), "utf8");
    const stellen = [...text.matchAll(/\.range\(/g)];
    if (stellen.length === 0) continue;
    it(datei, () => {
      for (const s of stellen) {
        const davor = text.slice(Math.max(0, (s.index ?? 0) - 200), (s.index ?? 0) + 7);
        expect(EINDEUTIG.some((r) => r.test(davor)), `${datei}: ${davor.slice(-120)}`).toBe(true);
      }
    });
  }
});
