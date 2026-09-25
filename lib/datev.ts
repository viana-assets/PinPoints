import type { Betrieb, Rechnung } from "./types";
import type { Zeitraum } from "./auswertung";

// Export des Rechnungsbuchs für den Steuerberater (26.09.2026, Entwurf „M · Auswertungen").
// Reine Funktionen, geprüft in tests/datev.test.ts.
//
// Drei Dateien:
//   1. DATEV-Buchungsstapel (Format „EXTF", Version 700, Kategorie 21) – eine Buchung je
//      Rechnung und Steuersatz: Debitor an Erlöskonto, Bruttobetrag. Die Erlöskonten 8400/8300
//      (SKR03) sind Automatikkonten, die Umsatzsteuer rechnet DATEV selbst heraus – deshalb
//      bleibt der BU-Schlüssel leer.
//   2. Debitorenliste – je Kunde ein Konto (entschieden am 26.09.2026). Der Steuerberater
//      braucht zu jedem Personenkonto einen Namen; die Liste ist eine einfache Tabelle, kein
//      DATEV-Stammdatenformat.
//   3. Rechnungsliste – für alle, die kein DATEV haben.
//
// Die Einstellungen (Berater, Mandant, Konten) stehen am Betrieb (Migration 59). Die Datei wird
// NICHT festgeschrieben (Feld 21 = 0): Der Steuerberater soll prüfen können, bevor etwas fest ist.
//
// Aufgebaut nach der DATEV-Formatbeschreibung „Buchungsstapel" (developer.datev.de) und der
// Feldliste des Ruby-Gems `ledermann/datev`. Die erste Datei gehört vor dem regelmäßigen Einsatz
// einmal beim Steuerberater probeweise eingelesen.

export type DatevEinstellung = Pick<Betrieb,
  | "datev_berater" | "datev_mandant" | "datev_wj_beginn_monat" | "datev_sachkontenlaenge" | "datev_skr"
  | "datev_konto_19" | "datev_konto_7" | "datev_konto_0" | "datev_debitor_basis" | "datev_sammeldebitor">;

// Die 125 Spaltenüberschriften eines Buchungsstapels, Version 700. DATEV liest nach Position;
// die Überschriften stehen der Vollständigkeit halber da und müssen in dieser Zahl und
// Reihenfolge vorhanden sein.
const BELEGINFO = Array.from({ length: 8 }, (_, i) => [`Beleginfo - Art ${i + 1}`, `Beleginfo - Inhalt ${i + 1}`]).flat();
const ZUSATZ = Array.from({ length: 20 }, (_, i) => [`Zusatzinformation - Art ${i + 1}`, `Zusatzinformation- Inhalt ${i + 1}`]).flat();
export const DATEV_SPALTEN: string[] = [
  "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz",
  "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto",
  "Buchungstext", "Postensperre", "Diverse Adressnummer", "Geschäftspartnerbank", "Sachverhalt", "Zinssperre", "Beleglink",
  ...BELEGINFO,
  "KOST1 - Kostenstelle", "KOST2 - Kostenstelle", "Kost-Menge", "EU-Land u. UStID (Bestimmung)", "EU-Steuersatz (Bestimmung)",
  "Abw. Versteuerungsart", "Sachverhalt L+L", "Funktionsergänzung L+L", "BU 49 Hauptfunktionstyp", "BU 49 Hauptfunktionsnummer",
  "BU 49 Funktionsergänzung",
  ...ZUSATZ,
  "Stück", "Gewicht", "Zahlweise", "Forderungsart", "Veranlagungsjahr", "Zugeordnete Fälligkeit", "Skontotyp", "Auftragsnummer",
  "Buchungstyp", "USt-Schlüssel (Anzahlungen)", "EU-Mitgliedstaat (Anzahlungen)", "Sachverhalt L+L (Anzahlungen)",
  "EU-Steuersatz (Anzahlungen)", "Erlöskonto (Anzahlungen)", "Herkunft-Kz", "Buchungs GUID", "KOST-Datum",
  "SEPA-Mandatsreferenz", "Skontosperre", "Gesellschaftername", "Beteiligtennummer", "Identifikationsnummer", "Zeichnernummer",
  "Postensperre bis", "Bezeichnung SoBil-Sachverhalt", "Kennzeichen SoBil-Buchung", "Festschreibung", "Leistungsdatum",
  "Datum Zuord. Steuerperiode", "Fälligkeit", "Generalumkehr (GU)", "Steuersatz", "Land", "Abrechnungsreferenz", "BVV-Position",
  "EU-Mitgliedstaat u. UStID (Ursprung)", "EU-Steuersatz (Ursprung)", "Abw. Skontokonto",
];
// Positionen (0-basiert) der Felder, die hier befüllt werden.
const SP = { umsatz: 0, sh: 1, wkz: 2, konto: 6, gegenkonto: 7, belegdatum: 9, beleg1: 10, text: 13, leistungsdatum: 114 };

// ---------------------------------------------------------------- Einstellungen prüfen
//
// Was fehlt, bevor ein Export möglich ist – als Sätze für die Oberfläche. Die Datenbank prüft die
// Grenzen noch einmal (Migration 59); hier steht es, damit die Erklärung VOR dem Knopf kommt.
export function datevEinstellungFehler(e: DatevEinstellung): string[] {
  const f: string[] = [];
  if (e.datev_berater == null) f.push("Die Beraternummer fehlt (vom Steuerberater, 4 bis 7 Stellen).");
  else if (e.datev_berater < 1001 || e.datev_berater > 9999999) f.push("Die Beraternummer muss zwischen 1001 und 9999999 liegen.");
  if (e.datev_mandant == null) f.push("Die Mandantennummer fehlt (vom Steuerberater, bis 5 Stellen).");
  else if (e.datev_mandant < 1 || e.datev_mandant > 99999) f.push("Die Mandantennummer muss zwischen 1 und 99999 liegen.");
  if (e.datev_wj_beginn_monat < 1 || e.datev_wj_beginn_monat > 12) f.push("Der Beginn des Wirtschaftsjahres muss ein Monat von 1 bis 12 sein.");
  if (e.datev_sachkontenlaenge < 4 || e.datev_sachkontenlaenge > 8) f.push("Die Sachkontenlänge muss zwischen 4 und 8 liegen.");
  for (const [name, konto] of [["19 %", e.datev_konto_19], ["7 %", e.datev_konto_7], ["0 %", e.datev_konto_0]] as const) {
    if (!(konto > 0) || String(konto).length > e.datev_sachkontenlaenge) f.push(`Das Erlöskonto ${name} passt nicht zur Sachkontenlänge ${e.datev_sachkontenlaenge}.`);
  }
  if (!personenkontoPasst(e.datev_sammeldebitor, e.datev_sachkontenlaenge)) {
    f.push(`Der Sammeldebitor muss ${e.datev_sachkontenlaenge + 1} Stellen haben und mit 1 bis 6 beginnen (Debitorenbereich).`);
  }
  return f;
}

// Debitoren haben eine Stelle mehr als Sachkonten und beginnen mit 1 bis 6 (10000–69999 bei
// Sachkontenlänge 4). Mit 7 bis 9 beginnen die Kreditoren.
function personenkontoPasst(konto: number, sachkontenlaenge: number): boolean {
  const s = String(konto);
  return Number.isInteger(konto) && s.length === sachkontenlaenge + 1 && s[0] >= "1" && s[0] <= "6";
}

export function debitorFuer(kundennummer: number | null, e: DatevEinstellung): number {
  return kundennummer == null ? e.datev_sammeldebitor : kundennummer + e.datev_debitor_basis;
}

// ---------------------------------------------------------------- Wirtschaftsjahr
//
// DATEV nimmt je Datei nur EIN Wirtschaftsjahr. Beginnt es im Januar, ist das das Kalenderjahr.
export function wirtschaftsjahrBeginn(datum: string, beginnMonat: number): string {
  const jahr = Number(datum.slice(0, 4));
  const monat = Number(datum.slice(5, 7));
  const j = monat >= beginnMonat ? jahr : jahr - 1;
  return `${j}-${String(beginnMonat).padStart(2, "0")}-01`;
}

// ---------------------------------------------------------------- Buchungsstapel
export type DatevBuchung = {
  umsatz: number;        // immer positiv
  sh: "S" | "H";
  konto: number;         // Debitor
  gegenkonto: number;    // Erlöskonto
  belegdatum: string;    // YYYY-MM-DD
  beleg: string;         // Rechnungsnummer
  text: string;
  leistungsdatum: string | null;
};

const rund = (n: number) => Math.round(n * 100) / 100;

// Die Buchungen zu den Rechnungen im Zeitraum. Eine Rechnung mit Positionen zu 19 % und 7 %
// ergibt zwei Buchungen; der Rundungsrest geht auf die letzte, damit die Summe dem Beleg
// entspricht. Ein Storno (negative Beträge, lib/rechnung.ts `stornoAus`) wird im Haben gebucht.
export function datevBuchungen(rechnungen: Rechnung[], e: DatevEinstellung, z: Zeitraum): { buchungen: DatevBuchung[]; fehler: string[] } {
  const buchungen: DatevBuchung[] = [];
  const fehler: string[] = [];
  // Testrechnungen (Migration 60, negative Nummer) gehen nie an den Steuerberater.
  const imZeitraum = rechnungen.filter((r) => r.nummer > 0 && r.datum >= z.von && r.datum <= z.bis)
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.nummer - b.nummer);
  for (const r of imZeitraum) {
    const konto = debitorFuer(r.kundennummer ?? r.empfaenger?.kundennummer ?? null, e);
    if (!personenkontoPasst(konto, e.datev_sachkontenlaenge)) {
      fehler.push(`${r.nummer_text}: Debitor ${konto} liegt außerhalb des Debitorenbereichs – Kundennummer oder „Debitor = Kundennummer +" prüfen.`);
      continue;
    }
    // Netto je Steuersatz. Ohne Positionen (sollte es nicht geben) ein einziger Satz aus dem Beleg.
    const jeSatz = new Map<number, number>();
    for (const p of r.positionen ?? []) jeSatz.set(p.steuersatz, (jeSatz.get(p.steuersatz) ?? 0) + p.netto);
    if (jeSatz.size === 0) jeSatz.set(r.netto !== 0 && r.steuer !== 0 ? Math.round((r.steuer / r.netto) * 100) : 0, r.netto);
    const saetze = [...jeSatz.entries()].filter(([, netto]) => rund(netto) !== 0).sort((a, b) => b[0] - a[0]);
    let rest = rund(r.brutto);
    const name = ((r.empfaenger?.company || "").trim() || r.empfaenger?.name || "").trim();
    saetze.forEach(([satz, netto], i) => {
      const gegenkonto = satz === 19 ? e.datev_konto_19 : satz === 7 ? e.datev_konto_7 : satz === 0 ? e.datev_konto_0 : null;
      if (gegenkonto == null) { fehler.push(`${r.nummer_text}: Steuersatz ${satz} % hat kein Erlöskonto.`); return; }
      const brutto = i === saetze.length - 1 ? rest : rund(netto * (1 + satz / 100));
      rest = rund(rest - brutto);
      if (brutto === 0) return;
      buchungen.push({
        umsatz: Math.abs(brutto), sh: brutto > 0 ? "S" : "H", konto, gegenkonto,
        belegdatum: r.datum, beleg: r.nummer_text,
        text: ((r.art === "storno" ? "Storno " : "") + name).slice(0, 60),
        leistungsdatum: r.lieferdatum,
      });
    });
  }
  return { buchungen, fehler };
}

const betrag = (n: number) => n.toFixed(2).replace(".", ",");
const text = (s: string) => `"${s.replace(/"/g, '""').replace(/[\r\n;]+/g, " ")}"`;
const tt = (iso: string) => iso.slice(8, 10) + iso.slice(5, 7);
const ttmmjjjj = (iso: string) => iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(0, 4);
const kompakt = (iso: string) => iso.replace(/-/g, "");

export function datevBuchungsstapel(
  rechnungen: Rechnung[],
  e: DatevEinstellung,
  z: Zeitraum,
  bezeichnung: string,
  erzeugtAm: Date
): { inhalt: string; dateiname: string; buchungen: number; fehler: string[] } {
  const fehler = [...datevEinstellungFehler(e)];
  const wjVon = wirtschaftsjahrBeginn(z.von, e.datev_wj_beginn_monat);
  if (wirtschaftsjahrBeginn(z.bis, e.datev_wj_beginn_monat) !== wjVon) {
    fehler.push("Der Zeitraum reicht über zwei Wirtschaftsjahre – DATEV nimmt nur eines je Datei. Bitte Monat, Quartal, Saison oder Jahr wählen.");
  }
  const { buchungen, fehler: bFehler } = datevBuchungen(rechnungen, e, z);
  fehler.push(...bFehler);
  const zwei = (n: number) => String(n).padStart(2, "0");
  const stempel = `${erzeugtAm.getFullYear()}${zwei(erzeugtAm.getMonth() + 1)}${zwei(erzeugtAm.getDate())}${zwei(erzeugtAm.getHours())}${zwei(erzeugtAm.getMinutes())}${zwei(erzeugtAm.getSeconds())}${String(erzeugtAm.getMilliseconds()).padStart(3, "0")}`;
  const kopf = [
    text("EXTF"), 700, 21, text("Buchungsstapel"), 13, stempel, "", text("RE"), text(""), text(""),
    e.datev_berater ?? "", e.datev_mandant ?? "", kompakt(wjVon), e.datev_sachkontenlaenge,
    kompakt(z.von), kompakt(z.bis), text(bezeichnung.slice(0, 30)), text(""), 1, 0, 0, text("EUR"),
    "", text(""), "", "", text(e.datev_skr), "", "", text(""), text(""),
  ].join(";");
  const zeilen = buchungen.map((b) => {
    const f: string[] = DATEV_SPALTEN.map(() => "");
    f[SP.umsatz] = betrag(b.umsatz);
    f[SP.sh] = text(b.sh);
    f[SP.wkz] = text("EUR");
    f[SP.konto] = String(b.konto);
    f[SP.gegenkonto] = String(b.gegenkonto);
    f[SP.belegdatum] = tt(b.belegdatum);
    f[SP.beleg1] = text(b.beleg.slice(0, 36));
    f[SP.text] = text(b.text);
    if (b.leistungsdatum) f[SP.leistungsdatum] = ttmmjjjj(b.leistungsdatum);
    return f.join(";");
  });
  const inhalt = [kopf, DATEV_SPALTEN.join(";"), ...zeilen].join("\r\n") + "\r\n";
  return { inhalt, dateiname: `EXTF_Buchungsstapel_${z.von}_${z.bis}.csv`, buchungen: buchungen.length, fehler };
}

// DATEV liest die Datei als Windows-1252 („ANSI"). Umlaute und ß liegen dort auf denselben
// Stellen wie in Latin-1; dazu kommen € und die typografischen Zeichen aus 0x80–0x9F. Was es
// dort nicht gibt, wird zu „?" – in Namen auf Rechnungen praktisch nie.
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
export function windows1252(s: string): Uint8Array {
  const aus = new Uint8Array(s.length);
  let n = 0;
  for (const zeichen of s) {
    const c = zeichen.codePointAt(0)!;
    aus[n++] = c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : CP1252[c] ?? 0x3f;
  }
  return aus.slice(0, n);
}

// ---------------------------------------------------------------- Tabellen (CSV)
//
// Für Excel in Deutschland: Semikolon, Komma als Dezimalzeichen, UTF-8 mit BOM (sonst liest
// Excel die Umlaute falsch), Zeilenende CRLF.
export function csv(zeilen: (string | number | null | undefined)[][]): string {
  const feld = (v: string | number | null | undefined) => {
    if (v == null) return "";
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
    return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return "﻿" + zeilen.map((z) => z.map(feld).join(";")).join("\r\n") + "\r\n";
}

export function rechnungslisteCsv(rechnungen: Rechnung[], z: Zeitraum): string {
  const nachId = new Map(rechnungen.map((r) => [r.id, r]));
  const liste = rechnungen.filter((r) => r.nummer > 0 && r.datum >= z.von && r.datum <= z.bis)
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.nummer - b.nummer);
  return csv([
    ["Nummer", "Art", "Datum", "Lieferdatum", "Kundennummer", "Empfänger", "Netto", "Steuer", "Brutto", "Storniert durch / hebt auf", "Stornogrund"],
    ...liste.map((r) => [
      r.nummer_text, r.art === "storno" ? "Storno" : "Rechnung", r.datum, r.lieferdatum ?? "", r.kundennummer ?? "",
      ((r.empfaenger?.company || "").trim() || r.empfaenger?.name || ""), r.netto, r.steuer, r.brutto,
      (r.storniert_durch ? nachId.get(r.storniert_durch)?.nummer_text : r.hebt_auf ? nachId.get(r.hebt_auf)?.nummer_text : "") ?? "",
      r.storno_grund ?? "",
    ]),
  ]);
}

// Je Debitor der Name aus der jüngsten Rechnung – aus dem Beleg, nicht aus dem Kundenstamm:
// Gebucht wird, was auf der Rechnung stand.
export function debitorenlisteCsv(rechnungen: Rechnung[], e: DatevEinstellung, z: Zeitraum): string {
  const je = new Map<number, Rechnung>();
  for (const r of rechnungen.filter((x) => x.nummer > 0 && x.datum >= z.von && x.datum <= z.bis).sort((a, b) => a.datum.localeCompare(b.datum))) {
    je.set(debitorFuer(r.kundennummer ?? r.empfaenger?.kundennummer ?? null, e), r);
  }
  return csv([
    ["Konto", "Kundennummer", "Name", "Firma", "Anschrift", "E-Mail"],
    ...[...je.entries()].sort((a, b) => a[0] - b[0]).map(([konto, r]) => [
      konto, r.kundennummer ?? "", r.empfaenger?.name ?? "", r.empfaenger?.company ?? "",
      (r.empfaenger?.address ?? "").replace(/\s*\n\s*/g, ", "), r.empfaenger?.email ?? "",
    ]),
  ]);
}
