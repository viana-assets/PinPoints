// Finance F6 (Migration 94, v152): Summen- und Saldenliste, BWA, EÜR – ohne Datenbank, geprüft in
// tests/financeAuswertungen.test.ts. Die Datenbank liefert Soll/Haben je Konto und Monat
// (`fin_auswertung_salden`) und die Zahlungswirkung je Konto (`fin_euer`); hier wird gegliedert.
//
// BWA: kurzfristige Erfolgsrechnung nach Buchungsdatum (Soll), gegliedert nach Kontenbereichen. EÜR: Zufluss und
// Abfluss (§ 4 Abs. 3 EStG) nach den Kennzahlen der Anlage EÜR (Stand Vordruck 2025 – vor der Abgabe mit dem
// Steuerberater abgleichen). Beides ist ein Probelauf aus dem, was in Finance gebucht ist.

import type { FinKonto, FinSteuerschluessel, KontoKategorie } from "./buchung";
import type { Kontenrahmen } from "./einstellungen";

export type FinSaldo = { konto: number; monat: number; soll: number; haben: number };
export type FinKontenblattZeile = { datum: string; nr: number; text: string; beleg: string | null; seite: "S" | "H"; betrag: number; steuer: string | null; storno: boolean; gegen: string | null };
export type FinEuerStand = { eingerichtet: false } | { eingerichtet: true; konten: { konto: number; wirkung: number }[]; unklar: number };

const cent = (n: number) => Math.round(n * 100) / 100;
type Bereich = [number, number];
const drin = (n: number, b: Bereich[]) => b.some(([v, bis]) => n >= v && n <= bis);

export function saldenLesen(roh: unknown): FinSaldo[] {
  return ((roh ?? []) as Record<string, unknown>[]).map((x) => ({
    konto: Number(x.konto), monat: Number(x.monat), soll: Number(x.soll ?? 0), haben: Number(x.haben ?? 0),
  }));
}

export function euerLesen(roh: unknown): FinEuerStand {
  const r = (roh ?? {}) as Record<string, unknown>;
  if (!r.eingerichtet) return { eingerichtet: false };
  return {
    eingerichtet: true,
    konten: ((r.konten ?? []) as Record<string, unknown>[]).map((k) => ({ konto: Number(k.konto), wirkung: Number(k.wirkung) })),
    unklar: Number(r.unklar ?? 0),
  };
}

// ---------------------------------------------------------------- Summen- und Saldenliste
export type SusaZeile = { konto: number; bezeichnung: string; kategorie: KontoKategorie | null; soll: number; haben: number; saldo: number };

// Monate `von` bis `bis` (1–12). Saldo = Soll − Haben. Nur bebuchte Konten.
export function summenSalden(salden: FinSaldo[], konten: FinKonto[], von: number, bis: number): { zeilen: SusaZeile[]; soll: number; haben: number } {
  const je = new Map<number, { soll: number; haben: number }>();
  for (const s of salden) {
    if (s.monat < von || s.monat > bis) continue;
    const x = je.get(s.konto) ?? { soll: 0, haben: 0 };
    x.soll += s.soll; x.haben += s.haben;
    je.set(s.konto, x);
  }
  const zeilen = [...je.entries()].sort((a, b) => a[0] - b[0]).map(([konto, x]) => {
    const k = konten.find((y) => y.nummer === konto);
    return { konto, bezeichnung: k?.bezeichnung ?? "", kategorie: k?.kategorie ?? null, soll: cent(x.soll), haben: cent(x.haben), saldo: cent(x.soll - x.haben) };
  });
  return { zeilen, soll: cent(zeilen.reduce((s, z) => s + z.soll, 0)), haben: cent(zeilen.reduce((s, z) => s + z.haben, 0)) };
}

// ---------------------------------------------------------------- BWA
// Kostenbereiche je Kontenrahmen (wie die Konten aus Migration 88/93). Was in keinem Bereich liegt: „Sonstige Kosten“.
export type BwaZeileDef = { key: string; text: string; bereiche: Record<Kontenrahmen, Bereich[]> };
export const FIN_BWA_KOSTEN: BwaZeileDef[] = [
  { key: "material", text: "Material- und Wareneinsatz, Fremdleistungen", bereiche: { skr03: [[3000, 3999]], skr04: [[5000, 5999]] } },
  { key: "personal", text: "Personalkosten", bereiche: { skr03: [[4100, 4199]], skr04: [[6000, 6199]] } },
  { key: "raum", text: "Raumkosten", bereiche: { skr03: [[4200, 4299]], skr04: [[6310, 6349]] } },
  { key: "versicherung", text: "Versicherungen und Beiträge", bereiche: { skr03: [[4360, 4399]], skr04: [[6400, 6439]] } },
  { key: "kfz", text: "Fahrzeugkosten", bereiche: { skr03: [[4500, 4599]], skr04: [[6500, 6599], [7685, 7685]] } },
  { key: "werbung", text: "Werbe- und Reisekosten, Bewirtung", bereiche: { skr03: [[4600, 4699]], skr04: [[6600, 6699]] } },
  { key: "instandhaltung", text: "Reparatur und Instandhaltung", bereiche: { skr03: [[4800, 4819]], skr04: [[6450, 6499]] } },
  { key: "abschreibung", text: "Abschreibungen", bereiche: { skr03: [[4820, 4869]], skr04: [[6200, 6299]] } },
  { key: "sonstige", text: "Sonstige Kosten", bereiche: { skr03: [], skr04: [] } },
];
// Erlöskonten, die keine Umsätze sind (Kassenüberschuss usw., Migration 93): unter „Sonstige Erträge“.
export const FIN_SONSTIGE_ERTRAEGE: Record<Kontenrahmen, Bereich[]> = { skr03: [[2000, 2999]], skr04: [[4800, 4999]] };

export type BwaWerte = { umsatz: number; kosten: Record<string, number>; material: number; rohertrag: number; gesamtkosten: number; betriebsergebnis: number; sonstigeErtraege: number; ergebnis: number };
export type Bwa = { monat: BwaWerte; kumuliert: BwaWerte };

function bwaWerte(salden: FinSaldo[], konten: FinKonto[], rahmen: Kontenrahmen, von: number, bis: number): BwaWerte {
  const kat = new Map(konten.map((k) => [k.nummer, k.kategorie]));
  const kosten: Record<string, number> = Object.fromEntries(FIN_BWA_KOSTEN.map((z) => [z.key, 0]));
  let umsatz = 0, sonstige = 0;
  for (const s of salden) {
    if (s.monat < von || s.monat > bis) continue;
    const k = kat.get(s.konto);
    if (k === "erloes") {
      if (drin(s.konto, FIN_SONSTIGE_ERTRAEGE[rahmen])) sonstige += s.haben - s.soll; else umsatz += s.haben - s.soll;
    } else if (k === "aufwand") {
      const z = FIN_BWA_KOSTEN.find((x) => drin(s.konto, x.bereiche[rahmen])) ?? FIN_BWA_KOSTEN[FIN_BWA_KOSTEN.length - 1];
      kosten[z.key] += s.soll - s.haben;
    }
  }
  for (const k of Object.keys(kosten)) kosten[k] = cent(kosten[k]);
  const material = kosten.material;
  const gesamtkosten = cent(Object.entries(kosten).filter(([k]) => k !== "material").reduce((s, [, v]) => s + v, 0));
  const rohertrag = cent(umsatz - material);
  const betriebsergebnis = cent(rohertrag - gesamtkosten);
  return { umsatz: cent(umsatz), kosten, material, rohertrag, gesamtkosten, betriebsergebnis, sonstigeErtraege: cent(sonstige), ergebnis: cent(betriebsergebnis + sonstige) };
}

export function bwa(salden: FinSaldo[], konten: FinKonto[], rahmen: Kontenrahmen, monat: number): Bwa {
  return { monat: bwaWerte(salden, konten, rahmen, monat, monat), kumuliert: bwaWerte(salden, konten, rahmen, 1, monat) };
}

// ---------------------------------------------------------------- EÜR
// Betriebsausgaben nach Kennzahlen der Anlage EÜR (Vordruck 2025). `anteil`: abziehbarer Teil (Bewirtung 70 %).
export type EuerAusgabeDef = { kz: string | null; text: string; bereiche: Record<Kontenrahmen, Bereich[]>; anteil?: number };
export const FIN_EUER_AUSGABEN: EuerAusgabeDef[] = [
  { kz: "100", text: "Waren, Roh- und Hilfsstoffe", bereiche: { skr03: [[3200, 3499]], skr04: [[5200, 5499]] } },
  { kz: "110", text: "Bezogene Fremdleistungen", bereiche: { skr03: [[3100, 3199]], skr04: [[5900, 5999]] } },
  { kz: "120", text: "Personal (Löhne, Gehälter, Sozialabgaben)", bereiche: { skr03: [[4100, 4199]], skr04: [[6000, 6199]] } },
  { kz: "130", text: "Abschreibungen auf bewegliche Wirtschaftsgüter", bereiche: { skr03: [[4820, 4849]], skr04: [[6200, 6259]] } },
  { kz: "132", text: "Geringwertige Wirtschaftsgüter (Sofortabschreibung)", bereiche: { skr03: [[4855, 4855]], skr04: [[6260, 6260]] } },
  { kz: "150", text: "Miete und Nebenkosten für Geschäftsräume", bereiche: { skr03: [[4200, 4299]], skr04: [[6310, 6349]] } },
  { kz: "280", text: "Telekommunikation", bereiche: { skr03: [[4920, 4929]], skr04: [[6805, 6814]] } },
  { kz: "221", text: "Reisekosten", bereiche: { skr03: [[4660, 4679]], skr04: [[6650, 6699]] } },
  { kz: "194", text: "Rechts- und Steuerberatung, Buchführung", bereiche: { skr03: [[4950, 4959]], skr04: [[6825, 6839]] } },
  { kz: "223", text: "Beiträge, Gebühren, Versicherungen", bereiche: { skr03: [[4360, 4399]], skr04: [[6400, 6439]] } },
  { kz: "224", text: "Werbekosten", bereiche: { skr03: [[4600, 4639]], skr04: [[6600, 6639]] } },
  { kz: "165", text: "Bewirtung (davon 70 % abziehbar)", bereiche: { skr03: [[4650, 4654]], skr04: [[6640, 6644]] }, anteil: 0.7 },
  { kz: "144–146", text: "Kfz-Kosten (je nach Art: Leasing, Steuer/Versicherung, laufende Kosten)", bereiche: { skr03: [[4500, 4599]], skr04: [[6500, 6599], [7685, 7685]] } },
  // Seit F7 (Migration 95). Eigene Zeilen der Anlage EÜR – die Kennzahl vor der Abgabe mit dem Steuerberater klären.
  { kz: null, text: "Auflösung des Sammelpostens (20 % je Jahr)", bereiche: { skr03: [[4862, 4862]], skr04: [[6264, 6264]] } },
  { kz: null, text: "Restbuchwert ausgeschiedener Anlagegüter", bereiche: { skr03: [[2310, 2310]], skr04: [[6895, 6895]] } },
  { kz: "183", text: "Übrige Betriebsausgaben", bereiche: { skr03: [], skr04: [] } },
];
// Erlöse ohne Umsatzsteuer und nicht steuerbare Einnahmen (Kz 103); Kleinunternehmer-Erlöse (Kz 111).
export const FIN_EUER_STEUERFREI: Record<Kontenrahmen, Bereich[]> = { skr03: [[8100, 8194], [8196, 8299], [8337, 8337], [2000, 2999]], skr04: [[4100, 4184], [4186, 4299], [4337, 4337], [4800, 4999]] };
export const FIN_EUER_KLEIN: Record<Kontenrahmen, Bereich[]> = { skr03: [[8195, 8195]], skr04: [[4185, 4185]] };

export type EuerZeile = { kz: string | null; text: string; betrag: number };
export type Euer = {
  einnahmen: EuerZeile[]; ausgaben: EuerZeile[]; summeEinnahmen: number; summeAusgaben: number; gewinn: number;
  anlagen: number; privat: number; unklar: number; nichtAbziehbar: number;
};

// `klein`: Kleinunternehmer – alle Erlöse in Kz 111, keine USt-Zeilen. Wirkung: positiv = Zufluss.
export function euer(stand: Extract<FinEuerStand, { eingerichtet: true }>, konten: FinKonto[], schluessel: FinSteuerschluessel[], rahmen: Kontenrahmen, klein: boolean): Euer {
  const kat = new Map(konten.map((k) => [k.nummer, k.kategorie]));
  const ust = new Set(schluessel.map((s) => s.ust_konto).filter((x): x is number => x != null));
  const vst = new Set(schluessel.map((s) => s.vst_konto).filter((x): x is number => x != null));
  const ein: Record<string, number> = { "111": 0, "112": 0, "103": 0, "140": 0, "141": 0 };
  const aus = new Map<string, number>(FIN_EUER_AUSGABEN.map((a) => [a.text, 0]));
  let vorsteuer = 0, anFa = 0, anlagen = 0, privat = 0, nichtAbziehbar = 0;
  for (const { konto, wirkung } of stand.konten) {
    const k = kat.get(konto);
    if (k === "erloes") {
      const kz = klein || drin(konto, FIN_EUER_KLEIN[rahmen]) ? "111" : drin(konto, FIN_EUER_STEUERFREI[rahmen]) ? "103" : "112";
      ein[kz] += wirkung;
    } else if (k === "aufwand") {
      const a = FIN_EUER_AUSGABEN.find((x) => drin(konto, x.bereiche[rahmen])) ?? FIN_EUER_AUSGABEN[FIN_EUER_AUSGABEN.length - 1];
      const betrag = -wirkung * (a.anteil ?? 1);
      aus.set(a.text, (aus.get(a.text) ?? 0) + betrag);
      nichtAbziehbar += -wirkung * (1 - (a.anteil ?? 1));
    } else if (k === "steuer") {
      if (ust.has(konto)) ein["140"] += wirkung;
      else if (vst.has(konto)) vorsteuer += -wirkung;
      else if (wirkung > 0) ein["141"] += wirkung;
      else anFa += -wirkung;
    } else if (k === "anlage") anlagen += -wirkung;
    else if (k === "privat" || k === "kapital") privat += wirkung;
  }
  const einnahmen: EuerZeile[] = [
    { kz: "111", text: "Betriebseinnahmen als Kleinunternehmer", betrag: cent(ein["111"]) },
    { kz: "112", text: "Umsatzsteuerpflichtige Betriebseinnahmen (netto)", betrag: cent(ein["112"]) },
    { kz: "103", text: "Umsatzsteuerfreie und nicht steuerbare Betriebseinnahmen", betrag: cent(ein["103"]) },
    { kz: "140", text: "Vereinnahmte Umsatzsteuer", betrag: cent(ein["140"]) },
    { kz: "141", text: "Vom Finanzamt erstattete Umsatzsteuer", betrag: cent(ein["141"]) },
  ].filter((z) => z.betrag !== 0);
  const ausgaben: EuerZeile[] = [
    ...FIN_EUER_AUSGABEN.map((a) => ({ kz: a.kz, text: a.text, betrag: cent(aus.get(a.text) ?? 0) })),
    { kz: "185", text: "Gezahlte Vorsteuerbeträge", betrag: cent(vorsteuer) },
    { kz: "186", text: "An das Finanzamt gezahlte Umsatzsteuer", betrag: cent(anFa) },
  ].filter((z) => z.betrag !== 0);
  const summeEinnahmen = cent(einnahmen.reduce((s, z) => s + z.betrag, 0));
  const summeAusgaben = cent(ausgaben.reduce((s, z) => s + z.betrag, 0));
  return {
    einnahmen, ausgaben, summeEinnahmen, summeAusgaben, gewinn: cent(summeEinnahmen - summeAusgaben),
    anlagen: cent(anlagen), privat: cent(privat), unklar: cent(stand.unklar), nichtAbziehbar: cent(nichtAbziehbar),
  };
}

// ---------------------------------------------------------------- Kontenblatt
export function kontenblattMitSaldo(zeilen: FinKontenblattZeile[]): (FinKontenblattZeile & { saldo: number })[] {
  let saldo = 0;
  return zeilen.map((z) => {
    saldo = cent(saldo + (z.seite === "S" ? z.betrag : -z.betrag));
    return { ...z, saldo };
  });
}

// Die Monatsnamen – auch für Steuern (Zeiträume) und die Einstellungen (Beginn des Wirtschaftsjahres).
export const MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
