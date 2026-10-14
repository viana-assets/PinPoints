import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_RHYTHMEN, geldBestand, liqPerioden, liqPosten, liqTiefpunkt, liqZeitraeume, planTermine, startLautAuszug, type FinPlanposten,
} from "@/lib/finance/liquiditaet";
import { abweichung } from "@/lib/finance/auswertungen";
import type { FinRechnungZeile, FinVorgang } from "@/lib/finance/rechnungen";
import type { FinBeleg } from "@/lib/finance/belege";
import type { FinUstStand } from "@/lib/finance/steuern";
import type { FinKonto } from "@/lib/finance/buchung";

// Finance: Liquiditätsvorschau (v158, Migration 100) und Vorjahresvergleich.
const HEUTE = "2026-10-14"; // Mittwoch, KW 42
const r = (p: Partial<FinRechnungZeile>): FinRechnungZeile => ({
  rechnung_id: "r1", nummer_text: "RE1", datum: "2026-10-01", brutto: 119, order_id: "o", order_number: 1, kunde: "Kunde A", storniert: false,
  storno_nummer: null, status: "gebucht", fehler: null, faellig_am: "2026-10-20", bezahlt_am: null, bezahlt_art: null, buchung_nr: 1, ...p,
});
const b = (p: Partial<FinBeleg>): FinBeleg => ({
  id: "b1", lieferant_id: null, belegdatum: "2026-10-01", belegnummer: "L-1", text: "Reifen", faellig_am: "2026-10-30", posten: [], datei_pfad: null,
  datei_typ: null, datei_name: null, status: "gebucht", brutto: 595, buchung_id: "x", bezahlt_am: null, bezahlt_art: null, erstellt_am: "x", ...p,
} as FinBeleg);
const v = (p: Partial<FinVorgang>): FinVorgang => ({ order_id: "o9", order_number: 900, datum: "2026-10-10", zeit: null, status: "erledigt", kunde: "Kunde B", kundennummer: null, betrag: 80, ...p });
const plan = (p: Partial<FinPlanposten>): FinPlanposten => ({ id: "p", text: "Miete", art: "aus", betrag: 850, ab: "2026-11-01", rhythmus: "monat", bis: null, notiz: null, erstellt_am: "x", geaendert_am: null, ...p });
const leer = { rechnungen: null, vorgaenge: null, belege: null, ust: null, plan: null };
const an = { ueberfaellige: true, vorgaenge: true };

describe("planTermine", () => {
  it("monatlich am Monatsende abgeschnitten, ohne den Tag zu verlieren", () => {
    expect(planTermine({ ab: "2026-01-31", rhythmus: "monat", bis: null }, "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("Fenster, bis, einmalig, Quartal und Jahr", () => {
    expect(planTermine({ ab: "2026-01-15", rhythmus: "quartal", bis: null }, "2026-05-01", "2026-12-31")).toEqual(["2026-07-15", "2026-10-15"]);
    expect(planTermine({ ab: "2026-11-01", rhythmus: "monat", bis: "2026-12-31" }, HEUTE, "2027-03-31")).toEqual(["2026-11-01", "2026-12-01"]);
    expect(planTermine({ ab: "2026-12-15", rhythmus: "einmal", bis: null }, HEUTE, "2027-01-31")).toEqual(["2026-12-15"]);
    expect(planTermine({ ab: "2026-09-15", rhythmus: "einmal", bis: null }, HEUTE, "2027-01-31")).toEqual([]);
    expect(planTermine({ ab: "2024-02-29", rhythmus: "jahr", bis: null }, "2025-01-01", "2026-12-31")).toEqual(["2025-02-28", "2026-02-28"]);
  });
  it("Rhythmen wie Migration 100", () => {
    const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "100_finance_planposten.sql"), "utf8");
    const liste = sql.match(/rhythmus in \(([^)]*)\)/)![1].split(",").map((x) => x.trim().replace(/'/g, ""));
    expect(FIN_RHYTHMEN.map((x) => x.wert)).toEqual(liste);
  });
});

describe("liqZeitraeume", () => {
  it("Wochen: die laufende bis Sonntag, dann Montag bis Sonntag", () => {
    const w = liqZeitraeume(HEUTE, "woche", 3);
    expect(w).toEqual([
      { von: "2026-10-14", bis: "2026-10-18", titel: "KW 42 · 14.10.–18.10." },
      { von: "2026-10-19", bis: "2026-10-25", titel: "KW 43 · 19.10.–25.10." },
      { von: "2026-10-26", bis: "2026-11-01", titel: "KW 44 · 26.10.–01.11." },
    ]);
    expect(liqZeitraeume("2026-12-30", "woche", 2)[1].titel).toBe("KW 1 · 04.01.–10.01."); // KW 53 2026 endet am 03.01.2027
  });
  it("Monate über den Jahreswechsel", () => {
    expect(liqZeitraeume(HEUTE, "monat", 4).map((z) => [z.von, z.bis, z.titel])).toEqual([
      ["2026-10-14", "2026-10-31", "Oktober 2026"], ["2026-11-01", "2026-11-30", "November 2026"],
      ["2026-12-01", "2026-12-31", "Dezember 2026"], ["2027-01-01", "2027-01-31", "Januar 2027"],
    ]);
  });
});

describe("liqPosten", () => {
  it("Rechnungen und Belege mit Rest nach Fälligkeit; Überfälliges auf heute; Testaufträge und Bezahltes nicht", () => {
    const { posten } = liqPosten({
      ...leer,
      rechnungen: [r({}), r({ rechnung_id: "r2", nummer_text: "RE2", faellig_am: "2026-10-01", teilbezahlt: 19 }), r({ rechnung_id: "r3", bezahlt_am: "2026-10-05", bezahlt_art: "bank" }),
        r({ rechnung_id: "r4", order_number: -3 }), r({ rechnung_id: "r1" })],
      belege: [b({}), b({ id: "b2", status: "entwurf" }), b({ id: "b1" })],
    }, HEUTE, "2026-12-31", an);
    expect(posten.map((x) => [x.datum, x.betrag, x.quelle, x.ueberfaellig])).toEqual([
      ["2026-10-14", 100, "rechnung", true], ["2026-10-20", 119, "rechnung", false], ["2026-10-30", -595, "beleg", false],
    ]);
    expect(posten[1].text).toBe("RE1 · Kunde A");
  });
  it("ohne Überfälliges: nicht drin, aber gezählt", () => {
    const x = liqPosten({ ...leer, rechnungen: [r({ faellig_am: "2026-10-01" })], belege: [b({ faellig_am: "2026-10-02" })] }, HEUTE, "2026-12-31", { ueberfaellige: false, vorgaenge: true });
    expect(x.posten).toEqual([]);
    expect(x.ohne).toEqual({ ein: 119, aus: 595 });
  });
  it("Aufträge ohne Rechnung: Zahlungsziel ab Auftrag bzw. heute; ohne Betrag nicht", () => {
    const { posten } = liqPosten({ ...leer, vorgaenge: [v({}), v({ order_id: "o8", order_number: 901, datum: "2026-10-20", status: "offen" }), v({ order_number: 902, betrag: 0 })] }, HEUTE, "2026-12-31", an);
    expect(posten.map((x) => [x.datum, x.betrag])).toEqual([["2026-10-28", 80], ["2026-11-03", 80]]);
    expect(liqPosten({ ...leer, vorgaenge: [v({})] }, HEUTE, "2026-12-31", { ueberfaellige: true, vorgaenge: false }).posten).toEqual([]);
  });
  it("Umsatzsteuer zur Frist: abgegeben und Frist vorbei = bezahlt, nicht abgegeben = überfällig, laufender Monat bisher", () => {
    const zr = (zeitraum: string, von: string, bis: string, s: number, abgegeben = false) => ({
      zeitraum, von, bis, kennzahlen: { "81": { b: s * 100 / 19, s }, "66": { s: 10 } },
      abgaben: abgegeben ? [{ fassung: 1, abgegeben_am: "x", kennzahlen: { "81": { b: s * 100 / 19, s }, "66": { s: 10 } }, notiz: null, erstellt_am: "x" }] : [],
    });
    const stand: FinUstStand = { eingerichtet: true, umsatz_vorjahr: null, sondervorauszahlung: null, umsatz_jahr: 0, zeitraeume: [
      zr("M08", "2026-08-01", "2026-08-31", 38), zr("M09", "2026-09-01", "2026-09-30", 190, true), zr("M10", "2026-10-01", "2026-10-31", 95), zr("M11", "2026-11-01", "2026-11-30", 0),
    ] };
    const { posten } = liqPosten({ ...leer, ust: { stand, jahr: 2026, einstellungen: { dauerfrist: false, besteuerung: "regel", start_datum: "2026-08-01" } } }, HEUTE, "2026-12-31", an);
    expect(posten.map((x) => [x.datum, x.betrag, x.text, x.ueberfaellig])).toEqual([
      ["2026-10-14", -28, "Umsatzsteuer August 2026", true],
      ["2026-11-10", -85, "Umsatzsteuer Oktober 2026 (bisher gebucht)", false],
    ]);
  });
  it("Planposten im Fenster, Vorzeichen nach Art", () => {
    const { posten } = liqPosten({ ...leer, plan: [plan({}), plan({ id: "q", text: "Förderung", art: "ein", betrag: 2500, ab: "2026-12-15", rhythmus: "einmal" })] }, HEUTE, "2026-12-31", an);
    expect(posten.map((x) => [x.datum, x.betrag, x.text])).toEqual([["2026-11-01", -850, "Miete"], ["2026-12-01", -850, "Miete"], ["2026-12-15", 2500, "Förderung"]]);
  });
});

describe("Perioden, Tiefpunkt, Bestand", () => {
  it("laufender Bestand je Zeitraum und der niedrigste Stand", () => {
    const z = liqZeitraeume(HEUTE, "monat", 3);
    const { posten } = liqPosten({ ...leer, rechnungen: [r({})], belege: [b({})], plan: [plan({})] }, HEUTE, z[2].bis, an);
    const p = liqPerioden(1000, posten, z);
    expect(p.map((x) => [x.anfang, x.ein, x.aus, x.ende])).toEqual([[1000, 119, 595, 524], [524, 0, 850, -326], [-326, 0, 850, -1176]]);
    expect(liqTiefpunkt(p)).toMatchObject({ betrag: -1176, periode: { titel: "Dezember 2026" } });
    expect(liqTiefpunkt(liqPerioden(50, [], z))).toEqual({ betrag: 50, periode: null });
  });
  it("Geldkonten laut Buchhaltung bis zum Monat; Kontoauszug ersetzt nur die Bankkonten", () => {
    const k = (nummer: number, kategorie: string, bezeichnung = String(nummer)) => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true }) as FinKonto;
    const konten = [k(1000, "geld", "Kasse"), k(1200, "geld", "Bank"), k(8400, "erloes")];
    const g = geldBestand([{ konto: 1000, monat: 9, soll: 100, haben: 20 }, { konto: 1200, monat: 10, soll: 500, haben: 100 }, { konto: 1200, monat: 11, soll: 999, haben: 0 }, { konto: 8400, monat: 10, soll: 0, haben: 500 }], konten, 10);
    expect(g).toEqual({ summe: 480, konten: [{ konto: 1000, bezeichnung: "Kasse", saldo: 80 }, { konto: 1200, bezeichnung: "Bank", saldo: 400 }] });
    const a = startLautAuszug(g, [{ id: "k1", name: "Sparkasse", iban: null, konto: 1200, aktiv: true }], [
      { id: "i1", bankkonto_id: "k1", dateiname: null, format: "camt", anzahl: 1, neu: 1, von: null, bis: null, endsaldo: 1500, endsaldo_am: "2026-10-10", erstellt_am: "2026-10-11" },
      { id: "i0", bankkonto_id: "k1", dateiname: null, format: "camt", anzahl: 1, neu: 1, von: null, bis: null, endsaldo: 900, endsaldo_am: "2026-09-30", erstellt_am: "2026-10-01" },
    ]);
    expect(a).toEqual({ summe: 1580, auszuege: 1, zeilen: [{ text: "Sparkasse", betrag: 1500, am: "2026-10-10" }, { text: "Kasse", betrag: 80, am: null }] });
  });
});

describe("abweichung", () => {
  it("Euro und Prozent gegen das Vorjahr", () => {
    expect(abweichung(300, 200)).toEqual({ betrag: 100, prozent: 50 });
    expect(abweichung(-50, -100)).toEqual({ betrag: 50, prozent: 50 });
    expect(abweichung(10, 0)).toEqual({ betrag: 10, prozent: null });
    expect(abweichung(200, 75).prozent).toBe(166.7);
  });
});
