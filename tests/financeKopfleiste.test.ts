import { describe, expect, it } from "vitest";
import {
  FIN_PERIODE_JAHR, festText, festgeschriebenBis, financeStand, globaleSuche, navZahl, periodeFilter, periodeMonate, periodeZeitraum, wjAuswahl,
} from "@/lib/finance/kopfleiste";
import { FIN_KURZBEFEHLE, JOURNAL_FILTER_LEER, filterAnzahl, journalFiltern, journalZeilen, kurzbefehl } from "@/lib/finance/arbeitsplatz";
import { FINANCE_SEITEN } from "@/lib/finance/seiten";
import type { FinBuchung, FinKonto, FinZeile } from "@/lib/finance/buchung";
import type { FinPersonenkonto } from "@/lib/finance/personen";
import type { FinBeleg } from "@/lib/finance/belege";

// Kopfleiste, Statuszeile und Zähler (v187). Alle Namen und Zahlen erfunden.
const k = (nummer: number, bezeichnung: string, kategorie: FinKonto["kategorie"] = "aufwand"): FinKonto =>
  ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie, eigen: false, aktiv: true });
const KONTEN = [k(1200, "Bank", "geld"), k(4530, "Laufende Kfz-Kosten (Kraftstoff)"), k(4580, "Sonstige Kfz-Kosten"), k(8400, "Erlöse 19 % USt", "erloes")];
const person = (nummer: number, name: string, art: "debitor" | "kreditor"): FinPersonenkonto =>
  ({ nummer, art, sammel: false, name, kundennummer: art === "debitor" ? nummer - 10000 : null, customer_id: null, lieferant_id: null, anschrift: null, ust_id: null, vortrag: 0 });
const PERSONEN = [person(10001, "Muster Logistik GmbH", "debitor"), person(10002, "Beispiel Autohaus KG", "debitor"), person(70001, "Reifengroßhandel Nord", "kreditor")];

describe("Wirtschaftsjahr und Periode", () => {
  it("zur Wahl: nächstes Jahr, das laufende und zwei zurück", () => {
    expect(wjAuswahl(2026)).toEqual([2027, 2026, 2025, 2024]);
  });
  it("Periode als Zeitraum, als Monate und als Journalfilter", () => {
    expect(periodeZeitraum(2027, "q1")).toEqual({ von: "2027-01-01", bis: "2027-03-31" });
    expect(periodeZeitraum(2028, "m2")).toEqual({ von: "2028-02-01", bis: "2028-02-29" });
    expect(periodeZeitraum(2027, "unsinn")).toEqual({ von: "2027-01-01", bis: "2027-12-31" });
    expect(periodeMonate("q3", 10)).toEqual({ von: 7, bis: 9 });
    expect(periodeMonate("m11", 10)).toEqual({ von: 11, bis: 11 });
    expect(periodeMonate(FIN_PERIODE_JAHR, 10)).toEqual({ von: 1, bis: 10 });
    expect(periodeFilter(2027, FIN_PERIODE_JAHR)).toEqual({ von: null, bis: null });
    expect(periodeFilter(2027, "m1")).toEqual({ von: "2027-01-01", bis: "2027-01-31" });
  });
});

describe("Suche (F2)", () => {
  const d = { seiten: FINANCE_SEITEN, konten: KONTEN, personen: PERSONEN, buchungen: true };
  it("leer: nichts", () => {
    expect(globaleSuche("  ", d)).toEqual([]);
  });
  it("Seiten, Konten, Personen, zuletzt das Journal", () => {
    const t = globaleSuche("ba", d);
    expect(t.map((x) => x.key)).toEqual(["s:bank", "k:1200", "j"]);
    expect(t[0].ziel).toEqual({ art: "seite", seite: "bank" });
    expect(t[1]).toMatchObject({ titel: "1200 Bank", ziel: { art: "konto", konto: 1200 } });
    expect(t[2].ziel).toEqual({ art: "journal", text: "ba" });
  });
  it("Kfz: zwei Konten; Person nach Namensteil, Name vorn zuerst", () => {
    expect(globaleSuche("kfz", d).filter((x) => x.ziel.art === "konto").map((x) => x.key)).toEqual(["k:4530", "k:4580"]);
    const p = globaleSuche("reifen", d).filter((x) => x.ziel.art === "person");
    expect(p).toEqual([expect.objectContaining({ titel: "70001 Reifengroßhandel Nord", unter: "Kreditor · Buchungen im Journal", ziel: { art: "person", nummer: 70001 } })]);
  });
  it("Ziffern: Konten nach Nummer, Personen nach Konto- oder Kundennummer", () => {
    expect(globaleSuche("1000", d).filter((x) => x.ziel.art === "person").map((x) => x.key)).toEqual(["p:10001", "p:10002"]);
    expect(globaleSuche("45", d).filter((x) => x.ziel.art === "konto").map((x) => x.key)).toEqual(["k:4530", "k:4580"]);
  });
  it("ohne Recht auf Buchungen: nur Seiten", () => {
    expect(globaleSuche("ba", { ...d, buchungen: false }).map((x) => x.key)).toEqual(["s:bank"]);
  });
});

describe("Festgeschrieben bis, Zähler", () => {
  it("lückenlos ab Januar", () => {
    const f = (monat: number, jahr = 2026) => ({ jahr, monat, am: "2026-10-01" });
    expect(festgeschriebenBis([f(1), f(2), f(4)], 2026)).toBe(2);
    expect(festgeschriebenBis([f(2), f(3)], 2026)).toBe(0);
    expect(festgeschriebenBis([f(1, 2025)], 2026)).toBe(0);
    expect(festText(12, 2026)).toBe("Dezember 2026");
    expect(festText(0, 2026)).toBe("noch nichts");
  });
  it("Belegeingang, Bank, überfällige Posten; ohne Daten null", () => {
    const beleg = (status: FinBeleg["status"], faellig: string | null): FinBeleg => ({ id: faellig ?? status, lieferant_id: null, belegdatum: "2026-09-01", belegnummer: null, text: null,
      faellig_am: faellig, posten: [], datei_pfad: null, datei_typ: null, datei_name: null, status, brutto: 10, buchung_id: null, bezahlt_am: null, bezahlt_art: null, erstellt_am: "2026-09-01" });
    const s = financeStand({ belege: [beleg("entwurf", null), beleg("entwurf", null), beleg("gebucht", "2026-10-01"), beleg("gebucht", "2026-12-01")],
      bankStatus: [{ status: "offen" }, { status: "zugeordnet" }], rechnungenUeberfaellig: 3, fest: [{ jahr: 2026, monat: 1, am: "x" }], jahr: 2026, heute: "2026-10-30" });
    expect(s).toEqual({ belegeOffen: 2, bankOffen: 1, opUeberfaellig: 4, festBis: 1 });
    expect(navZahl("belege", s)).toBe(2);
    expect(navZahl("bank", s)).toBe(1);
    expect(navZahl("op", s)).toBe(4);
    expect(navZahl("buchungen", s)).toBeNull();
    const leer = financeStand({ jahr: 2026, heute: "2026-10-30" });
    expect(leer).toEqual({ belegeOffen: null, bankOffen: null, opUeberfaellig: null, festBis: null });
    expect(navZahl("belege", { ...leer, belegeOffen: 0 })).toBeNull();
  });
});

describe("Journal: Zeitraum, Partner, F4", () => {
  const z = (seite: "S" | "H", konto: number, betrag: number, personenkonto: number | null = null): FinZeile =>
    ({ posten: 1, seite, konto, betrag, ist_steuer: false, steuerschluessel: null, personenkonto });
  const b = (nr: number, datum: string, zeilen: FinZeile[]): FinBuchung => ({ id: `b${nr}`, jahr: 2027, nr, datum, text: `T${nr}`, beleg: null, quelle: "manuell",
    quelle_id: null, storno_von: null, storniert_durch: null, grund: null, erstellt_am: datum, fin_buchungszeilen: zeilen });
  const zeilen = journalZeilen([
    b(1, "2027-01-05", [z("S", 1400, 119, 10001), z("H", 8400, 119)]),
    b(2, "2027-03-31", [z("S", 4530, 50), z("H", 1200, 50)]),
    b(3, "2027-04-01", [z("S", 1400, 238, 10002), z("H", 8400, 238)]),
  ], []);
  const nrn = (f: Partial<typeof JOURNAL_FILTER_LEER>) => journalFiltern(zeilen, { ...JOURNAL_FILTER_LEER, ...f }).map((x) => x.nr);
  it("von–bis schließt beide Tage ein", () => {
    expect(nrn({ von: "2027-01-01", bis: "2027-03-31" })).toEqual([1, 2]);
    expect(nrn({ von: "2027-03-31" })).toEqual([2, 3]);
  });
  it("Partner: nur Buchungen mit diesem Personenkonto", () => {
    expect(nrn({ partner: 10002 })).toEqual([3]);
    expect(filterAnzahl({ ...JOURNAL_FILTER_LEER, partner: 10002, von: "2027-01-01", bis: "2027-03-31" })).toBe(2);
  });
  it("F4 ist der Beleg – auch im Eingabefeld", () => {
    expect(kurzbefehl({ key: "F4" }, true)).toBe("beleg");
    expect(kurzbefehl({ key: "F4", altKey: true }, false)).toBeNull();
    expect(FIN_KURZBEFEHLE.map((x) => x.taste)).toEqual(["F2", "F3", "F4", "N"]);
  });
});
