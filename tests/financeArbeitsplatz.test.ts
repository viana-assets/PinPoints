import { describe, expect, it } from "vitest";
import {
  BUCHUNG_QUELLE_TEXT, JOURNAL_FILTER_LEER, betragText, csvZelle, datumDe, filterAnzahl, journalFiltern, journalZeilen,
  kontoAusEingabe, kontoVorschlaege, kurzbefehl, naechsteSortierung, saldoText, saldoVorNach, sortiere, tabellenCsv, tastenZiel,
} from "@/lib/finance/arbeitsplatz";
import type { FinBuchung, FinKonto, FinZeile } from "@/lib/finance/buchung";
import { FIN_NAV_UNTEN_GRUPPE, FINANCE_SEITEN, financeNavAufbau } from "@/lib/finance/seiten";
import { navZuSpeicher } from "@/lib/navGruppen";

// Finance-Arbeitsplatz am Rechner (v178, Stufe A): die Regeln der Bausteine ohne React.
const k = (nummer: number, bezeichnung: string, aktiv = true): FinKonto =>
  ({ kontenrahmen: "skr03", nummer, bezeichnung, kategorie: "aufwand", eigen: false, aktiv });
const KONTEN = [
  k(1200, "Bank"), k(1576, "Abziehbare Vorsteuer 19 %"), k(4530, "Laufende Kfz-Betriebskosten"), k(4540, "Kfz-Reparaturen"),
  k(4570, "Mietleasing Kfz"), k(8400, "Erlöse 19 %"), k(4500, "Fahrzeugkosten", false), k(10001, "Muster Logistik GmbH"),
];
const z = (posten: number, seite: "S" | "H", konto: number, betrag: number, ist_steuer = false, steuerschluessel: string | null = null): FinZeile =>
  ({ posten, seite, konto, betrag, ist_steuer, steuerschluessel });
const b = (nr: number, datum: string, zeilen: FinZeile[], extra: Partial<FinBuchung> = {}): FinBuchung => ({
  id: `b${nr}`, jahr: 2027, nr, datum, text: `Buchung ${nr}`, beleg: `BE-${nr}`, quelle: "manuell", quelle_id: null, storno_von: null,
  storniert_durch: null, grund: null, erstellt_am: datum, fin_buchungszeilen: zeilen, ...extra,
});
const TANKEN = b(1, "2027-01-08", [z(1, "S", 4530, 65.88, false, "vst19"), z(1, "S", 1576, 12.52, true, "vst19"), z(1, "H", 1200, 78.4, false, "vst19")]);
const ERLOES = b(2, "2027-01-10", [z(1, "S", 10001, 1190), z(1, "H", 8400, 1190)]);
const SPLITT = b(3, "2027-02-03", [z(1, "S", 4530, 20), z(1, "H", 1200, 20), z(2, "S", 4540, 30), z(2, "H", 1200, 30)]);
const STORNIERT = b(4, "2027-02-05", [z(1, "S", 4570, 476), z(1, "H", 1200, 476)], { storniert_durch: "b5" });
const STORNO = b(5, "2027-02-06", [z(1, "S", 1200, 476), z(1, "H", 4570, 476)], { storno_von: "b4", grund: "doppelt" });
const ALLE = [TANKEN, ERLOES, SPLITT, STORNIERT, STORNO];

describe("Sortieren", () => {
  it("Zahlen und Texte, stabil, leere Werte immer unten", () => {
    const zeilen = [{ w: "B 10" }, { w: null }, { w: "a 2" }, { w: "B 9" }, { w: "" }];
    expect(sortiere(zeilen, (x) => x.w, "auf").map((x) => x.w)).toEqual(["a 2", "B 9", "B 10", null, ""]);
    expect(sortiere(zeilen, (x) => x.w, "ab").map((x) => x.w)).toEqual(["B 10", "B 9", "a 2", null, ""]);
    const gleich = [{ w: 1, n: "x" }, { w: 1, n: "y" }, { w: 0, n: "z" }];
    expect(sortiere(gleich, (x) => x.w, "ab").map((x) => x.n)).toEqual(["x", "y", "z"]);
  });
  it("Spaltenkopf: auf → ab → aus; andere Spalte beginnt aufsteigend", () => {
    expect(naechsteSortierung(null, "datum")).toEqual({ spalte: "datum", richtung: "auf" });
    expect(naechsteSortierung({ spalte: "datum", richtung: "auf" }, "datum")).toEqual({ spalte: "datum", richtung: "ab" });
    expect(naechsteSortierung({ spalte: "datum", richtung: "ab" }, "datum")).toBeNull();
    expect(naechsteSortierung({ spalte: "datum", richtung: "ab" }, "betrag")).toEqual({ spalte: "betrag", richtung: "auf" });
  });
});

describe("Tastatur", () => {
  it("wandert in der Liste und bleibt an den Enden stehen", () => {
    expect(tastenZiel("ArrowDown", -1, 5)).toBe(0);
    expect(tastenZiel("ArrowUp", -1, 5)).toBe(0);
    expect(tastenZiel("ArrowDown", 4, 5)).toBe(4);
    expect(tastenZiel("ArrowUp", 0, 5)).toBe(0);
    expect(tastenZiel("PageDown", 2, 30)).toBe(12);
    expect(tastenZiel("PageUp", 3, 30)).toBe(0);
    expect(tastenZiel("End", 0, 30)).toBe(29);
    expect(tastenZiel("Home", 9, 30)).toBe(0);
    expect(tastenZiel("x", 1, 5)).toBeNull();
    expect(tastenZiel("ArrowDown", 0, 0)).toBeNull();
  });
  it("Kurzbefehle: F2/F3 überall, N nur außerhalb von Feldern, nie mit Strg/Alt", () => {
    expect(kurzbefehl({ key: "F2" }, true)).toBe("suche");
    expect(kurzbefehl({ key: "F3" }, false)).toBe("konto");
    expect(kurzbefehl({ key: "n" }, false)).toBe("neu");
    expect(kurzbefehl({ key: "N" }, false)).toBe("neu");
    expect(kurzbefehl({ key: "n" }, true)).toBeNull();
    expect(kurzbefehl({ key: "n", ctrlKey: true }, false)).toBeNull();
    expect(kurzbefehl({ key: "F2", altKey: true }, false)).toBeNull();
  });
});

describe("Konto aus Nummer oder Name", () => {
  it("Ziffern: Nummern, die so beginnen; ausgeblendete nie", () => {
    expect(kontoVorschlaege(KONTEN, "45").map((x) => x.nummer)).toEqual([4530, 4540, 4570]);
    expect(kontoVorschlaege(KONTEN, "4530").map((x) => x.nummer)).toEqual([4530]);
    expect(kontoVorschlaege(KONTEN, "").length).toBe(0);
  });
  it("Text: Anfang der Bezeichnung vor Wortanfang vor irgendwo", () => {
    expect(kontoVorschlaege(KONTEN, "kfz").map((x) => x.nummer)).toEqual([4540, 4530, 4570]);
    expect(kontoVorschlaege(KONTEN, "vorsteuer").map((x) => x.nummer)).toEqual([1576]);
    expect(kontoVorschlaege(KONTEN, "leas").map((x) => x.nummer)).toEqual([4570]);
    expect(kontoVorschlaege(KONTEN, "zzz")).toEqual([]);
  });
  it("eindeutig: genaue Nummer oder einziger Treffer, sonst nichts", () => {
    expect(kontoAusEingabe(KONTEN, "1200")).toBe(1200);
    expect(kontoAusEingabe(KONTEN, " bank ")).toBe(1200);
    expect(kontoAusEingabe(KONTEN, "kfz")).toBeNull();
    expect(kontoAusEingabe(KONTEN, "4500")).toBeNull();
    expect(kontoAusEingabe(KONTEN, "")).toBeNull();
  });
});

describe("Beträge und CSV", () => {
  it("Betrag und Saldo mit Seite", () => {
    expect(betragText(1234.5)).toBe("1.234,50");
    expect(saldoText(1248.3)).toBe("1.248,30 S");
    expect(saldoText(-57)).toBe("57,00 H");
    expect(saldoText(0.001)).toBe("0,00");
  });
  it("CSV für Excel: Semikolon, Komma, Anführungszeichen, keine Formeln, BOM", () => {
    expect(csvZelle(1234.5)).toBe("1234,5");
    expect(csvZelle(-3)).toBe("-3");
    expect(csvZelle('Reifen "Winter"; 4 Stück')).toBe('"Reifen ""Winter""; 4 Stück"');
    expect(csvZelle("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvZelle("-Storno")).toBe("'-Storno");
    expect(csvZelle(null)).toBe("");
    const t = tabellenCsv(["Nr.", "Text"], [[1, "a"], [2, null]]);
    expect(t.startsWith("﻿Nr.;Text\r\n1;a\r\n2;\r\n")).toBe(true);
  });
  it("Datum und Quelle in Worten", () => {
    expect(datumDe("2027-01-08")).toBe("08.01.2027");
    expect(BUCHUNG_QUELLE_TEXT.beleg).toBe("aus dem Belegeingang");
  });
});

describe("Journal als Tabelle", () => {
  const fest = [{ jahr: 2027, monat: 1, am: "2027-02-10" }];
  const zeilen = journalZeilen(ALLE, fest);
  const von = (nr: number) => zeilen.find((x) => x.nr === nr)!;

  it("Konto, Gegenkonto ohne Steuerzeile, Steuer, Splitt, Betrag", () => {
    expect(von(1)).toMatchObject({ konto: 4530, gegenkonto: 1200, steuer: "vst19", splitt: false, betrag: 78.4 });
    expect(von(3)).toMatchObject({ konto: 4530, gegenkonto: 1200, splitt: true, betrag: 50 });
  });
  it("Zustand: storniert und Storno vor festgeschrieben", () => {
    expect(von(1).zustand).toBe("festgeschrieben");
    expect(von(3).zustand).toBe("gebucht");
    expect(von(4).zustand).toBe("storniert");
    expect(von(5).zustand).toBe("storno");
    expect(journalZeilen([{ ...TANKEN, storniert_durch: "x" }], fest)[0].zustand).toBe("storniert");
  });
  it("Filter: Monat, Konto auch als Steuerkonto, Zustand, Betrag, Suche mit Betrag in beiden Schreibweisen", () => {
    const nrn = (f: Partial<typeof JOURNAL_FILTER_LEER>) => journalFiltern(zeilen, { ...JOURNAL_FILTER_LEER, ...f }).map((x) => x.nr);
    expect(nrn({})).toEqual([1, 2, 3, 4, 5]);
    expect(nrn({ monat: 2 })).toEqual([3, 4, 5]);
    expect(nrn({ konto: 1576 })).toEqual([1]);
    expect(nrn({ konto: 4540 })).toEqual([3]);
    expect(nrn({ zustand: "storno" })).toEqual([5]);
    expect(nrn({ betragVon: 50, betragBis: 500 })).toEqual([1, 3, 4, 5]);
    expect(nrn({ betragVon: 100 })).toEqual([2, 4, 5]);
    expect(nrn({ text: "1.190,00" })).toEqual([2]);
    expect(nrn({ text: "78,4" })).toEqual([1]);
    expect(nrn({ text: "be-3" })).toEqual([3]);
    expect(nrn({ text: "4570" })).toEqual([4, 5]);
    expect(filterAnzahl(JOURNAL_FILTER_LEER)).toBe(0);
    expect(filterAnzahl({ ...JOURNAL_FILTER_LEER, monat: 1, betragBis: 3, text: " x " })).toBe(3);
  });
  it("Saldo des Kontos vor und nach der Buchung (Datum, dann Nr.)", () => {
    expect(saldoVorNach(ALLE, 1200, TANKEN)).toEqual({ vor: 0, nach: -78.4 });
    expect(saldoVorNach(ALLE, 1200, SPLITT)).toEqual({ vor: -78.4, nach: -128.4 });
    expect(saldoVorNach(ALLE, 4570, STORNO)).toEqual({ vor: 476, nach: 0 });
    const gleicherTag = b(6, "2027-02-06", [z(1, "S", 4570, 10), z(1, "H", 1200, 10)]);
    expect(saldoVorNach([...ALLE, gleicherTag], 4570, gleicherTag)).toEqual({ vor: 0, nach: 10 });
  });
});

describe("Finance-Seitenleiste am Rechner", () => {
  it("Hauptseiten oben, Bereiche wie am Handy, System unten; leere Bereiche fallen weg", () => {
    const a = financeNavAufbau(FINANCE_SEITEN);
    expect(a.haupt.map((s) => s.key)).toEqual(["uebersicht", "rechnungen", "belege", "bank"]);
    expect(a.gruppen.map((g) => g.titel)).toEqual(["Zahlungen", "Buchführung", "Steuern und Auswertungen", "Jahresende und Kanzlei"]);
    expect(a.unten?.titel).toBe(FIN_NAV_UNTEN_GRUPPE);
    expect(a.unten?.seiten.map((s) => s.key)).toEqual(["einstellungen"]);
    const wenig = financeNavAufbau(FINANCE_SEITEN.filter((s) => ["uebersicht", "buchungen"].includes(s.key)));
    expect(wenig.gruppen.map((g) => g.titel)).toEqual(["Buchführung"]);
    expect(wenig.unten).toBeNull();
  });
  it("jeder Merker für sich", () => {
    const a = navZuSpeicher("test-a"), c = navZuSpeicher("test-c");
    a.merken(new Set(["System"]));
    expect(a.roh()).toBe('["System"]');
    expect(c.roh()).toBe("");
    expect(a.server()).toBe("");
  });
});
