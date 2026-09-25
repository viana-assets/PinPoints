import { describe, expect, it } from "vitest";
import {
  csv, DATEV_SPALTEN, datevBuchungen, datevBuchungsstapel, datevEinstellungFehler, debitorenlisteCsv, debitorFuer,
  rechnungslisteCsv, windows1252, wirtschaftsjahrBeginn, type DatevEinstellung,
} from "@/lib/datev";
import type { Rechnung } from "@/lib/types";

const E: DatevEinstellung = {
  datev_berater: 1234567, datev_mandant: 12345, datev_wj_beginn_monat: 1, datev_sachkontenlaenge: 4, datev_skr: "03",
  datev_konto_19: 8400, datev_konto_7: 8300, datev_konto_0: 8200, datev_debitor_basis: 0, datev_sammeldebitor: 69999,
};
let n = 1781;
const r = (datum: string, positionen: { netto: number; steuersatz: number }[], extra: Partial<Rechnung> = {}): Rechnung => {
  const netto = positionen.reduce((a, p) => a + p.netto, 0);
  const steuer = Math.round(positionen.reduce((a, p) => a + p.netto * p.steuersatz / 100, 0) * 100) / 100;
  n++;
  return {
    id: "r" + n, nummer: n, nummer_text: "RE" + n, art: "rechnung", datum, lieferdatum: datum, netto, steuer, brutto: Math.round((netto + steuer) * 100) / 100,
    customer_id: "c1", order_id: null, kundennummer: 10023, storniert_durch: null, hebt_auf: null, storno_grund: null,
    empfaenger: { name: "Petra Müller", company: null, anrede: "Frau", address: "Weg 1\n90513 Zirndorf", email: null, kundennummer: 10023 },
    positionen: positionen.map((p) => ({ artikelnummer: 1, bezeichnung: "X", zusatz: null, menge: 1, einheit: "Stk", einzelpreis: p.netto, netto: p.netto, steuersatz: p.steuersatz })),
    ...extra,
  } as unknown as Rechnung;
};
const Z = { von: "2026-09-01", bis: "2026-09-25" };

describe("Einstellungen", () => {
  it("vollständig ohne Beanstandung", () => {
    expect(datevEinstellungFehler(E)).toEqual([]);
  });
  it("fehlende Nummern und falsche Konten werden genannt", () => {
    const f = datevEinstellungFehler({ ...E, datev_berater: null, datev_mandant: null, datev_konto_19: 84000, datev_sammeldebitor: 9999 });
    expect(f).toHaveLength(4);
    expect(f[0]).toMatch(/Beraternummer fehlt/);
  });
  it("Debitor = Kundennummer + Basis, ohne Nummer Sammeldebitor", () => {
    expect(debitorFuer(10023, E)).toBe(10023);
    expect(debitorFuer(23, { ...E, datev_debitor_basis: 10000 })).toBe(10023);
    expect(debitorFuer(null, E)).toBe(69999);
  });
  it("Wirtschaftsjahr", () => {
    expect(wirtschaftsjahrBeginn("2026-09-25", 1)).toBe("2026-01-01");
    expect(wirtschaftsjahrBeginn("2026-03-01", 7)).toBe("2025-07-01");
  });
});

describe("Buchungen", () => {
  it("eine Buchung je Steuersatz, Rest auf die letzte, Storno im Haben", () => {
    const a = r("2026-09-10", [{ netto: 100, steuersatz: 19 }, { netto: 10, steuersatz: 7 }]);
    const s = r("2026-09-20", [{ netto: -100, steuersatz: 19 }], { art: "storno", netto: -100, steuer: -19, brutto: -119 } as Partial<Rechnung>);
    const { buchungen, fehler } = datevBuchungen([s, a], E, Z);
    expect(fehler).toEqual([]);
    expect(buchungen.map((b) => [b.umsatz, b.sh, b.konto, b.gegenkonto, b.beleg])).toEqual([
      [119, "S", 10023, 8400, a.nummer_text], [10.7, "S", 10023, 8300, a.nummer_text], [119, "H", 10023, 8400, s.nummer_text],
    ]);
    expect(buchungen[2].text).toBe("Storno Petra Müller");
  });
  it("außerhalb des Zeitraums nicht, Debitor außerhalb des Bereichs als Fehler", () => {
    const alt = r("2026-08-31", [{ netto: 50, steuersatz: 19 }]);
    const komisch = r("2026-09-02", [{ netto: 50, steuersatz: 19 }], { kundennummer: 123 } as Partial<Rechnung>);
    const { buchungen, fehler } = datevBuchungen([alt, komisch], E, Z);
    expect(buchungen).toHaveLength(0);
    expect(fehler[0]).toMatch(/Debitor 123/);
  });
  it("unbekannter Steuersatz als Fehler", () => {
    expect(datevBuchungen([r("2026-09-02", [{ netto: 50, steuersatz: 16 }])], E, Z).fehler[0]).toMatch(/16 %/);
  });
});

describe("Buchungsstapel", () => {
  const a = r("2026-09-03", [{ netto: 100, steuersatz: 19 }]);
  const datei = datevBuchungsstapel([a], E, Z, "Rechnungen September 2026", new Date(2026, 8, 25, 14, 5, 9, 7));
  const zeilen = datei.inhalt.split("\r\n");
  it("Kopfzeile mit 31 Feldern und den Einstellungen", () => {
    const kopf = zeilen[0].split(";");
    expect(kopf).toHaveLength(31);
    expect(kopf.slice(0, 6)).toEqual(['"EXTF"', "700", "21", '"Buchungsstapel"', "13", "20260925140509007"]);
    expect(kopf.slice(10, 16)).toEqual(["1234567", "12345", "20260101", "4", "20260901", "20260925"]);
    expect(kopf[16]).toBe('"Rechnungen September 2026"');
    expect(kopf[20]).toBe("0"); // nicht festgeschrieben
    expect(kopf[26]).toBe('"03"');
  });
  it("125 Spalten, Buchung an der richtigen Stelle", () => {
    expect(DATEV_SPALTEN).toHaveLength(125);
    expect(zeilen[1].split(";")).toHaveLength(125);
    const b = zeilen[2].split(";");
    expect(b).toHaveLength(125);
    expect(b.slice(0, 3)).toEqual(["119,00", '"S"', '"EUR"']);
    expect(b[6]).toBe("10023");
    expect(b[7]).toBe("8400");
    expect(b[9]).toBe("0309");
    expect(b[10]).toBe(`"${a.nummer_text}"`);
    expect(b[13]).toBe('"Petra Müller"');
    expect(DATEV_SPALTEN[114]).toBe("Leistungsdatum");
    expect(b[114]).toBe("03092026");
    expect(datei.buchungen).toBe(1);
    expect(datei.fehler).toEqual([]);
    expect(datei.dateiname).toBe("EXTF_Buchungsstapel_2026-09-01_2026-09-25.csv");
  });
  it("über zwei Wirtschaftsjahre gesperrt", () => {
    expect(datevBuchungsstapel([a], E, { von: "2025-10-01", bis: "2026-09-25" }, "x", new Date()).fehler.join(" ")).toMatch(/zwei Wirtschaftsjahre/);
  });
  it("Windows-1252", () => {
    expect([...windows1252("Müß€„")]).toEqual([0x4d, 0xfc, 0xdf, 0x80, 0x84]);
    expect([...windows1252("✓")]).toEqual([0x3f]);
  });
});

describe("Tabellen", () => {
  it("CSV für Excel: BOM, Semikolon, Dezimalkomma, Anführungszeichen", () => {
    expect(csv([["a", 1.5, 2, null, 'x;"y"']])).toBe('﻿a;1,50;2;;"x;""y"""\r\n');
  });
  it("Rechnungsliste und Debitorenliste", () => {
    const a = r("2026-09-03", [{ netto: 100, steuersatz: 19 }]);
    const s = r("2026-09-04", [{ netto: -100, steuersatz: 19 }], { art: "storno", hebt_auf: a.id, storno_grund: "Tippfehler", netto: -100, steuer: -19, brutto: -119 } as Partial<Rechnung>);
    const liste = rechnungslisteCsv([a, s], Z).split("\r\n");
    expect(liste[1]).toBe(`${a.nummer_text};Rechnung;2026-09-03;2026-09-03;10023;Petra Müller;100;19;119;;`);
    expect(liste[2]).toBe(`${s.nummer_text};Storno;2026-09-04;2026-09-04;10023;Petra Müller;-100;-19;-119;${a.nummer_text};Tippfehler`);
    const deb = debitorenlisteCsv([a, s], E, Z).split("\r\n");
    expect(deb[1]).toBe("10023;10023;Petra Müller;;Weg 1, 90513 Zirndorf;");
    expect(deb).toHaveLength(3);
  });
});

describe("Testrechnungen (Migration 60)", () => {
  it("gehen weder in den Buchungsstapel noch in die Listen", () => {
    const echt = r("2026-09-03", [{ netto: 100, steuersatz: 19 }]);
    const test = r("2026-09-04", [{ netto: 50, steuersatz: 19 }], { nummer: -1, nummer_text: "T-RE1", kundennummer: null });
    expect(datevBuchungen([echt, test], E, Z).buchungen).toHaveLength(1);
    expect(rechnungslisteCsv([echt, test], Z)).not.toContain("T-RE1");
    expect(debitorenlisteCsv([test], E, Z)).not.toContain("Petra");
    expect(debitorenlisteCsv([echt, test], E, Z)).toContain("Petra");
  });
});
