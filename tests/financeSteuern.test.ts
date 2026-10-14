import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_UST_ZAHLUNG_KONTEN, FIN_UST_ZEILEN, feiertage, kuPruefung, naechsterWerktag, ostersonntag, sondervorauszahlungVorschlag,
  ustFormular, ustFrist, ustStandLesen, ustZuErledigen, ustZustand, ustZustandText, zeitraumText, type FinUstZeitraum,
} from "@/lib/finance/steuern";

// Finance F5 (Migration 92, v150).
// Die Kennzahlen rechnet seit Migration 93 deren Fassung von fin_ust_kennzahlen().
const MIG = readFileSync(join(__dirname, "..", "supabase", "migrations", "92_finance_steuern.sql"), "utf8")
  + readFileSync(join(__dirname, "..", "supabase", "migrations", "93_finance_luecken.sql"), "utf8");
const MIG88 = readFileSync(join(__dirname, "..", "supabase", "migrations", "88_finance_buchungen.sql"), "utf8");

describe("Formular", () => {
  const kz = { "81": { b: 150.4, s: 28.58 }, "86": { b: 10, s: 0.7 }, "41": { b: 500 }, "89": { b: 200, s: 38 }, "61": { s: 38 },
    "46": { b: 100, s: 19 }, "67": { s: 19 }, "66": { s: 9.5 } };
  it("volle Euro, Steuer zu 81/86/89 wie das Formular, § 13b und Vorsteuer wie gebucht", () => {
    const f = ustFormular(kz);
    expect(f.zeilen.map((z) => [z.kz, z.bemessung, z.steuer])).toEqual([
      ["81", 150, 28.5], ["86", 10, 0.7], ["41", 500, null], ["89", 200, 38], ["46", 100, 19], ["66", null, 9.5], ["61", null, 38], ["67", null, 19],
    ]);
    expect(f.zahllast).toBe(19.7);
    expect(f.zahllastBuch).toBe(19.78);
    expect(f.leer).toBe(false);
  });
  it("Kz 39 mindert, negative Bemessung wird zur Null hin abgeschnitten, leer ist leer", () => {
    expect(ustFormular({ "81": { b: 1000, s: 190 }, "39": { s: 50 } }).zahllast).toBe(140);
    expect(ustFormular({ "86": { b: -10.7, s: -0.75 } }).zeilen[0]).toMatchObject({ bemessung: -10, steuer: -0.7 });
    expect(ustFormular({}).leer).toBe(true);
  });
  it("die Kennzahlen der Datenbank stehen alle im Formular", () => {
    const db = [...MIG.matchAll(/'(\d{2})'/g)].map((m) => m[1]).filter((k) => !["01", "10", "12"].includes(k));
    for (const k of new Set(db)) expect(FIN_UST_ZEILEN.some((z) => z.kz === k || z.steuerKz === k), k).toBe(true);
  });
  it("Konten für die Zahlung gibt es in Migration 88", () => {
    for (const [rahmen, k] of Object.entries(FIN_UST_ZAHLUNG_KONTEN)) {
      expect(MIG88).toContain(`('${rahmen}', ${k.vorauszahlung}, 'Umsatzsteuer-Vorauszahlungen', 'steuer')`);
      expect(MIG88).toContain(`('${rahmen}', ${k.sonder}, 'Umsatzsteuer-Sondervorauszahlung 1/11', 'steuer')`);
    }
  });
});

describe("Fristen", () => {
  it("Ostern und bundesweite Feiertage", () => {
    expect(ostersonntag(2026)).toBe("2026-04-05");
    expect(ostersonntag(2027)).toBe("2027-03-28");
    expect(ostersonntag(2023)).toBe("2023-04-09");
    expect([...feiertage(2026)].sort()).toEqual(["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-14", "2026-05-25", "2026-10-03", "2026-12-25", "2026-12-26"]);
  });
  it("10. des Folgemonats, Dauerfrist einen Monat später, Wochenende und Feiertag schieben", () => {
    expect(ustFrist("2026-08-31", "M08", false)).toBe("2026-09-10");
    expect(ustFrist("2026-08-31", "M08", true)).toBe("2026-10-12"); // 10.10.2026 ist ein Samstag
    expect(ustFrist("2026-12-31", "Q4", false)).toBe("2027-01-11"); // Sonntag
    expect(ustFrist("2026-12-31", "Q4", true)).toBe("2027-02-10");
    expect(ustFrist("2023-03-31", "M03", false)).toBe("2023-04-11"); // Ostermontag
    expect(ustFrist("2026-12-31", "J", false)).toBeNull();
    expect(naechsterWerktag("2026-12-25")).toBe("2026-12-28");
  });
  it("Zeitraum in Worten", () => {
    expect(zeitraumText("M03", 2026)).toBe("März 2026");
    expect(zeitraumText("Q2", 2026)).toBe("2. Quartal 2026");
    expect(zeitraumText("J", 2026)).toBe("Jahr 2026");
  });
});

const zr = (p: Partial<FinUstZeitraum>): FinUstZeitraum => ({ zeitraum: "M08", von: "2026-08-01", bis: "2026-08-31", kennzahlen: { "81": { b: 100, s: 19 } }, abgaben: [], ...p });
const regel = { dauerfrist: false, besteuerung: "regel" as const, start_datum: "2026-01-01" };

describe("Zustand", () => {
  it("kommt, läuft, offen, überfällig", () => {
    expect(ustZustand(zr({}), regel, "2026-07-31").art).toBe("kommt");
    expect(ustZustand(zr({}), regel, "2026-08-31").art).toBe("laeuft");
    expect(ustZustand(zr({}), regel, "2026-09-03")).toEqual({ art: "offen", frist: "2026-09-10", tage: 7 });
    expect(ustZustand(zr({}), regel, "2026-09-12")).toEqual({ art: "ueberfaellig", frist: "2026-09-10", tage: 2 });
    expect(ustZustandText({ art: "offen", frist: "2026-09-10", tage: 1 })).toBe("fällig in 1 Tag");
    // Ganz vor dem Starttag zählt nicht, der Monat mit dem Starttag schon.
    expect(ustZustand(zr({}), { ...regel, start_datum: "2026-09-01" }, "2026-10-01").art).toBe("vorher");
    expect(ustZustand(zr({}), { ...regel, start_datum: "2026-08-31" }, "2026-10-01").art).toBe("ueberfaellig");
  });
  it("abgegeben, geändert seit Abgabe (Kz 39 zählt nicht)", () => {
    const a = { fassung: 1, abgegeben_am: "2026-09-09", kennzahlen: { "81": { b: 100, s: 19 } }, notiz: null, erstellt_am: "x" };
    expect(ustZustand(zr({ abgaben: [a] }), regel, "2026-10-01")).toEqual({ art: "abgegeben", am: "2026-09-09", fassung: 1 });
    expect(ustZustand(zr({ abgaben: [{ ...a, kennzahlen: { ...a.kennzahlen, "39": { s: 5 } } }] }), regel, "2026-10-01").art).toBe("abgegeben");
    expect(ustZustand(zr({ abgaben: [a], kennzahlen: { "81": { b: 110, s: 20.9 } } }), regel, "2026-10-01").art).toBe("geaendert");
  });
  it("Kleinunternehmer: nur mit § 13b oder ig. Erwerb", () => {
    const ku = { dauerfrist: false, besteuerung: "klein" as const, start_datum: "2026-01-01" };
    expect(ustZustand(zr({ kennzahlen: {} }), ku, "2026-09-03").art).toBe("keine");
    expect(ustZustand(zr({ kennzahlen: { "46": { b: 100, s: 19 } } }), ku, "2026-09-03").art).toBe("offen");
  });
  it("Zu erledigen zählt fällig ≤ 7 Tage, überfällig, geändert", () => {
    const stand = ustStandLesen({ eingerichtet: true, umsatz_jahr: "0", zeitraeume: [
      zr({ zeitraum: "M07", von: "2026-07-01", bis: "2026-07-31" }), zr({}), zr({ zeitraum: "M09", von: "2026-09-01", bis: "2026-09-30" }),
    ] });
    expect(ustZuErledigen(stand, regel, "2026-09-05")).toEqual({ faellig: 1, ueberfaellig: 1, geaendert: 0 });
  });
});

describe("Lesen, Kleinunternehmer, Sondervorauszahlung", () => {
  it("Stand: Zahlen als Zahl, nicht eingerichtet", () => {
    expect(ustStandLesen({ eingerichtet: false })).toEqual({ eingerichtet: false });
    const s = ustStandLesen({ eingerichtet: true, umsatz_vorjahr: "18000.00", sondervorauszahlung: null, umsatz_jahr: "788.00",
      zeitraeume: [{ zeitraum: "M01", von: "2026-01-01", bis: "2026-01-31", kennzahlen: { "81": { b: "1.50", s: "0.29" }, "66": { s: "1" } }, abgaben: [] }] });
    expect(s).toMatchObject({ umsatz_vorjahr: 18000, sondervorauszahlung: null, umsatz_jahr: 788 });
    expect(s.eingerichtet && s.zeitraeume[0].kennzahlen).toEqual({ "81": { b: 1.5, s: 0.29 }, "66": { s: 1 } });
  });
  it("Grenzen § 19: Warnung ab 80 %, darüber rot", () => {
    expect(kuPruefung(50_000, null)).toEqual({ laufend: { anteil: 0.5, stufe: "ok" }, vorjahr: null });
    expect(kuPruefung(80_000, 26_000)).toMatchObject({ laufend: { stufe: "nahe" }, vorjahr: { stufe: "ueber" } });
    expect(kuPruefung(100_001, 25_000)).toMatchObject({ laufend: { stufe: "ueber" }, vorjahr: { stufe: "nahe" } });
  });
  it("Sondervorauszahlung: ein Elftel der letzten Fassungen, ohne Kz 39", () => {
    const a = (kz: Record<string, { b?: number; s?: number }>, fassung = 1) => ({ fassung, abgegeben_am: "x", kennzahlen: kz, notiz: null, erstellt_am: "x" });
    const vorjahr = ustStandLesen({ eingerichtet: true, umsatz_jahr: 0, zeitraeume: [
      zr({ zeitraum: "M01", abgaben: [a({ "81": { b: 10000, s: 1900 } }), a({ "81": { b: 20000, s: 3800 } }, 2)] }),
      zr({ zeitraum: "M12", abgaben: [a({ "81": { b: 10000, s: 1900 }, "39": { s: 500 } })] }),
      zr({ zeitraum: "M02" }),
    ] });
    expect(sondervorauszahlungVorschlag(vorjahr)).toBe(Math.round(5700 / 11));
    expect(sondervorauszahlungVorschlag({ eingerichtet: false })).toBeNull();
  });
});
