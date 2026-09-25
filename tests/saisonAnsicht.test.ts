import { describe, expect, it } from "vitest";
import { inWochen, ortAus, plzVorschlaege, saisonGruppen } from "@/lib/saisonAnsicht";

// Die Regeln hinter der neuen Saisonliste (Entwurf I): Kunden bündeln, nach PLZ gruppieren,
// Gebiete vorschlagen.

const z = (satz: string, id: string, name: string, address: string | null) => ({ satz, cust: { id, name, address } });

describe("ortAus", () => {
  it("liest den Ort hinter der Postleitzahl", () => {
    expect(ortAus("Hauptstr. 3, 90482 Nürnberg")).toBe("Nürnberg");
    expect(ortAus("Am Bach 12, 90513 Zirndorf, Hinterhaus")).toBe("Zirndorf");
  });
  it("rät nicht, wenn keine Postleitzahl dasteht", () => {
    expect(ortAus("Hauptstr. 3 Nürnberg")).toBeNull();
    expect(ortAus(null)).toBeNull();
  });
});

describe("saisonGruppen", () => {
  const zeilen = [
    z("s1", "k1", "Ritter", "Weg 1, 90513 Zirndorf"),
    z("s2", "k2", "Hofmann GmbH", "Str. 2, 90482 Nürnberg"),
    z("s3", "k2", "Hofmann GmbH", "Str. 2, 90482 Nürnberg"),
    z("s4", "k3", "Alt", "ohne Adresse"),
    z("s5", "k4", "Brandt", "Gasse 9, 90482 Nürnberg"),
  ];
  const g = saisonGruppen(zeilen);

  it("bündelt die Sätze eines Kunden – er steht einmal da", () => {
    const hofmann = g[0].kunden.find((k) => k.kunde.id === "k2");
    expect(hofmann?.saetze.map((s) => s.satz)).toEqual(["s2", "s3"]);
  });
  it("gruppiert aufsteigend nach PLZ, Kunden nach Name, ohne PLZ am Ende", () => {
    expect(g.map((x) => x.plz)).toEqual(["90482", "90513", null]);
    expect(g[0].ort).toBe("Nürnberg");
    expect(g[0].kunden.map((k) => k.kunde.name)).toEqual(["Brandt", "Hofmann GmbH"]);
    expect(g[2].kunden[0].kunde.id).toBe("k3");
  });
});

describe("plzVorschlaege", () => {
  it("zählt Kunden, nicht Sätze, und nennt den häufigsten Ort", () => {
    const v = plzVorschlaege([
      z("s1", "k1", "A", "1, 90482 Nürnberg"),
      z("s2", "k1", "A", "1, 90482 Nürnberg"),
      z("s3", "k2", "B", "2, 90491 Nürnberg"),
      z("s4", "k3", "C", "3, 90513 Zirndorf"),
    ]);
    expect(v).toEqual([
      { praefix: "904", ort: "Nürnberg", kunden: 2 },
      { praefix: "905", ort: "Zirndorf", kunden: 1 },
    ]);
  });
});

describe("inWochen", () => {
  it("rechnet in Ortszeit ab heute", () => {
    expect(inWochen(6, new Date(2026, 8, 25, 23, 30))).toBe("2026-11-06");
    expect(inWochen(2, new Date(2026, 11, 25))).toBe("2027-01-08");
  });
});
