import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_VERSION, NEUIGKEITEN, neuigkeitenUngelesen } from "@/lib/version";
import { auftragsNr, istTestauftrag, istTestrechnung, ohneTestauftraege, ohneTestkunden, ohneTestrechnungen } from "@/lib/testkunde";

describe("Fassung", () => {
  // Der Service Worker und das Programm werden gemeinsam hochgezählt. Stehen sie auseinander,
  // zeigt die App eine Fassung an, die sie gar nicht ist.
  it("stimmt mit FASSUNG in public/sw.js überein", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    const m = sw.match(/const FASSUNG = "([^"]+)"/);
    expect(m?.[1]).toBe(APP_VERSION);
  });

  it("hat zur aktuellen Fassung einen Eintrag „Was gibt es Neues“ – ganz oben", () => {
    expect(NEUIGKEITEN[0].version).toBe(APP_VERSION);
    expect(NEUIGKEITEN[0].punkte.length).toBeGreaterThan(0);
  });

  it("führt jede Fassung nur einmal und neueste zuerst", () => {
    const nr = NEUIGKEITEN.map((n) => Number(n.version.slice(1)));
    expect(new Set(nr).size).toBe(nr.length);
    expect([...nr].sort((a, b) => b - a)).toEqual(nr);
  });

  it("zeigt als ungelesen, was nach der zuletzt gelesenen Fassung kam", () => {
    const liste = NEUIGKEITEN.slice(0, 3);
    expect(neuigkeitenUngelesen(liste[2].version, liste).map((n) => n.version)).toEqual([liste[0].version, liste[1].version]);
    expect(neuigkeitenUngelesen(liste[0].version, liste)).toEqual([]);
    expect(neuigkeitenUngelesen(null, liste).map((n) => n.version)).toEqual([liste[0].version]);
    expect(neuigkeitenUngelesen("v1", liste).map((n) => n.version)).toEqual([liste[0].version]);
  });
});

describe("Testkunden", () => {
  it("schreibt Testaufträge als T-Nummer", () => {
    expect(auftragsNr(1318)).toBe("1318");
    expect(auftragsNr(-3)).toBe("T3");
    expect(auftragsNr(null)).toBe("?");
  });

  it("erkennt Testaufträge und -rechnungen an der negativen Nummer", () => {
    expect(istTestauftrag({ order_number: -1 })).toBe(true);
    expect(istTestauftrag({ order_number: 1 })).toBe(false);
    expect(istTestrechnung({ nummer: -2 })).toBe(true);
    expect(istTestrechnung({ nummer: 1931 })).toBe(false);
  });

  it("lässt Testdaten aus Auswertungen heraus", () => {
    expect(ohneTestauftraege([{ order_number: 5 }, { order_number: -1 }])).toEqual([{ order_number: 5 }]);
    expect(ohneTestrechnungen([{ nummer: -1 }, { nummer: 7 }])).toEqual([{ nummer: 7 }]);
    expect(ohneTestkunden([{ testkunde: true }, { testkunde: false }, {}])).toEqual([{ testkunde: false }, {}]);
  });
});
