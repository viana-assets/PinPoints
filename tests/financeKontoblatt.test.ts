import { describe, expect, it } from "vitest";
import {
  KONTEN_FILTER_LEER, kontenFiltern, kontenUebersicht, kontoblatt, zeitraumFehler, zeitraumKey, zeitraumVorgaben,
} from "@/lib/finance/kontoblatt";
import type { FinBuchung, FinKonto, FinZeile } from "@/lib/finance/buchung";

// Finance Stufe B (v179): Kontoblatt mit Zeitraum und laufendem Saldo, Konten im Zeitraum.
const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"] = "aufwand", aktiv = true): FinKonto =>
  ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv });
const KONTEN = [k(1200, "Bank", "geld"), k(1576, "Vorsteuer 19 %", "steuer"), k(4530, "Kfz-Betriebskosten"), k(4540, "Kfz-Reparaturen"),
  k(9000, "Saldenvorträge", "vortrag"), k(4999, "Alt", "aufwand", false)];
const z = (posten: number, seite: "S" | "H", konto: number, betrag: number, ist_steuer = false, st: string | null = null, id?: number): FinZeile =>
  ({ id, posten, seite, konto, betrag, ist_steuer, steuerschluessel: st });
const b = (nr: number, datum: string, zeilen: FinZeile[], extra: Partial<FinBuchung> = {}): FinBuchung => ({
  id: `b${nr}`, jahr: 2027, nr, datum, text: `Buchung ${nr}`, beleg: null, quelle: "manuell", quelle_id: null, storno_von: null,
  storniert_durch: null, grund: null, erstellt_am: datum, fin_buchungszeilen: zeilen, ...extra,
});
const VORTRAG = b(1, "2027-01-01", [z(1, "S", 1200, 1000), z(1, "H", 9000, 1000)], { quelle: "vortrag" });
const TANKEN = b(3, "2027-01-08", [z(1, "S", 4530, 65.88, false, "vst19"), z(1, "S", 1576, 12.52, true, "vst19"), z(1, "H", 1200, 78.4, false, "vst19")]);
const SPLITT = b(2, "2027-01-08", [z(1, "S", 4530, 20, false, null, 11), z(1, "H", 1200, 20), z(2, "S", 4540, 30), z(2, "H", 1200, 30), z(3, "S", 4530, 5, false, null, 12), z(3, "H", 1200, 5)]);
const APRIL = b(4, "2027-04-02", [z(1, "S", 1200, 200), z(1, "H", 4530, 200)]);
const ALLE = [APRIL, TANKEN, VORTRAG, SPLITT];
const JAHR = { von: "2027-01-01", bis: "2027-12-31" };

describe("Zeitraum", () => {
  it("Jahr, Quartale, Monate mit richtigem Monatsende (Schaltjahr)", () => {
    const v = zeitraumVorgaben(2028);
    expect(v.length).toBe(17);
    expect(v[0]).toMatchObject({ key: "jahr", von: "2028-01-01", bis: "2028-12-31" });
    expect(v.find((x) => x.key === "q1")).toMatchObject({ von: "2028-01-01", bis: "2028-03-31" });
    expect(v.find((x) => x.key === "m2")).toMatchObject({ text: "Februar 2028", bis: "2028-02-29" });
    expect(zeitraumKey(2028, { von: "2028-04-01", bis: "2028-06-30" })).toBe("q2");
    expect(zeitraumKey(2028, { von: "2028-04-02", bis: "2028-06-30" })).toBe("frei");
  });
  it("frei: im Jahr und von vor bis", () => {
    expect(zeitraumFehler(2027, { von: "2027-02-01", bis: "2027-02-01" })).toBeNull();
    expect(zeitraumFehler(2027, { von: "2026-12-31", bis: "2027-02-01" })).toMatch(/2027/);
    expect(zeitraumFehler(2027, { von: "2027-03-01", bis: "2027-02-01" })).toMatch(/nach/);
    expect(zeitraumFehler(2027, { von: "", bis: "2027-02-01" })).toMatch(/2027/);
  });
});

describe("Kontoblatt", () => {
  it("ganzes Jahr: Reihenfolge Datum dann Nr., laufender Saldo, Splitt mehrfach, Gegenkonto", () => {
    const kb = kontoblatt(ALLE, 4530, JAHR, []);
    expect(kb.eroeffnung).toBe(0);
    expect(kb.zeilen.map((x) => [x.nr, x.soll, x.haben, x.saldo, x.gegen])).toEqual([
      [2, 20, 0, 20, 1200], [2, 5, 0, 25, 1200], [3, 65.88, 0, 90.88, 1200], [4, 0, 200, -109.12, 1200]]);
    expect(kb).toMatchObject({ soll: 90.88, haben: 200, ende: -109.12 });
    expect(new Set(kb.zeilen.map((x) => x.key)).size).toBe(4);
  });
  it("Zeitraum: Eröffnung aus der Zeit davor, Bank mit Saldenvortrag", () => {
    const q2 = kontoblatt(ALLE, 1200, { von: "2027-04-01", bis: "2027-06-30" }, []);
    expect(q2.eroeffnung).toBe(1000 - 78.4 - 55);
    expect(q2.zeilen.map((x) => x.nr)).toEqual([4]);
    expect(q2.ende).toBe(866.6 + 200);
    const jan = kontoblatt(ALLE, 1200, { von: "2027-01-01", bis: "2027-01-31" }, []);
    expect(jan.zeilen[0]).toMatchObject({ nr: 1, gegen: 9000, saldo: 1000 });
  });
  it("Steuerzeile: Gegenkonto ist die andere Seite; Splitt mit mehreren Gegenkonten ist null; Zustand", () => {
    const vst = kontoblatt(ALLE, 1576, JAHR, [{ jahr: 2027, monat: 1, am: "2027-02-10" }]);
    expect(vst.zeilen[0]).toMatchObject({ gegen: 1200, istSteuer: true, steuer: "vst19", zustand: "festgeschrieben" });
    const bank = kontoblatt([SPLITT], 1200, JAHR, []);
    expect(bank.zeilen.map((x) => x.gegen)).toEqual([4530, 4540, 4530]);
    const zwei = b(9, "2027-05-01", [z(1, "S", 4530, 10), z(1, "S", 4540, 10), z(1, "H", 1200, 20)]);
    expect(kontoblatt([zwei], 1200, JAHR, []).zeilen[0].gegen).toBeNull();
    expect(kontoblatt([{ ...APRIL, storniert_durch: "x" }], 1200, JAHR, []).zeilen[0].zustand).toBe("storniert");
  });
});

describe("Konten im Zeitraum", () => {
  it("Eröffnung, Verkehrszahlen, Ende, Anzahl", () => {
    const u = kontenUebersicht(KONTEN, ALLE, { von: "2027-04-01", bis: "2027-12-31" });
    expect(u.find((x) => x.konto.nummer === 1200)).toMatchObject({ eroeffnung: 866.6, soll: 200, haben: 0, ende: 1066.6, anzahl: 1 });
    expect(u.find((x) => x.konto.nummer === 4540)).toMatchObject({ eroeffnung: 30, soll: 0, ende: 30, anzahl: 0 });
    const j = kontenUebersicht(KONTEN, ALLE, JAHR);
    const soll = j.reduce((s, x) => s + x.soll, 0), haben = j.reduce((s, x) => s + x.haben, 0);
    expect(Math.round(soll * 100)).toBe(Math.round(haben * 100));
  });
  it("Filter: nur bebuchte, Art, Suche, ausgeblendete", () => {
    const u = kontenUebersicht(KONTEN, ALLE, JAHR);
    const nrn = (f: Partial<typeof KONTEN_FILTER_LEER>) => kontenFiltern(u, { ...KONTEN_FILTER_LEER, ...f }).map((x) => x.konto.nummer);
    expect(nrn({})).toEqual([1200, 1576, 4530, 4540, 9000]);
    expect(nrn({ nurBebucht: false })).toEqual([1200, 1576, 4530, 4540, 9000]);
    expect(nrn({ nurBebucht: false, ausgeblendete: true })).toEqual([1200, 1576, 4530, 4540, 4999, 9000]);
    expect(nrn({ kategorie: "aufwand" })).toEqual([4530, 4540]);
    expect(nrn({ text: "rep" })).toEqual([4540]);
    expect(nrn({ text: "120" })).toEqual([1200]);
  });
});
