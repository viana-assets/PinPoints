import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// iOS Safari zoomt beim Antippen in jedes Eingabefeld unter 16px hinein und zoomt nie zurück (app/globals.css,
// „Eingabefelder am Handy: 16px“). Für textarea und select hat die alte Regel nicht mehr gegriffen, weil spätere
// Regeln (`.nk-feld textarea` mit 14,5px) gewannen – „Was fehlt?“ blieb am iPhone vergrößert (gemeldet 29.10.2026,
// v174). Die Regel steht jetzt am Dateiende; dieser Test hält sie dort und stark genug.

const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type Regel = { selektor: string; inhalt: string; pos: number };
function regeln(): Regel[] {
  const out: Regel[] = [];
  const muster = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = muster.exec(css))) out.push({ selektor: m[1].trim(), inhalt: m[2], pos: m.index });
  return out;
}
// Spezifität als [IDs, Klassen/Attribute/Pseudoklassen, Elemente] – grob, für die Selektoren dieser Datei genügt es.
function spezifitaet(s: string): [number, number, number] {
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const klassen = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const elemente = (s.replace(/\.[\w-]+|\[[^\]]+\]|::?[\w-]+(\([^)]*\))?|#[\w-]+/g, " ").match(/[a-z][\w-]*/gi) || []).length;
  return [ids, klassen, elemente];
}
const groesser = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const setztSchrift = (inhalt: string) => /font(-size)?\s*:/.test(inhalt);

describe("Eingabefelder am Handy: kein Hineinzoomen", () => {
  const alle = regeln();
  const letzte = alle[alle.length - 1];

  it("die 16px-Regel für textarea und select ist die letzte Regel der Datei", () => {
    expect(letzte.selektor).toBe("textarea:not(.rm-feld), select:not(.rm-feld)");
    expect(letzte.inhalt).toMatch(/font-size:\s*16px/);
  });

  it("keine andere Regel für textarea/select mit Schriftgröße ist spezifischer", () => {
    const ziel = spezifitaet("textarea:not(.rm-feld)");
    const zuStark = alle.slice(0, -1).flatMap((r) => r.selektor.split(",").map((s) => s.trim())
      .filter((s) => /\b(textarea|select)\b/.test(s) && setztSchrift(alle.find((x) => x.selektor.includes(s))!.inhalt))
      .filter((s) => groesser(spezifitaet(s), ziel) > 0));
    expect(zuStark).toEqual([]);
  });

  it("Textfelder (input) schützt weiter die Ausschlussliste – keine input-Regel mit Schriftgröße ist stärker", () => {
    const liste = alle.find((r) => r.selektor.startsWith("input:not([type=checkbox])") && /16px/.test(r.inhalt));
    expect(liste).toBeTruthy();
    const ziel = spezifitaet(liste!.selektor.split(",")[0]);
    const zuStark = alle.flatMap((r) => (setztSchrift(r.inhalt) ? r.selektor.split(",").map((s) => s.trim()) : []))
      .filter((s) => /\binput\b/.test(s) && !s.startsWith("input:not([type=checkbox])") && groesser(spezifitaet(s), ziel) >= 0);
    expect(zuStark).toEqual([]);
  });
});
