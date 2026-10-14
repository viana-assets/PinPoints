import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_DATEV_AUTOMATIK, FIN_DATEV_BU, crc32, datevSaetze, exportGeaendert, exportZeitraeume, finDatevFehler, finDatevStapel, gobdDateien,
  protokolleLesen, verfahrensdokumentation, zipDateien,
} from "@/lib/finance/export";
import type { FinBuchung, FinKonto, FinSteuerschluessel, FinZeile } from "@/lib/finance/buchung";
import { finVorgabe } from "@/lib/finance/einstellungen";

// Finance F9 (Migration 97, v155). Konten und Schlüssel aus den Migrationen; die Buchungen so, wie
// fin_posten_schreiben() (Migration 88) und die Rechnungsbuchung (Migration 89) sie schreiben.
const SQL = ["88_finance_buchungen.sql", "93_finance_luecken.sql", "95_finance_anlagen.sql", "96_finance_abschluss.sql"]
  .map((d) => readFileSync(join(__dirname, "..", "supabase", "migrations", d), "utf8")).join("\n");
const KONTEN = [...SQL.matchAll(/\('(skr0[34])', (\d+), '((?:[^']|'')*)', '(\w+)'\)/g)].map((m) => ({ kontenrahmen: m[1], nummer: Number(m[2]), bezeichnung: m[3], kategorie: m[4], eigen: false, aktiv: true })) as FinKonto[];
const K03 = KONTEN.filter((k) => k.kontenrahmen === "skr03");
const SCHL = [...SQL.matchAll(/\('(skr03)', '(\w+)', '((?:[^']|'')*)', ([\d.]+), '(\w+)', (\w+), (\w+)\)/g)]
  .map((m) => ({ kontenrahmen: m[1], schluessel: m[2], bezeichnung: m[3], satz: Number(m[4]), art: m[5], ust_konto: m[6] === "null" ? null : Number(m[6]), vst_konto: m[7] === "null" ? null : Number(m[7]) })) as FinSteuerschluessel[];
const ctx = { kat: new Map(K03.map((k) => [k.nummer, k.kategorie])), schl: new Map(SCHL.map((s) => [s.schluessel, s])), rahmen: "skr03" as const };

let id = 0;
const z = (posten: number, seite: "S" | "H", konto: number, betrag: number, steuerschluessel: string | null = null, ist_steuer = false): FinZeile => ({ id: ++id, posten, seite, konto, betrag, steuerschluessel, ist_steuer });
const b = (nr: number, datum: string, text: string, zeilen: FinZeile[], beleg: string | null = null, quelle: FinBuchung["quelle"] = "manuell"): FinBuchung => ({
  id: `b${nr}`, jahr: 2026, nr, datum, text, beleg, quelle, quelle_id: null, storno_von: null, storniert_durch: null, grund: null, erstellt_am: "2026-09-01T10:00:00Z", fin_buchungszeilen: zeilen,
});
const kurz = (x: ReturnType<typeof datevSaetze>) => x.saetze.map((s) => `${s.umsatz} ${s.sh} ${s.konto}/${s.gegenkonto}${s.bu ? ` BU${s.bu}` : ""}`);

describe("Finance-Buchung → DATEV-Sätze (brutto, Steuer über Automatik oder BU)", () => {
  it("Rechnung von Hand: 1400 an 8400 brutto, Automatikkonto ohne BU", () => {
    expect(kurz(datevSaetze(b(1, "2026-09-01", "Rechnung", [z(1, "S", 1400, 119, "ust19"), z(1, "H", 8400, 100, "ust19"), z(1, "H", 1776, 19, "ust19", true)]), ctx))).toEqual(["119 S 1400/8400"]);
  });
  it("Tanken bar mit zwei Posten: Kraftstoff mit BU 9, Betriebsbedarf ohne Steuer", () => {
    const x = datevSaetze(b(2, "2026-09-02", "Tanken", [
      z(1, "S", 4530, 50, "vst19"), z(1, "H", 1000, 59.5, "vst19"), z(1, "S", 1576, 9.5, "vst19", true), z(2, "S", 4980, 10), z(2, "H", 1000, 10),
    ]), ctx);
    expect(kurz(x)).toEqual(["59.5 H 1000/4530 BU9", "10 H 1000/4980"]);
    expect(x.hinweise).toEqual([]);
  });
  it("Rechnung aus FSM (eine Forderung, zwei Steuersätze): ein Satz je Erlöskonto", () => {
    expect(kurz(datevSaetze(b(3, "2026-09-03", "Rechnung RE-2026-0042", [
      z(0, "S", 1400, 140.4), z(1, "H", 8400, 100, "ust19"), z(1, "H", 1776, 19, "ust19", true), z(2, "H", 8300, 20, "ust7"), z(2, "H", 1771, 1.4, "ust7", true),
    ], "RE-2026-0042", "rechnung"), ctx))).toEqual(["119 S 1400/8400", "21.4 S 1400/8300"]);
  });
  it("§ 13b und ig. Erwerb: netto, beide Steuern aus der Automatik bzw. BU 94", () => {
    expect(kurz(datevSaetze(b(4, "2026-09-04", "Software-Abo EU", [z(1, "S", 3123, 100, "r13b19"), z(1, "H", 1200, 100, "r13b19"), z(1, "H", 1787, 19, "r13b19", true), z(1, "S", 1577, 19, "r13b19", true)]), ctx)))
      .toEqual(["100 H 1200/3123"]);
    expect(kurz(datevSaetze(b(5, "2026-09-05", "Wartung EU", [z(1, "S", 4806, 100, "r13b19"), z(1, "H", 1200, 100, "r13b19"), z(1, "H", 1787, 19, "r13b19", true), z(1, "S", 1577, 19, "r13b19", true)]), ctx)))
      .toEqual(["100 H 1200/4806 BU94"]);
  });
  it("Abgrenzung auf einem Automatikkonto ohne Steuer: BU 40", () => {
    expect(kurz(datevSaetze(b(6, "2025-12-31", "Passive Abgrenzung", [z(1, "S", 8400, 100), z(1, "H", 990, 100)], null, "abschluss"), ctx))).toEqual(["100 H 990/8400 BU40"]);
  });
  it("Steuer weicht von der DATEV-Rechnung ab: netto mit BU 40, Steuer als eigener Satz, Hinweis", () => {
    const x = datevSaetze(b(7, "2026-09-07", "Krumm", [z(1, "S", 1400, 119.01, "ust19"), z(1, "H", 8400, 100, "ust19"), z(1, "H", 1776, 19.01, "ust19", true)]), ctx);
    expect(kurz(x)).toEqual(["100 S 1400/8400 BU40", "19.01 S 1400/1776"]);
    expect(x.hinweise[0]).toMatch(/Nr\. 7 .*ohne Automatik/);
  });
  it("Storno: vertauschte Seiten", () => {
    expect(kurz(datevSaetze(b(8, "2026-09-08", "Storno", [z(1, "H", 1400, 119, "ust19"), z(1, "S", 8400, 100, "ust19"), z(1, "S", 1776, 19, "ust19", true)]), ctx))).toEqual(["119 H 1400/8400"]);
  });
  it("jeder Steuerschlüssel mit Steuer hat einen BU-Schlüssel; Automatikkonten gibt es im Kontenplan", () => {
    for (const s of SCHL.filter((x) => x.art !== "ohne")) expect(FIN_DATEV_BU[s.schluessel], s.schluessel).toBeTruthy();
    for (const r of ["skr03", "skr04"] as const) {
      for (const [k, s] of Object.entries(FIN_DATEV_AUTOMATIK[r])) {
        expect(KONTEN.some((x) => x.kontenrahmen === r && x.nummer === Number(k)), `${r} ${k}`).toBe(true);
        expect(SCHL.some((x) => x.schluessel === s), s).toBe(true);
      }
    }
  });
});

describe("Buchungsstapel", () => {
  const betrieb = { datev_berater: 1234567, datev_mandant: 10001, datev_sachkontenlaenge: 4, datev_skr: "03" as const };
  const liste = [
    b(1, "2026-01-01", "Saldenvorträge aus 2025", [z(1, "S", 1200, 5000), z(1, "H", 9000, 5000)], null, "vortrag"),
    b(2, "2026-09-01", "Rechnung", [z(1, "S", 1400, 119, "ust19"), z(1, "H", 8400, 100, "ust19"), z(1, "H", 1776, 19, "ust19", true)], "RE 2026/0042"),
    b(3, "2026-10-01", "Oktober", [z(1, "S", 1200, 238, "ust19"), z(1, "H", 8400, 200, "ust19"), z(1, "H", 1776, 38, "ust19", true)]),
  ];
  it("Kopf, Spalten, ein Satz je Buchung im Zeitraum, Saldenvorträge auf Wunsch weg", () => {
    const d = finDatevStapel(liste, K03, SCHL, { rahmen: "skr03", betrieb, von: "2026-01-01", bis: "2026-09-30", ohneVortrag: true, erzeugtAm: new Date(2026, 9, 14, 10, 0, 0) });
    expect(d.fehler).toEqual([]);
    expect([d.buchungen, d.saetze]).toEqual([1, 1]);
    const [kopf, spalten, satz] = d.inhalt.split("\r\n");
    expect(kopf).toMatch(/^"EXTF";700;21;"Buchungsstapel";13;20261014100000000;;"FI";"";"";1234567;10001;20260101;4;20260101;20260930;"Finance 2026-01–2026-09";"";1;0;0;"EUR";;"";;;"03";;;"";""$/);
    expect(spalten.split(";")).toHaveLength(125);
    const f = satz.split(";");
    expect(f.length).toBe(125);
    expect([f[0], f[1], f[6], f[7], f[8], f[9], f[10], f[13]]).toEqual(["119,00", '"S"', "1400", "8400", "", "0109", '"RE2026/0042"', '"Rechnung"']);
    expect(f).toContain('"Finance-Nr"');
    expect(f).toContain('"2026-2"');
    expect(d.dateiname).toBe("EXTF_Finance_2026-01-01_2026-09-30.csv");
    const mit = finDatevStapel(liste, K03, SCHL, { rahmen: "skr03", betrieb, von: "2026-01-01", bis: "2026-12-31", ohneVortrag: false, erzeugtAm: new Date() });
    expect([mit.buchungen, mit.saetze]).toEqual([3, 3]);
  });
  it("fehlende DATEV-Angaben am Betrieb", () => {
    expect(finDatevFehler({ datev_berater: null, datev_mandant: 0, datev_sachkontenlaenge: 5 })).toHaveLength(3);
    expect(finDatevFehler(null)).toHaveLength(1);
    const d = finDatevStapel(liste, K03, SCHL, { rahmen: "skr03", betrieb: { ...betrieb, datev_skr: "04" }, von: "2026-01-01", bis: "2026-12-31", ohneVortrag: true, erzeugtAm: new Date() });
    expect(d.hinweise[0]).toMatch(/SKR04, Finance bucht im SKR03/);
  });
});

describe("Zeiträume und Protokoll", () => {
  it("Jahr, Quartale, Monate", () => {
    const z = exportZeitraeume(2026);
    expect(z).toHaveLength(17);
    expect(z[0]).toMatchObject({ von: "2026-01-01", bis: "2026-12-31" });
    expect(z.find((x) => x.key === "q1")).toMatchObject({ von: "2026-01-01", bis: "2026-03-31" });
    expect(z.find((x) => x.key === "m2")).toMatchObject({ von: "2026-02-01", bis: "2026-02-28" });
  });
  it("seitdem geändert", () => {
    const p = protokolleLesen([{ id: "1", art: "datev", von: "2026-09-01", bis: "2026-09-30", buchungen: 3, summe: "783.50", letzte_nr: 3, erstellt_am: "x", jetzt: { buchungen: 4, summe: 788.5, letzte_nr: 5 } }]);
    expect(exportGeaendert(p[0])).toBe(true);
    expect(exportGeaendert({ ...p[0], jetzt: { buchungen: 3, summe: 783.5, letzte_nr: 3 } })).toBe(false);
  });
});

describe("GoBD-Datenexport, ZIP, Verfahrensdokumentation", () => {
  const buchungen = [b(1, "2026-09-01", "Rechnung „Müller“", [z(1, "S", 1400, 119, "ust19"), z(1, "H", 8400, 100, "ust19"), z(1, "H", 1776, 19, "ust19", true)], "RE-1")];
  const belege = [{ belegdatum: "2026-09-03", belegnummer: "ER-1", lieferant: "Großhandel", text: null, brutto: 595, status: "gebucht", buchung_nr: 3, bezahlt_am: null, datei_name: "er1.pdf" }];
  it("index.xml und fünf Tabellen", () => {
    const d = gobdDateien(buchungen, K03, SCHL, belege, { firma: "Beispiel & Co", ort: "Musterstadt", von: "2026-01-01", bis: "2026-12-31", erzeugtAm: new Date(2026, 9, 14) });
    expect(d.map((x) => x.name)).toEqual(["index.xml", "buchungen.csv", "buchungszeilen.csv", "konten.csv", "steuerschluessel.csv", "belege.csv", "LIESMICH.txt"]);
    const index = new TextDecoder().decode(d[0].daten);
    expect(index).toMatch(/<!DOCTYPE DataSet SYSTEM "gdpdu-01-09-2004.dtd">/);
    expect(index).toMatch(/<Name>Beispiel &amp; Co<\/Name>/);
    expect((index.match(/<Table>/g) ?? []).length).toBe(5);
    expect(index).toMatch(/<References>Buchungen<\/References>/);
    // Windows-1252: „ und ü als je ein Byte
    const buch = d[1].daten;
    expect(buch[0]).toBe("B".charCodeAt(0));
    expect([...buch]).toContain(0x84);
    expect([...buch]).toContain(0xfc);
    const zeilen = new TextDecoder("windows-1252").decode(d[2].daten).trim().split("\r\n");
    expect(zeilen).toHaveLength(4);
    expect(zeilen[1]).toBe("2026-1-1;2026-1;1;S;1400;119;ust19;nein");
  });
  it("ZIP: Prüfsumme und Aufbau", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
    const zip = zipDateien([{ name: "a.txt", daten: new TextEncoder().encode("hallo") }, { name: "b.txt", daten: new Uint8Array([1, 2, 3]) }], new Date(2026, 9, 14, 12, 30, 10));
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(zip.length - 22 + 10, true)).toBe(2);
    expect(new TextDecoder().decode(zip.slice(30 + 5, 30 + 10))).toBe("hallo");
  });
  it("Verfahrensdokumentation mit den Einstellungen", () => {
    const html = verfahrensdokumentation({ firma: "Reifen <Test>", inhaber: "", strasse: "", plz: "", ort: "" }, { ...finVorgabe(2026, "2026-01-01"), gewinnermittlung: "bilanz" }, "14.10.2026");
    expect(html).toMatch(/Reifen &lt;Test&gt;/);
    expect(html).toMatch(/Bilanzierung/);
    expect(html).toMatch(/acht Jahre/);
  });
});
