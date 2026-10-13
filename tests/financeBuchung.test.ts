import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_KONTO_KATEGORIEN, betragLesen, buchungBetrag, buchungVorschau, buchungZustand, kontenSalden, kontoNr, passendeSchluessel, postenZeilen,
  type FinKonto, type FinSteuerschluessel,
} from "@/lib/finance/buchung";
import type { FinEinstellungen } from "@/lib/finance/einstellungen";

// Finance F1 (Migration 88, v146). Die Fälle sind dieselben wie in pgtest/t88.sql – die Vorschau muss
// genau die Zeilen zeigen, die `fin_posten_schreiben()` schreibt.
const k = (nummer: number, kategorie: FinKonto["kategorie"], aktiv = true): FinKonto =>
  ({ kontenrahmen: "skr03", nummer, bezeichnung: "K" + nummer, kategorie, eigen: false, aktiv });
const KONTEN = [
  k(320, "anlage"), k(1000, "geld"), k(1200, "geld"), k(1400, "forderung"), k(1600, "verbindlichkeit"),
  k(1576, "steuer"), k(1577, "steuer"), k(1574, "steuer"), k(1776, "steuer"), k(1787, "steuer"), k(1774, "steuer"),
  k(3123, "aufwand"), k(3400, "aufwand"), k(3425, "aufwand"), k(8195, "erloes"), k(8200, "erloes"), k(8400, "erloes"), k(4999, "aufwand", false),
];
const s = (schluessel: string, satz: number, art: FinSteuerschluessel["art"], ust: number | null, vst: number | null): FinSteuerschluessel =>
  ({ kontenrahmen: "skr03", schluessel, bezeichnung: schluessel, satz, art, ust_konto: ust, vst_konto: vst });
const SCHL = [s("ust19", 19, "ust", 1776, null), s("vst19", 19, "vst", null, 1576), s("r13b19", 19, "r13b", 1787, 1577),
  s("ige19", 19, "ige", 1774, 1574), s("igl", 0, "ohne", null, null), s("ku", 0, "ohne", null, null)];
type E = Pick<FinEinstellungen, "kontenrahmen" | "besteuerung" | "r13b_empfaenger" | "innergemeinschaftlich">;
const REGEL: E = { kontenrahmen: "skr03", besteuerung: "regel", r13b_empfaenger: true, innergemeinschaftlich: false };
const KLEIN: E = { ...REGEL, besteuerung: "klein" };

const zeilen = (soll: number, haben: number, betrag: number, steuer: string | null, e = REGEL) => {
  const r = postenZeilen({ soll, haben, betrag, steuer }, 1, KONTEN, SCHL, e);
  if ("fehler" in r) throw new Error(r.fehler);
  return r.zeilen.map((z) => `${z.seite}${z.konto}:${z.betrag}`);
};
const fehler = (soll: number | null, haben: number | null, betrag: number | null, steuer: string | null, e = REGEL) => {
  const r = postenZeilen({ soll, haben, betrag, steuer }, 1, KONTEN, SCHL, e);
  return "fehler" in r ? r.fehler : null;
};

describe("postenZeilen – wie fin_posten_schreiben()", () => {
  it("Rechnung brutto 119 mit USt 19 %", () => expect(zeilen(1400, 8400, 119, "ust19")).toEqual(["S1400:119", "H8400:100", "H1776:19"]));
  it("Wareneinkauf 595 mit Vorsteuer", () => expect(zeilen(3400, 1200, 595, "vst19")).toEqual(["S3400:500", "H1200:595", "S1576:95"]));
  it("Gutschrift: Steuer auf der Sollseite", () => expect(zeilen(8400, 1400, 59.5, "ust19")).toEqual(["S8400:50", "H1400:59.5", "S1776:9.5"]));
  it("§ 13b: Umsatzsteuer und Vorsteuer", () => expect(zeilen(3123, 1600, 100, "r13b19")).toEqual(["S3123:100", "H1600:100", "H1787:19", "S1577:19"]));
  it("Anlagekauf mit Vorsteuer", () => expect(zeilen(320, 1200, 11900, "vst19")).toEqual(["S320:10000", "H1200:11900", "S1576:1900"]));
  it("ohne Schlüssel", () => expect(zeilen(1000, 1200, 20, null)).toEqual(["S1000:20", "H1200:20"]));
  it("Kleinunternehmer § 13b: ohne Vorsteuer, Steuer wird Aufwand", () =>
    expect(zeilen(3123, 1600, 100, "r13b19", KLEIN)).toEqual(["S3123:119", "H1600:100", "H1787:19"]));
  it("Kleinunternehmer-Erlös mit „ku“", () => expect(zeilen(1000, 8195, 80, "ku", KLEIN)).toEqual(["S1000:80", "H8195:80"]));
  it("Rundung auf Cent", () => expect(zeilen(1400, 8400, 10, "ust19")).toEqual(["S1400:10", "H8400:8.4", "H1776:1.6"]));
});

describe("postenZeilen – Ablehnungen wie die Datenbank", () => {
  it.each([
    [[3425, 1600, 100, "ige19"], /Innergemeinschaftliche Geschäfte sind/],
    [[1200, 1200, 1, null], /dasselbe Konto/],
    [[1200, 1000, 0, null], /größer als 0/],
    [[1234, 1000, 5, null], /Konto 1234 gibt es im SKR03 nicht/],
    [[4999, 1200, 5, null], /ausgeblendet/],
    [[1776, 1200, 5, "ust19"], /Steuerkonto/],
    [[1200, 1400, 5, "ust19"], /genau ein Erlös-, Aufwands- oder Anlagekonto/],
    [[1400, 8195, 5, "ku"], /nur bei der Besteuerung als Kleinunternehmer/],
    [[null, 1000, 5, null], /Soll- und Haben-Konto/],
  ] as const)("%j", (a, muster) => expect(fehler(a[0], a[1], a[2], a[3])).toMatch(muster));
  it("Kleinunternehmer: keine USt", () => expect(fehler(1400, 8400, 119, "ust19", KLEIN)).toMatch(/Kleinunternehmer/));
  it("§ 13b ausgeschaltet", () => expect(fehler(3123, 1600, 100, "r13b19", { ...REGEL, r13b_empfaenger: false })).toMatch(/§ 13b ist/));
});

describe("buchungVorschau", () => {
  it("zwei Posten, Soll = Haben", () => {
    const v = buchungVorschau([{ soll: 1400, haben: 8400, betrag: 119, steuer: "ust19" }, { soll: 1400, haben: 8200, betrag: 50, steuer: null }], KONTEN, SCHL, REGEL);
    expect(v.fehler).toBeNull();
    expect([v.soll, v.haben]).toEqual([169, 169]);
    expect(v.zeilen.map((z) => z.posten)).toEqual([1, 1, 1, 2, 2]);
  });
  it("erster Fehler mit Postennummer", () => {
    expect(buchungVorschau([{ soll: 1400, haben: 8400, betrag: 1, steuer: null }, { soll: 1, haben: 2, betrag: 1, steuer: null }], KONTEN, SCHL, REGEL).fehler).toMatch(/^Posten 2:/);
    expect(buchungVorschau([], KONTEN, SCHL, REGEL).fehler).toMatch(/mindestens einen Posten/);
  });
});

describe("passendeSchluessel", () => {
  it("Regelbesteuerung ohne ig.: kein ku, kein ige/igl", () =>
    expect(passendeSchluessel(SCHL, REGEL).map((x) => x.schluessel)).toEqual(["ust19", "vst19", "r13b19"]));
  it("Kleinunternehmer: kein USt/VSt, dafür ku", () =>
    expect(passendeSchluessel(SCHL, { ...KLEIN, innergemeinschaftlich: true }).map((x) => x.schluessel)).toEqual(["r13b19", "ige19", "igl", "ku"]));
});

describe("Salden, Betrag, Zustand", () => {
  const b = (zeilen: [string, number, number][]) => ({ fin_buchungszeilen: zeilen.map(([seite, konto, betrag], i) => ({ id: i, posten: 1, seite: seite as "S" | "H", konto, betrag, steuerschluessel: null, ist_steuer: false })) });
  it("Saldo Soll minus Haben je Konto", () => {
    const m = kontenSalden([b([["S", 1400, 119], ["H", 8400, 100], ["H", 1776, 19]]), b([["H", 1400, 119], ["S", 1200, 119]])]);
    expect(m.get(1400)).toMatchObject({ soll: 119, haben: 119, saldo: 0, anzahl: 2 });
    expect(m.get(8400)?.saldo).toBe(-100);
  });
  it("Betrag = Sollseite", () => expect(buchungBetrag(b([["S", 1400, 119], ["H", 8400, 100], ["H", 1776, 19]]))).toBe(119));
  it("festgeschrieben nach Monat", () => {
    expect(buchungZustand({ datum: "2026-09-10", storno_von: null, storniert_durch: "x" }, [{ jahr: 2026, monat: 9, am: "" }]))
      .toEqual({ storno: false, storniert: true, festgeschrieben: true });
  });
  it("Kontonummer vierstellig", () => expect([kontoNr(27), kontoNr(8400)]).toEqual(["0027", "8400"]));
});

describe("betragLesen", () => {
  it.each([["119", 119], ["119,5", 119.5], ["1.234,56", 1234.56], ["1234.56", 1234.56], ["1.234", 1234], ["12 €", 12], ["", null], ["abc", null], ["1,234", null], ["-5", null]] as const)(
    "%s", (t, w) => expect(betragLesen(t)).toBe(w));
});

describe("Wertebereiche wie in Migration 88", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "88_finance_buchungen.sql"), "utf8");
  it("Kontenkategorien", () => {
    const m = sql.match(/constraint fin_konto_kategorie check \(kategorie in \(([^)]*)\)\)/);
    expect((m?.[1] ?? "").split(",").map((x) => x.trim().replace(/'/g, "")).sort()).toEqual(FIN_KONTO_KATEGORIEN.map((x) => x.wert).sort());
  });
  it("Jedes Steuerkonto der Schlüssel ist als Konto angelegt", () => {
    const konten = new Set([...sql.matchAll(/\('(skr0[34])', (\d+), '/g)].map((m) => `${m[1]}:${m[2]}`));
    const schl = [...sql.matchAll(/\('(skr0[34])', '(\w+)', '[^']*', [\d.]+, '(\w+)', (\w+), (\w+)\)/g)];
    expect(schl.length).toBe(18);
    for (const m of schl) for (const nr of [m[4], m[5]]) if (nr !== "null") expect(konten.has(`${m[1]}:${nr}`), `${m[1]} ${nr}`).toBe(true);
  });
});
