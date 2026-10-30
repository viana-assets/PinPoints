import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buchungVorschau, postenZeilen, type FinBuchung, type FinKonto, type FinSteuerschluessel, type FinZeile } from "@/lib/finance/buchung";
import { finVorgabe } from "@/lib/finance/einstellungen";
import { DATEV_SPALTEN } from "@/lib/datev";
import { finDatevStapel } from "@/lib/finance/export";
import { JOURNAL_FILTER_LEER, filterAnzahl, journalFiltern, journalZeilen } from "@/lib/finance/arbeitsplatz";
import { FIN_KOST_ARTEN, buchungKost, kostAuswahl, kostNummerFehler, kostText, kostenAuswertung, type FinKostenstelle } from "@/lib/finance/kostenstellen";
import { stapelZeilePruefen } from "@/lib/finance/stapel";

// Kostenstellen (Migration 108, v182): wohin sie beim Buchen kommen (wie fin_buchen(), Fälle aus /tmp/pgt/t108.sql),
// Auswertung, Journal-Filter, DATEV-Felder.
const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"]): FinKonto => ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const KONTEN = [k(1000, "Kasse", "geld"), k(1200, "Bank", "geld"), k(1400, "Forderungen", "forderung"), k(1576, "Vorsteuer", "steuer"),
  k(1776, "Umsatzsteuer", "steuer"), k(4530, "Kfz", "aufwand"), k(4540, "Reparatur", "aufwand"), k(8400, "Erlöse", "erloes")];
const SCHL: FinSteuerschluessel[] = [
  { kontenrahmen: "skr03", schluessel: "vst19", bezeichnung: "Vorsteuer 19 %", satz: 19, art: "vst", ust_konto: null, vst_konto: 1576 },
  { kontenrahmen: "skr03", schluessel: "ust19", bezeichnung: "Umsatzsteuer 19 %", satz: 19, art: "ust", ust_konto: 1776, vst_konto: null }];
const E = finVorgabe(2027, "2027-02-10");
const KS: FinKostenstelle[] = [
  { id: "a", art: "kost1", nummer: "T10", bezeichnung: "NB-MR 1", aktiv: true, firmenfahrzeug_id: "f1" },
  { id: "b", art: "kost1", nummer: "T2", bezeichnung: "NB-MR 2", aktiv: true, firmenfahrzeug_id: "f2" },
  { id: "c", art: "kost1", nummer: "T3", bezeichnung: "Alt", aktiv: false, firmenfahrzeug_id: null },
  { id: "d", art: "kost2", nummer: "100", bezeichnung: "Montage", aktiv: true, firmenfahrzeug_id: null }];

describe("Wohin die Kostenstelle kommt", () => {
  it("an die Aufwandszeile, nicht an Bank und Vorsteuer", () => {
    const r = postenZeilen({ soll: 4530, haben: 1200, betrag: 78.4, steuer: "vst19", kost1: "T1", kost2: "100" }, 1, KONTEN, SCHL, E);
    expect("zeilen" in r && r.zeilen.map((z) => [z.konto, z.kost1 ?? null, z.kost2 ?? null])).toEqual([[4530, "T1", "100"], [1200, null, null], [1576, null, null]]);
  });
  it("an die Erlöszeile; nur Geldkonten → abgelehnt wie die Datenbank", () => {
    const r = postenZeilen({ soll: 1400, haben: 8400, betrag: 119, steuer: "ust19", kost2: "300" }, 1, KONTEN, SCHL, E);
    expect("zeilen" in r && r.zeilen.filter((z) => z.kost2).map((z) => z.konto)).toEqual([8400]);
    expect(postenZeilen({ soll: 1000, haben: 1200, betrag: 50, steuer: null, kost1: "T1" }, 1, KONTEN, SCHL, E))
      .toEqual({ fehler: "Posten 1: Eine Kostenstelle gehört an ein Erlös-, Aufwands- oder Anlagekonto – hier ist keins." });
    expect(buchungVorschau([{ soll: 1000, haben: 1200, betrag: 50, steuer: null, kost1: " " }], KONTEN, SCHL, E).fehler).toBeNull();
  });
  it("Stapelzeile wird genauso geprüft", () => {
    expect(stapelZeilePruefen({ datum: "2027-02-10", soll: 1000, haben: 1200, betrag: 5, steuer: null, text: "x", kost1: "T1" }, 2027, KONTEN, SCHL, E, []).fehler)
      .toBe("Eine Kostenstelle gehört an ein Erlös-, Aufwands- oder Anlagekonto – hier ist keins.");
  });
});

describe("Auswahl, Anzeige, Auswertung", () => {
  it("Arten wie die Prüfregel der Migration; Auswahl nach Nummer, ausgeblendete nur wenn gesetzt", () => {
    const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "108_finance_kostenstellen.sql"), "utf8");
    const m = /fin_ks_art check \(art in \(([^)]*)\)\)/.exec(sql);
    expect(m?.[1].split(",").map((x) => x.trim().replace(/'/g, ""))).toEqual(FIN_KOST_ARTEN.map((a) => a.wert));
    expect(kostAuswahl(KS, "kost1").map((x) => x.nummer)).toEqual(["T2", "T10"]);
    expect(kostAuswahl(KS, "kost1", "T3").map((x) => x.nummer)).toEqual(["T2", "T3", "T10"]);
    expect(kostText(KS, "kost2", "100")).toBe("100 · Montage");
    expect(kostText(KS, "kost2", "999")).toBe("999");
    expect(kostNummerFehler("T 1")).toMatch(/Buchstaben/);
    expect(kostNummerFehler("T1")).toBeNull();
  });

  let id = 0;
  const z = (seite: "S" | "H", konto: number, betrag: number, kost1: string | null = null, kost2: string | null = null, ist_steuer = false): FinZeile =>
    ({ id: ++id, posten: 1, seite, konto, betrag, steuerschluessel: null, ist_steuer, kost1, kost2 });
  const b = (nr: number, datum: string, zeilen: FinZeile[]): FinBuchung => ({ id: `b${nr}`, jahr: 2027, nr, datum, text: `B${nr}`, beleg: null, quelle: "manuell",
    quelle_id: null, storno_von: null, storniert_durch: null, grund: null, erstellt_am: datum, fin_buchungszeilen: zeilen });
  const B = [
    b(1, "2027-02-01", [z("S", 4530, 65.88, "T1", null), z("H", 1200, 78.4), z("S", 1576, 12.52, null, null, true)]),
    b(2, "2027-02-02", [z("S", 1400, 119), z("H", 8400, 100, "T1", "100"), z("H", 1776, 19, null, null, true)]),
    b(3, "2027-02-03", [z("S", 4540, 30), z("H", 1200, 30)]),
    b(4, "2027-03-01", [z("H", 4530, 5.88, "T1"), z("S", 1200, 5.88)]),
  ];

  it("Erlöse, Aufwand, Ergebnis je Kostenstelle und ohne", () => {
    const w = kostenAuswertung(B, KONTEN, "2027-01-01", "2027-02-28");
    expect(w.map((x) => [x.art, x.nummer, x.erloese, x.aufwand, x.ergebnis, x.anzahl])).toEqual([
      ["kost1", "T1", 100, 65.88, 34.12, 2], ["kost1", null, 0, 30, -30, 1],
      ["kost2", "100", 100, 0, 100, 1], ["kost2", null, 0, 95.88, -95.88, 2]]);
    expect(kostenAuswertung(B, KONTEN, "2027-01-01", "2027-12-31").find((x) => x.nummer === "T1")?.aufwand).toBe(60);
  });
  it("Kostenstelle einer Buchung und Journal-Filter", () => {
    expect(buchungKost(B[1], "kost1")).toBe("T1");
    expect(buchungKost(B[2], "kost1")).toBeNull();
    expect(buchungKost(b(9, "2027-01-01", [z("S", 4530, 1, "T1"), z("S", 4540, 1, "T2"), z("H", 1200, 2)]), "kost1")).toBe("mehrere");
    const zeilen = journalZeilen(B, []);
    expect(journalFiltern(zeilen, { ...JOURNAL_FILTER_LEER, kost: "kost1|T1" }).map((x) => x.nr)).toEqual([1, 2, 4]);
    expect(journalFiltern(zeilen, { ...JOURNAL_FILTER_LEER, kost: "kost2|100" }).map((x) => x.nr)).toEqual([2]);
    expect(filterAnzahl({ ...JOURNAL_FILTER_LEER, kost: "kost2|100" })).toBe(1);
  });
  it("DATEV: KOST1/KOST2 im Satz", () => {
    const d = finDatevStapel([B[0], B[1]], KONTEN, SCHL, { rahmen: "skr03", betrieb: { datev_berater: 12345, datev_mandant: 1, datev_sachkontenlaenge: 4, datev_skr: "03" },
      von: "2027-01-01", bis: "2027-12-31", ohneVortrag: true, erzeugtAm: new Date(2027, 1, 1) });
    const saetze = d.inhalt.split("\r\n").slice(2).filter(Boolean).map((l) => l.split(";"));
    const i1 = DATEV_SPALTEN.indexOf("KOST1 - Kostenstelle"), i2 = DATEV_SPALTEN.indexOf("KOST2 - Kostenstelle");
    // Ohne Steuerschlüssel an den Zeilen bleibt die Steuer ein eigener Satz – der trägt keine Kostenstelle.
    expect(saetze.map((f) => [f[6], f[7], f[i1], f[i2]])).toEqual([
      ["1200", "4530", '"T1"', ""], ["1200", "1576", "", ""], ["1400", "8400", '"T1"', '"100"'], ["1400", "1776", "", ""]]);
  });
});
