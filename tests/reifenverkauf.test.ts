import { describe, expect, it } from "vitest";
import type { Article, Verkaufsreifen } from "@/lib/types";
import {
  artikelFuer, dotFehler, groesseAusText, groesseText, groessenVorschlag, lagerwert, passtZurSuche,
  positionsText, reifenFrei, reifenHinweise, reifenZustandVonArtikel, sortiereReifen, vorschlagMenge,
  entwurfAlsPosten, entwurfFehler, etikettTexte, lagerwertVerlauf, postenAusSatz, reifenAuswertung, type ReifenVerkaufszeile,
} from "@/lib/reifenverkauf";
import { passtZumFilter } from "@/lib/lagerAnsicht";

// Die Regeln hinter dem Reifenverkauf (Migration 61).

const reifen = (felder: Partial<Verkaufsreifen> = {}): Verkaufsreifen => ({
  id: "r1", zustand: "neu", breite: 235, querschnitt: 55, zoll: 17, kennung: "103V",
  hersteller: "Michelin", modell: "Pilot Sport 4", saison: "sommer", dot: "1224", profiltiefe_mm: null,
  felge: null, runflat: false, xl: false, eprel: null, preis_netto: 120, ek_netto: null,
  bestand: 4, reserviert: 0, verkauft: 0, warehouse_id: "l1", storage_slot_id: null, notiz: null,
  created_at: "2026-09-26T10:00:00Z", updated_at: "2026-09-26T10:00:00Z",
  ...felder,
});

describe("groesseAusText", () => {
  it("liest die üblichen Schreibweisen", () => {
    const g = { breite: 235, querschnitt: 55, zoll: 17 };
    expect(groesseAusText("235/55 R17")).toEqual(g);
    expect(groesseAusText("235/55R17 103V")).toEqual(g);
    expect(groesseAusText("235 55 17")).toEqual(g);
    expect(groesseAusText("2355517")).toEqual(g);
    expect(groesseAusText("235/55 ZR 17 XL")).toEqual(g);
    expect(groesseAusText("235/55-17")).toEqual(g);
  });
  it("ohne Querschnitt und mit halbem Zoll", () => {
    expect(groesseAusText("195 R14 C")).toEqual({ breite: 195, querschnitt: null, zoll: 14 });
    expect(groesseAusText("215/75 R17,5")).toEqual({ breite: 215, querschnitt: 75, zoll: 17.5 });
  });
  it("rät nicht", () => {
    expect(groesseAusText("")).toBeNull();
    expect(groesseAusText("Michelin")).toBeNull();
    expect(groesseAusText("235")).toBeNull();
    expect(groesseAusText("935/55 R17")).toBeNull(); // Breite unmöglich
    expect(groesseAusText("235/55 R40")).toBeNull(); // Zoll unmöglich
  });
});

describe("groesseText und Vorschlag", () => {
  it("schreibt die Größe einheitlich", () => {
    expect(groesseText({ breite: 235, querschnitt: 55, zoll: 17 })).toBe("235/55 R17");
    expect(groesseText({ breite: 195, querschnitt: null, zoll: 14 })).toBe("195 R14");
    expect(groesseText({ breite: 215, querschnitt: 75, zoll: 17.5 })).toBe("215/75 R17,5");
  });
  it("nimmt die erste lesbare Größe der Fahrzeuge", () => {
    expect(groessenVorschlag([null, "unbekannt", "205/55R16 91V"])).toBe("205/55 R16");
    expect(groessenVorschlag([null, ""])).toBe("");
  });
});

describe("passtZurSuche", () => {
  const r = reifen();
  it("findet beim Tippen der Größe", () => {
    for (const s of ["", "2", "235", "235 55", "235/55", "235 55 17", "2355517", "235/55R17", "235/55 R17", "R17", "r17"]) {
      expect(passtZurSuche(r, s), s).toBe(true);
    }
    for (const s of ["225", "235 45", "2355518", "R16"]) {
      expect(passtZurSuche(r, s), s).toBe(false);
    }
  });
  it("findet Hersteller, Modell, Index und Zustand – alle Begriffe müssen passen", () => {
    expect(passtZurSuche(r, "michelin")).toBe(true);
    expect(passtZurSuche(r, "pilot 235")).toBe(true);
    expect(passtZurSuche(r, "103v")).toBe(true);
    expect(passtZurSuche(r, "neu sommer")).toBe(true);
    expect(passtZurSuche(r, "michelin winter")).toBe(false);
    expect(passtZurSuche(r, "conti")).toBe(false);
  });
});

describe("Zahlen", () => {
  it("frei ist Bestand minus Reserviertes, nie negativ", () => {
    expect(reifenFrei({ bestand: 4, reserviert: 3 })).toBe(1);
    expect(reifenFrei({ bestand: 2, reserviert: 2 })).toBe(0);
    expect(reifenFrei({ bestand: 0, reserviert: 1 })).toBe(0);
  });
  it("Lagerwert: nur was daliegt, EK nur wo gepflegt", () => {
    const w = lagerwert([
      reifen({ bestand: 4, preis_netto: 100, ek_netto: 60 }),
      reifen({ bestand: 2, preis_netto: 45.5, ek_netto: null }),
      reifen({ bestand: 0, preis_netto: 999, ek_netto: 999 }),
    ]);
    expect(w).toEqual({ stueck: 6, vk: 491, ek: 240, stueckMitEk: 4 });
  });
  it("schlägt einen Satz vor, sonst alle freien", () => {
    expect(vorschlagMenge(6)).toBe(4);
    expect(vorschlagMenge(2)).toBe(2);
    expect(vorschlagMenge(0)).toBe(1);
  });
});

describe("positionsText", () => {
  it("neu", () => {
    expect(positionsText(reifen({ xl: true }))).toBe("Michelin Pilot Sport 4 · 235/55 R17 103V XL · Sommer · DOT 1224");
  });
  it("gebraucht mit Profil und Felge", () => {
    expect(positionsText(reifen({
      zustand: "gebraucht", hersteller: "Conti", modell: "WinterContact", breite: 205, zoll: 16, kennung: "91H",
      saison: "winter", dot: "3821", profiltiefe_mm: 5.5, felge: "alu",
    }))).toBe("Conti WinterContact · 205/55 R16 91H · Winter · DOT 3821 · 5,5 mm · Komplettrad Alu");
  });
  it("ohne Modell, Index und DOT bleibt nichts Leeres stehen", () => {
    expect(positionsText(reifen({ modell: null, kennung: null, dot: null }))).toBe("Michelin · 235/55 R17 · Sommer");
  });
});

describe("reifenHinweise", () => {
  const heute = new Date("2026-09-26");
  it("Neureifen ab drei Jahren, gebrauchte ab sechs", () => {
    expect(reifenHinweise(reifen({ dot: "1223" }), heute)).toEqual([{ text: "Reifen von 2023 – 3 Jahre alt", sperrt: false }]);
    expect(reifenHinweise(reifen({ dot: "1224" }), heute)).toEqual([]);
    expect(reifenHinweise(reifen({ zustand: "gebraucht", dot: "1222" }), heute)).toEqual([]);
    expect(reifenHinweise(reifen({ zustand: "gebraucht", dot: "1220" }), heute)[0].text).toBe("Reifen von 2020 – 6 Jahre alt");
  });
  it("Profil: knapp ist ein Hinweis, unter 1,6 mm wird nicht verkauft", () => {
    const g = (mm: number, saison: Verkaufsreifen["saison"]) => reifenHinweise(reifen({ zustand: "gebraucht", dot: null, profiltiefe_mm: mm, saison }), heute);
    expect(g(2.5, "sommer")).toEqual([{ text: "Profil 2,5 mm – knapp", sperrt: false }]);
    expect(g(3.5, "sommer")).toEqual([]);
    expect(g(3.5, "winter")).toEqual([{ text: "Profil 3,5 mm – knapp", sperrt: false }]);
    expect(g(1.2, "sommer")[0].sperrt).toBe(true);
  });
});

describe("dotFehler", () => {
  it("vier Ziffern, Woche 1 bis 53, leer erlaubt", () => {
    expect(dotFehler("")).toBeNull();
    expect(dotFehler("1224")).toBeNull();
    expect(dotFehler("12/24")).toBeNull();
    expect(dotFehler("124")).not.toBeNull();
    expect(dotFehler("5424")).not.toBeNull();
    expect(dotFehler("0024")).not.toBeNull();
  });
});

describe("sortiereReifen", () => {
  it("freie zuerst, dann die gesuchte Größe", () => {
    const a = reifen({ id: "a", breite: 205, querschnitt: 55, zoll: 16 });
    const b = reifen({ id: "b" });
    const c = reifen({ id: "c", reserviert: 4 });
    expect(sortiereReifen([c, a, b], groesseAusText("235/55 R17")).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortiereReifen([c, b, a]).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("Artikel", () => {
  const artikel = (id: string, nr: number, art: Article["abrechnungsart"], active = true): Article => ({
    id, article_number: nr, short_name: id, long_name: id, active, abrechnungsart: art,
    fragt_einlagerung: false, einheit: "Stück", freitext: false, created_at: "",
  });
  const alle = [
    artikel("wechsel", 1, "normal"),
    artikel("neu-alt", 9, "reifenverkauf_neu", false),
    artikel("neu", 12, "reifenverkauf_neu"),
    artikel("neu2", 14, "reifenverkauf_neu"),
    artikel("gebraucht", 13, "reifenverkauf_gebraucht"),
  ];
  it("der aktive mit der kleinsten Nummer", () => {
    expect(artikelFuer(alle, "neu")?.id).toBe("neu");
    expect(artikelFuer(alle, "gebraucht")?.id).toBe("gebraucht");
    expect(artikelFuer(alle.slice(0, 2), "neu")).toBeNull();
  });
  it("erkennt den Zustand am Artikel", () => {
    expect(reifenZustandVonArtikel(alle[0])).toBeNull();
    expect(reifenZustandVonArtikel(alle[2])).toBe("neu");
    expect(reifenZustandVonArtikel(alle[4])).toBe("gebraucht");
  });
});

describe("Regalwand-Filter mit Verkaufsreifen", () => {
  it("ein Platz mit Verkaufsreifen ist nicht frei", () => {
    expect(passtZumFilter(null, [], "frei", true)).toBe(false);
    expect(passtZumFilter(null, [], "frei")).toBe(true);
    expect(passtZumFilter(null, [], "alle", true)).toBe(true);
    expect(passtZumFilter(null, [], "winter", true)).toBe(false);
  });
});

describe("groessenAbweichung (E8)", () => {
  it("meldet Räder, deren Größe nicht zum Fahrzeug passt", async () => {
    const { groessenAbweichung } = await import("@/lib/reifenverkauf");
    expect(groessenAbweichung("205/55 R16 91V", [{ position: "VL", reifengroesse: "205/55R16" }])).toBeNull();
    expect(groessenAbweichung("205/55 R16", [{ position: "VL", reifengroesse: "205/55 R16" }, { position: "HL", reifengroesse: "225/45 R17" }]))
      .toBe("Reifengröße prüfen: HL 225/45 R17 – am Fahrzeug steht 205/55 R16");
  });
  it("ohne lesbare Größe kein Befund", async () => {
    const { groessenAbweichung } = await import("@/lib/reifenverkauf");
    expect(groessenAbweichung(null, [{ position: "VL", reifengroesse: "225/45 R17" }])).toBeNull();
    expect(groessenAbweichung("205/55 R16", [{ position: "VL", reifengroesse: null }])).toBeNull();
  });
});

describe("postenAusSatz (E17)", () => {
  const satz = { erfassungsart: "sammel" as const, anzahl_raeder: 4, dot_date: "2121", profiltiefe_mm: 5, saison: "winter" as const };
  it("Satzwert: ein Posten mit der Größe des Fahrzeugs", () => {
    expect(postenAusSatz(satz, [], "205/55R16 91H")).toEqual([
      { groesse: "205/55 R16", hersteller: "", modell: "", saison: "winter", dot: "2121", profiltiefe_mm: 5, felge: null, bestand: 4, preis: "", ek: "" },
    ]);
  });
  it("je Rad: gruppiert nach Größe, DOT und Felge, schwächstes Profil", () => {
    const rad = (dot: string, mm: number | null, felge: "alu" | "stahl" | "keine" | null = "alu", reifengroesse: string | null = null) => ({ reifengroesse, dot_date: dot, profiltiefe_mm: mm, felge });
    const p = postenAusSatz({ ...satz, erfassungsart: "einzeln" }, [rad("2121", 5.5), rad("2121", 4.8), rad("3522", 6.5), rad("3522", null)], "225/45 R17");
    expect(p.map((x) => [x.groesse, x.dot, x.bestand, x.profiltiefe_mm, x.felge])).toEqual([
      ["225/45 R17", "2121", 2, 4.8, "alu"],
      ["225/45 R17", "3522", 2, 6.5, "alu"],
    ]);
  });
});

describe("entwurfFehler / entwurfAlsPosten (E17)", () => {
  const e = { groesse: "205/55 R16", hersteller: "Conti", modell: "", saison: "winter" as const, dot: "2121", profiltiefe_mm: 5, felge: null, bestand: 4, preis: "25", ek: "" };
  it("vollständig ist fehlerfrei und wird zum Posten", () => {
    expect(entwurfFehler(e)).toBeNull();
    expect(entwurfAlsPosten(e)).toEqual({
      zustand: "gebraucht", breite: 205, querschnitt: 55, zoll: 16, hersteller: "Conti", modell: null, saison: "winter",
      dot: "2121", profiltiefe_mm: 5, felge: null, preis_netto: 25, ek_netto: null, bestand: 4,
    });
    expect(entwurfAlsPosten({ ...e, preis: "19,9", ek: "0" }).preis_netto).toBe(19.9);
    expect(entwurfAlsPosten({ ...e, ek: "0" }).ek_netto).toBe(0);
  });
  it("sagt, was fehlt", () => {
    expect(entwurfFehler({ ...e, hersteller: " " })).toBe("Hersteller fehlt.");
    expect(entwurfFehler({ ...e, groesse: "groß" })).toMatch(/Größe/);
    expect(entwurfFehler({ ...e, preis: "" })).toMatch(/Verkaufspreis/);
    expect(entwurfFehler({ ...e, ek: "abc" })).toMatch(/Ankaufspreis/);
    expect(entwurfFehler({ ...e, saison: null })).toBe("Saison fehlt.");
    expect(entwurfFehler({ ...e, dot: "12" })).toMatch(/^DOT/);
  });
});

describe("etikettTexte (E17)", () => {
  it("Größe groß, Name fett, kein Preis", () => {
    const t = etikettTexte(reifen({ zustand: "gebraucht", profiltiefe_mm: 5.5, xl: true, felge: "alu" }));
    expect(t.gross).toEqual({ links: "235/55 R17", rechts: "Gebraucht" });
    expect(t.kopf).toBe("Michelin Pilot Sport 4");
    expect(t.zeilen).toEqual(["Sommer · 103V XL", "DOT 1224 · 5,5 mm · Komplettrad Alu"]);
    expect(t.zeilen.join(" ")).not.toMatch(/€/);
  });
});

describe("reifenAuswertung / lagerwertVerlauf (E18)", () => {
  const auftrag = (datum: string, teil: Partial<{ status: string; order_number: number; deleted_at: string | null }> = {}) =>
    ({ order_date: datum, status: "erledigt", order_number: 100, rechnung_noetig: true, deleted_at: null, ...teil }) as ReifenVerkaufszeile["auftrag"];
  const zeile = (id: string, menge: number, preis: number, a: ReifenVerkaufszeile["auftrag"]): ReifenVerkaufszeile =>
    ({ verkaufsreifen_id: id, quantity: menge, net_price: preis, vat_rate: 19, endpreis_netto: null, auftrag: a });
  const posten = [
    reifen({ id: "neu1", zustand: "neu", ek_netto: 80, preis_netto: 120, bestand: 2, created_at: "2026-01-10T00:00:00Z" }),
    reifen({ id: "geb1", zustand: "gebraucht", ek_netto: null, preis_netto: 30, bestand: 4, created_at: "2026-08-01T00:00:00Z" }),
  ];
  const zeilen = [
    zeile("neu1", 2, 120, auftrag("2026-03-05")),
    zeile("geb1", 2, 30, auftrag("2026-09-10")),
    zeile("geb1", 4, 30, auftrag("2026-09-12", { status: "offen" })),          // nur reserviert
    zeile("neu1", 1, 120, auftrag("2026-03-06", { order_number: -3 })),       // Testauftrag
  ];
  it("Umsatz je Zustand, Marge nur mit Einkaufspreis, nur erledigte echte Aufträge", () => {
    const a = reifenAuswertung(zeilen, posten, { von: "2026-01-01", bis: "2026-12-31" }, "2026-10-02");
    expect(a.neu).toEqual({ stueck: 2, netto: 240 });
    expect(a.gebraucht).toEqual({ stueck: 2, netto: 60 });
    expect(a.marge).toEqual({ netto: 240, ek: 160, marge: 80, stueckMitEk: 2, stueck: 4 });
    expect(a.lagerwert.vk).toBe(360);
  });
  it("lange liegend ab sechs Monaten", () => {
    const a = reifenAuswertung(zeilen, posten, { von: "2026-01-01", bis: "2026-12-31" }, "2026-10-02");
    expect(a.langeLiegend).toEqual({ posten: 1, stueck: 2, wertVk: 240 });
  });
  it("Verlauf: heutiger Bestand plus spätere Verkäufe, nur Posten, die es schon gab", () => {
    expect(lagerwertVerlauf(zeilen, posten, ["2026-02-28", "2026-07-31", "2026-08-31", "2026-10-02"])).toEqual([
      (2 + 2) * 120, 2 * 120, 2 * 120 + (4 + 2) * 30, 2 * 120 + 4 * 30,
    ]);
  });
});
