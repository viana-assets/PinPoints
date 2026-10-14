// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FIN_BANK_MAX_UMSAETZE, camtLesen, csvLesen, dateiText, ibanSauber, kassenbuch, kontoAusFrueheren, kontoSaldoBis, kontoauszugLesen,
  vorschlaege, type FinBankumsatz,
} from "@/lib/finance/bank";
import type { FinBuchung } from "@/lib/finance/buchung";
import type { FinRechnungZeile } from "@/lib/finance/rechnungen";
import type { FinBeleg, FinLieferant } from "@/lib/finance/belege";

// Finance F4 (Migration 91, v149). Beispieldaten sind erfunden (IBAN: das bekannte Muster aus der Norm).
const MIG = readFileSync(join(__dirname, "..", "supabase", "migrations", "91_finance_bank.sql"), "utf8");
const IBAN = "DE89370400440532013000";

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
 <BkToCstmrStmt><GrpHdr><MsgId>1</MsgId></GrpHdr>
  <Stmt>
   <Acct><Id><IBAN>${IBAN}</IBAN></Id></Acct>
   <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-01</Dt></Dt></Bal>
   <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">1234.56</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-12</Dt></Dt></Bal>
   <Ntry><Amt Ccy="EUR">119.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
    <BookgDt><Dt>2026-10-05</Dt></BookgDt><ValDt><Dt>2026-10-06</Dt></ValDt><AcctSvcrRef>A1</AcctSvcrRef>
    <NtryDtls><TxDtls><Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs>
     <RltdPties><Dbtr><Pty><Nm>Muster GmbH</Nm></Pty></Dbtr><DbtrAcct><Id><IBAN>DE02 1203 0000 0000 2020 51</IBAN></Id></DbtrAcct></RltdPties>
     <RmtInf><Ustrd>Rechnung RE-2026-0042</Ustrd><Ustrd>Danke</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
   <Ntry><Amt Ccy="EUR">80.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts><BookgDt><DtTm>2026-10-07T10:00:00</DtTm></BookgDt>
    <NtryDtls>
     <TxDtls><Amt Ccy="EUR">30.00</Amt><RltdPties><Cdtr><Nm>Reifen Nord</Nm></Cdtr></RltdPties><RmtInf><Ustrd>Beleg 77</Ustrd></RmtInf></TxDtls>
     <TxDtls><Amt Ccy="EUR">50.00</Amt><RltdPties><Cdtr><Nm>Werkstatt Süd</Nm></Cdtr></RltdPties></TxDtls>
    </NtryDtls></Ntry>
   <Ntry><Amt Ccy="EUR">9.99</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>PDNG</Cd></Sts><BookgDt><Dt>2026-10-12</Dt></BookgDt></Ntry>
  </Stmt>
 </BkToCstmrStmt>
</Document>`;

describe("CAMT.053", () => {
  const a = camtLesen(CAMT)!;
  it("liest Konto, Endsaldo und nur gebuchte Umsätze", () => {
    expect(a.format).toBe("camt");
    expect(a.iban).toBe(IBAN);
    expect(a.endsaldo).toBe(1234.56);
    expect(a.endsaldoAm).toBe("2026-10-12");
    expect(a.uebersprungen).toBe(1);
    expect(a.umsaetze).toHaveLength(3);
  });
  it("Eingang mit Name, IBAN, Zweck, Wertstellung, Referenz", () => {
    expect(a.umsaetze[0]).toEqual({
      datum: "2026-10-05", valuta: "2026-10-06", betrag: 119, zweck: "Rechnung RE-2026-0042 Danke", name: "Muster GmbH",
      iban: "DE02120300000000202051", referenz: "A1",
    });
  });
  it("Sammelbuchung wird in Einzelumsätze geteilt, mit Vorzeichen", () => {
    expect(a.umsaetze.slice(1).map((u) => [u.datum, u.betrag, u.name])).toEqual([["2026-10-07", -30, "Reifen Nord"], ["2026-10-07", -50, "Werkstatt Süd"]]);
  });
  it("kein CAMT: null", () => {
    expect(camtLesen("<Invoice/>")).toBeNull();
    expect(camtLesen("<kaputt")).toBeNull();
  });
});

describe("CSV", () => {
  const SPK = [
    `"Umsätze Girokonto";"${IBAN}"`,
    "",
    '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"Betrag";"Waehrung"',
    `"${IBAN}";"05.10.26";"06.10.26";"GUTSCHRIFT";"RE-2026-0042";"Muster GmbH";"DE02120300000000202051";"1.190,00";"EUR"`,
    `"${IBAN}";"07.10.2026";"07.10.2026";"LASTSCHRIFT";"Miete ""Oktober""";"Vermieter";"";"-850,00";"EUR"`,
    `"${IBAN}";"";"";"";"Summe";"";"";"";""`,
  ].join("\r\n");

  it("Sparkasse-Art: Semikolon, Vorspann, deutsche Zahlen und Daten", () => {
    const a = csvLesen(SPK)!;
    expect(a.format).toBe("csv");
    expect(a.iban).toBe(IBAN);
    expect(a.uebersprungen).toBe(1);
    expect(a.umsaetze).toEqual([
      { datum: "2026-10-05", valuta: "2026-10-06", betrag: 1190, zweck: "RE-2026-0042", name: "Muster GmbH", iban: "DE02120300000000202051", referenz: null },
      { datum: "2026-10-07", valuta: "2026-10-07", betrag: -850, zweck: 'Miete "Oktober"', name: "Vermieter", iban: null, referenz: null },
    ]);
  });

  it("getrennte Soll- und Haben-Spalten, Komma als Trenner, ISO-Datum", () => {
    const a = csvLesen("Datum,Name,Zweck,Soll,Haben\n2026-10-01,Tankstelle,Diesel,45.10,\n2026-10-02,Muster GmbH,RE-1,,119.00\n")!;
    expect(a.umsaetze.map((u) => [u.datum, u.betrag, u.name])).toEqual([["2026-10-01", -45.1, "Tankstelle"], ["2026-10-02", 119, "Muster GmbH"]]);
  });

  it("Windows-1252 wird erkannt", () => {
    const bytes = new Uint8Array([0x42, 0x65, 0x67, 0xfc, 0x6e, 0x73, 0x74, 0x69, 0x67, 0x74, 0x65, 0x72]); // „Begünstigter“
    expect(dateiText(bytes.buffer)).toBe("Begünstigter");
    expect(dateiText(new TextEncoder().encode("Begünstigter").buffer as ArrayBuffer)).toBe("Begünstigter");
  });

  it("ohne Kopfzeile: null; kontoauszugLesen wählt das Format", () => {
    expect(csvLesen("a;b\n1;2\n")).toBeNull();
    expect(kontoauszugLesen("  " + CAMT)?.format).toBe("camt");
    expect(kontoauszugLesen(SPK)?.format).toBe("csv");
  });
});

describe("IBAN und Datenbank", () => {
  it("ibanSauber wie die Prüfung in Migration 91", () => {
    expect(ibanSauber("de89 3704 0044 0532 0130 00")).toBe(IBAN);
    expect(ibanSauber("DE89")).toBeNull();
    expect(MIG).toContain("^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$");
    expect(MIG).toContain(`> ${FIN_BANK_MAX_UMSAETZE} then`);
    expect(MIG).toContain("'manuell', 'rechnung', 'zahlung', 'beleg', 'bank'");
  });
});

const umsatz = (p: Partial<FinBankumsatz>): FinBankumsatz => ({
  id: "u1", bankkonto_id: "k1", import_id: "i1", datum: "2026-10-05", valuta: null, betrag: 119, zweck: null, name: null, iban: null, referenz: null,
  status: "offen", zuordnung: null, zuordnung_id: null, buchung_id: null, notiz: null, ...p,
});
const rechnung = (p: Partial<FinRechnungZeile>): FinRechnungZeile => ({
  rechnung_id: "r1", nummer_text: "RE-2026-0042", datum: "2026-10-01", brutto: 119, order_id: "o1", order_number: 42, kunde: "Muster GmbH",
  storniert: false, storno_nummer: null, status: "gebucht", fehler: null, faellig_am: "2026-10-15", bezahlt_am: null, bezahlt_art: null, buchung_nr: 3, ...p,
});
const beleg = (p: Partial<FinBeleg>): FinBeleg => ({
  id: "b1", lieferant_id: "l1", belegdatum: "2026-10-01", belegnummer: "77", text: null, faellig_am: null, posten: [], datei_pfad: null, datei_typ: null,
  datei_name: null, status: "gebucht", brutto: 30, buchung_id: "x", bezahlt_am: null, bezahlt_art: null, erstellt_am: "2026-10-01T00:00:00Z", ...p,
});
const LIEF: FinLieferant[] = [{ id: "l1", name: "Reifen Nord", ust_id: null, konto: null, steuer: null, aktiv: true }];

describe("Vorschläge", () => {
  it("Nummer im Zweck schlägt Betrag allein, bezahlte und stornierte fallen weg", () => {
    const v = vorschlaege(umsatz({ zweck: "Rechnung RE-2026-0042", name: "Muster GmbH" }), [
      rechnung({ rechnung_id: "r2", nummer_text: "RE-2026-0050", kunde: "Andere" }),
      rechnung({}),
      rechnung({ rechnung_id: "r3", bezahlt_am: "2026-10-02" }),
      rechnung({ rechnung_id: "r4", storniert: true }),
    ], [], []);
    expect(v.map((x) => [x.id, x.punkte, x.passt])).toEqual([["r1", 6, true], ["r2", 2, true]]);
  });
  it("Nummer passt, Betrag nicht: Vorschlag, aber nicht zuordenbar", () => {
    const v = vorschlaege(umsatz({ betrag: 100, zweck: "RE-2026-0042" }), [rechnung({})], [], []);
    expect(v).toHaveLength(1);
    expect(v[0].passt).toBe(false);
  });
  it("Teilzahlung: kleiner als der Rest (auch nur über den Namen), größer nur mit Nummer und nicht zuordenbar", () => {
    const re = rechnung({ teilbezahlt: 50 });
    expect(vorschlaege(umsatz({ betrag: 69, name: "Muster GmbH" }), [re], [], [])[0]).toMatchObject({ rest: 69, passt: true, teil: false });
    expect(vorschlaege(umsatz({ betrag: 30, name: "Muster GmbH" }), [re], [], [])[0]).toMatchObject({ rest: 69, passt: false, teil: true, punkte: 1 });
    expect(vorschlaege(umsatz({ betrag: 30, name: "Andere" }), [re], [], [])).toEqual([]);
    expect(vorschlaege(umsatz({ betrag: 100, zweck: "RE-2026-0042" }), [re], [], [])[0]).toMatchObject({ passt: false, teil: false });
    expect(vorschlaege(umsatz({ betrag: -10, name: "Reifen Nord" }), [], [beleg({ teilbezahlt: 25 })], LIEF)).toEqual([]);
    expect(vorschlaege(umsatz({ betrag: -3, name: "Reifen Nord" }), [], [beleg({ teilbezahlt: 25 })], LIEF)[0]).toMatchObject({ rest: 5, teil: true });
  });
  it("Abbuchung sucht Belege, Lieferantenname zählt; kurze Nummern zählen nicht", () => {
    const v = vorschlaege(umsatz({ betrag: -30, name: "Reifen Nord", zweck: "Beleg R-7710" }), [rechnung({ brutto: 30 })],
      [beleg({ belegnummer: "R-7710" }), beleg({ id: "b2", bezahlt_am: "2026-10-03" })], LIEF);
    expect(v.map((x) => [x.art, x.id, x.punkte])).toEqual([["beleg", "b1", 6]]);
    expect(vorschlaege(umsatz({ betrag: -30, zweck: "77" }), [], [beleg({ belegnummer: "77" })], LIEF)[0].punkte).toBe(2);
  });
});

const zeile = (konto: number, seite: "S" | "H", betrag: number, ist_steuer = false, steuerschluessel: string | null = null) =>
  ({ id: Math.random(), posten: 1, seite, konto, betrag, steuerschluessel, ist_steuer });
const buchung = (p: Partial<FinBuchung>): FinBuchung => ({
  id: "x", jahr: 2026, nr: 1, datum: "2026-10-01", text: "", beleg: null, quelle: "manuell", quelle_id: null, storno_von: null, storniert_durch: null,
  grund: null, erstellt_am: "2026-10-01T00:00:00Z", fin_buchungszeilen: [], ...p,
} as FinBuchung);

describe("Konto aus früheren Umsätzen", () => {
  it("gleicher Name → Gegenkonto und Steuer der damaligen Buchung", () => {
    const alt = umsatz({ id: "u0", name: "Telekom AG", status: "zugeordnet", zuordnung: "konto", buchung_id: "B0", betrag: -59.5 });
    const b = buchung({ id: "B0", fin_buchungszeilen: [zeile(4920, "S", 50, false, "vst19"), zeile(1576, "S", 9.5, true), zeile(1200, "H", 59.5)] });
    expect(kontoAusFrueheren(umsatz({ name: "TELEKOM AG" }), [alt], [b], [1200])).toEqual({ konto: 4920, steuer: "vst19" });
    expect(kontoAusFrueheren(umsatz({ name: "Andere" }), [alt], [b], [1200])).toBeNull();
  });
});

describe("Kassenbuch und Saldo", () => {
  const B = [
    buchung({ id: "a", nr: 2, datum: "2026-10-02", text: "Barverkauf", fin_buchungszeilen: [zeile(1000, "S", 119), zeile(8400, "H", 100), zeile(1776, "H", 19, true)] }),
    buchung({ id: "b", nr: 1, datum: "2026-10-01", text: "Tanken", fin_buchungszeilen: [zeile(4530, "S", 50), zeile(1000, "H", 50)] }),
    buchung({ id: "c", nr: 3, datum: "2026-10-03", text: "Bank", fin_buchungszeilen: [zeile(1200, "S", 10), zeile(1400, "H", 10)] }),
  ];
  it("sortiert nach Datum, laufender Bestand, warnt bei unter null", () => {
    const k = kassenbuch(B, 1000);
    expect(k.zeilen.map((z) => [z.nr, z.einnahme, z.ausgabe, z.bestand])).toEqual([[1, 0, 50, -50], [2, 119, 0, 69]]);
    expect(k.bestand).toBe(69);
    expect(k.negativAm).toBe("2026-10-01");
  });
  it("kontoSaldoBis zählt Soll plus, Haben minus bis zum Stichtag", () => {
    expect(kontoSaldoBis(B, 1000, "2026-10-01")).toBe(-50);
    expect(kontoSaldoBis(B, 1000, null)).toBe(69);
    expect(kontoSaldoBis(B, 1200, null)).toBe(10);
  });
});
