// Finance-Einstellungen (Migration 87, v145, docs/finance.md Abschnitt 3) – die Regeln ohne Datenbank,
// geprüft in tests/financeEinstellungen.test.ts. Die Datenbank prüft dieselben Wertebereiche
// (Prüfregeln `fin_einst_*`); wer hier eine Auswahl ergänzt, ergänzt sie dort mit einer neuen Migration.
//
// Die steuerlichen Grenzen sind der Stand vom Oktober 2026 und vor jeder Phase mit dem Steuerberater
// abzugleichen – die App ersetzt keine Steuerberatung.

export type Rechtsform = "einzel" | "gbr" | "ug" | "gmbh" | "sonstige";
export type Gewinnermittlung = "euer" | "bilanz";
export type Kontenrahmen = "skr03" | "skr04";
export type Besteuerung = "regel" | "klein";
export type Versteuerung = "soll" | "ist";
export type Voranmeldung = "monat" | "quartal" | "keine";
export type RechnungenUmfang = "pilot" | "alle";
export type OhneAusweis = "herausrechnen" | "steuerfrei";

export type FinEinstellungen = {
  wirtschaftsjahr: number;
  rechtsform: Rechtsform;
  gewinnermittlung: Gewinnermittlung;
  kontenrahmen: Kontenrahmen;
  besteuerung: Besteuerung;
  versteuerung: Versteuerung;
  voranmeldung: Voranmeldung;
  dauerfrist: boolean;
  r13b_empfaenger: boolean;
  innergemeinschaftlich: boolean;
  wj_beginn_monat: number;
  start_datum: string;
  // Geringwertige Güter über 250 € bis 1.000 € in den Sammelposten (§ 6 Abs. 2a EStG, Migration 95) – einheitlich je Jahr.
  sammelposten: boolean;
  // Stufe D (Migration 111): welche FSM-Rechnungen gebucht werden, und wie eine Rechnung ohne Umsatzsteuerausweis.
  rechnungen_umfang: RechnungenUmfang;
  ohne_ausweis: OhneAusweis;
  aktualisiert_am?: string | null;
};

type Wahl<T extends string> = { wert: T; text: string; hinweis: string };

export const FIN_RECHTSFORMEN: Wahl<Rechtsform>[] = [
  { wert: "einzel", text: "Einzelunternehmen", hinweis: "Inhaber haftet selbst; Gewinn in der Einkommensteuer." },
  { wert: "gbr", text: "GbR", hinweis: "Mehrere Gesellschafter; gesonderte Gewinnfeststellung." },
  { wert: "ug", text: "UG (haftungsbeschränkt)", hinweis: "Kapitalgesellschaft – Bilanz ist Pflicht." },
  { wert: "gmbh", text: "GmbH", hinweis: "Kapitalgesellschaft – Bilanz ist Pflicht." },
  { wert: "sonstige", text: "Andere", hinweis: "Mit dem Steuerberater klären, was gilt." },
];

export const FIN_GEWINNERMITTLUNG: Wahl<Gewinnermittlung>[] = [
  { wert: "euer", text: "EÜR", hinweis: "Einnahmen-Überschuss-Rechnung (§ 4 Abs. 3 EStG): gezählt wird bei Zahlung, Anlage EÜR." },
  { wert: "bilanz", text: "Bilanz", hinweis: "Bilanz und GuV: Forderungen und Verbindlichkeiten zählen zum Stichtag." },
];

export const FIN_KONTENRAHMEN: Wahl<Kontenrahmen>[] = [
  { wert: "skr03", text: "SKR03", hinweis: "Prozessgliederung – passt zum bisherigen DATEV-Export (Erlöse 8400)." },
  { wert: "skr04", text: "SKR04", hinweis: "Abschlussgliederung – Erlöse 4400." },
];

export const FIN_BESTEUERUNG: Wahl<Besteuerung>[] = [
  { wert: "regel", text: "Regelbesteuerung", hinweis: "Umsatzsteuer auf Rechnungen, Vorsteuerabzug, Voranmeldung." },
  { wert: "klein", text: "Kleinunternehmer § 19", hinweis: "Keine Umsatzsteuer auf Rechnungen, kein Vorsteuerabzug, keine Voranmeldung." },
];

export const FIN_VERSTEUERUNG: Wahl<Versteuerung>[] = [
  { wert: "soll", text: "Soll", hinweis: "Nach vereinbarten Entgelten: die Rechnung zählt im Monat der Leistung." },
  { wert: "ist", text: "Ist", hinweis: "Nach vereinnahmten Entgelten (auf Antrag): die Rechnung zählt im Monat der Zahlung." },
];

export const FIN_VORANMELDUNG: Wahl<Voranmeldung>[] = [
  { wert: "monat", text: "Monatlich", hinweis: "Vorjahressteuer über 9.000 €; Gründungsjahr und Folgejahr in der Regel." },
  { wert: "quartal", text: "Vierteljährlich", hinweis: "Vorjahressteuer über 2.000 € bis 9.000 €." },
  { wert: "keine", text: "Befreit", hinweis: "Vorjahressteuer bis 2.000 €, auf Antrag: nur die Jahreserklärung." },
];

// Stufe D (Migration 111, Prüfregeln `fin_einst_umfang` und `fin_einst_ohne_ausweis`).
export const FIN_RECHNUNGEN_UMFANG: Wahl<RechnungenUmfang>[] = [
  { wert: "alle", text: "Alle Rechnungen", hinweis: "Jede Rechnung aus FSM wird gebucht – Finance führt die Buchhaltung vollständig (ab 2027)." },
  { wert: "pilot", text: "Pilot", hinweis: "Nur Aufträge mit „Rechnung nötig“; alles andere bucht die Kanzlei wie bisher." },
];
export const FIN_OHNE_AUSWEIS: Wahl<OhneAusweis>[] = [
  { wert: "herausrechnen", text: "Steuer herausrechnen", hinweis: "Die Umsatzsteuer steckt im Betrag (19 % aus 119 €) und wird abgeführt." },
  { wert: "steuerfrei", text: "Steuerfrei buchen", hinweis: "Auf das Erlöskonto 0 % (8200/4200), ohne Umsatzsteuer – nur, wenn der Steuerberater das so sieht." },
];
// Ab diesem Jahr ist „alle Rechnungen“ die Vorgabe (Entscheidung 2: vollständig ab 01.01.2027); davor der Pilot.
export const FIN_ALLE_RECHNUNGEN_AB = 2027;

// Kleinunternehmer (§ 19 UStG, Stand 2026): Vorjahr höchstens, laufendes Jahr höchstens.
export const KLEINUNTERNEHMER_GRENZE_VORJAHR = 25_000;
export const KLEINUNTERNEHMER_GRENZE_LAUFEND = 100_000;
// Ist-Versteuerung auf Antrag bis zu diesem Vorjahresumsatz (§ 20 UStG).
export const IST_VERSTEUERUNG_GRENZE = 800_000;

export function finVorgabe(jahr: number, heute: string): FinEinstellungen {
  return {
    wirtschaftsjahr: jahr, rechtsform: "einzel", gewinnermittlung: "euer", kontenrahmen: "skr03",
    besteuerung: "regel", versteuerung: "soll", voranmeldung: "monat", dauerfrist: false,
    r13b_empfaenger: true, innergemeinschaftlich: false, wj_beginn_monat: 1, start_datum: heute, sammelposten: false,
    rechnungen_umfang: jahr >= FIN_ALLE_RECHNUNGEN_AB ? "alle" : "pilot", ohne_ausweis: "herausrechnen",
  };
}

// Was die Datenbank ablehnen würde oder nicht zusammenpasst – als Klartext, bevor gespeichert wird.
export function finMaengel(e: FinEinstellungen): string[] {
  const m: string[] = [];
  if (e.dauerfrist && e.voranmeldung === "keine") m.push("Dauerfristverlängerung gibt es nur mit Voranmeldung – bei „Befreit“ bitte ausschalten.");
  if ((e.rechtsform === "ug" || e.rechtsform === "gmbh") && e.gewinnermittlung === "euer") m.push("Eine UG oder GmbH muss bilanzieren – EÜR ist für sie nicht zulässig.");
  if (e.wj_beginn_monat < 1 || e.wj_beginn_monat > 12) m.push("Der Beginn des Wirtschaftsjahres muss ein Monat von 1 bis 12 sein.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start_datum)) m.push("Der Starttag fehlt.");
  return m;
}

// Was beim Kleinunternehmer nicht gilt (die Felder werden dann ausgegraut, behalten aber ihren Wert
// für den Fall, dass die Grenze überschritten wird).
export function finFeldAktiv(e: FinEinstellungen, feld: "versteuerung" | "voranmeldung" | "dauerfrist"): boolean {
  if (e.besteuerung === "klein") return false;
  if (feld === "dauerfrist") return e.voranmeldung !== "keine";
  return true;
}

// Eine Zeile für Übersicht und Kopf: „EÜR · SKR03 · Regelbesteuerung, Soll, monatlich“.
export function finKurztext(e: FinEinstellungen): string {
  const t = <T extends string>(liste: Wahl<T>[], w: T) => liste.find((x) => x.wert === w)?.text ?? w;
  const ust = e.besteuerung === "klein"
    ? "Kleinunternehmer § 19"
    : `Regelbesteuerung, ${t(FIN_VERSTEUERUNG, e.versteuerung)}, ${t(FIN_VORANMELDUNG, e.voranmeldung).toLowerCase()}${e.dauerfrist && e.voranmeldung !== "keine" ? " mit Dauerfrist" : ""}`;
  return `${t(FIN_GEWINNERMITTLUNG, e.gewinnermittlung)} · ${t(FIN_KONTENRAHMEN, e.kontenrahmen)} · ${ust}`;
}
