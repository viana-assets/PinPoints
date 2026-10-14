// Finance F5 (Migration 92, v150): Umsatzsteuer-Voranmeldung als Probelauf – Formularansicht, Fristen,
// Zustand, Kleinunternehmer-Grenzen. Ohne Datenbank, geprüft in tests/financeSteuern.test.ts. Die Kennzahlen
// in Cent rechnet `fin_ust_kennzahlen()` aus dem Journal; hier wird daraus das, was im Formular steht.
//
// Stand Oktober 2026 (Vordruck USt 1 A 2026, BMF 29.12.2025: Kennzahlen gegenüber 2025 unverändert bis auf
// Kz 23 → Kz 500). Vor dem Echtbetrieb mit dem Steuerberater abgleichen. Übermittelt wird nicht aus der App.

import type { FinEinstellungen, Kontenrahmen } from "./einstellungen";
import { KLEINUNTERNEHMER_GRENZE_LAUFEND, KLEINUNTERNEHMER_GRENZE_VORJAHR } from "./einstellungen";

export type FinKennzahlen = Record<string, { b?: number; s?: number }>;
export type FinUstAbgabe = { fassung: number; abgegeben_am: string; kennzahlen: FinKennzahlen; notiz: string | null; erstellt_am: string };
export type FinUstZeitraum = { zeitraum: string; von: string; bis: string; kennzahlen: FinKennzahlen; abgaben: FinUstAbgabe[] };
export type FinUstStand =
  | { eingerichtet: false }
  | { eingerichtet: true; umsatz_vorjahr: number | null; sondervorauszahlung: number | null; umsatz_jahr: number; zeitraeume: FinUstZeitraum[] };

// Die Zeilen des Formulars, in seiner Reihenfolge. `satz`: Die Steuer rechnet das Formular (ELSTER) selbst
// aus der Bemessungsgrundlage. `seite`: was die Zahllast erhöht (+) oder mindert (−).
export type FinUstZeile = { kz: string; steuerKz?: string; text: string; satz?: number; nurBemessung?: boolean; seite: 1 | -1 };
export const FIN_UST_ZEILEN: FinUstZeile[] = [
  { kz: "81", text: "Steuerpflichtige Umsätze 19 %", satz: 19, seite: 1 },
  { kz: "86", text: "Steuerpflichtige Umsätze 7 %", satz: 7, seite: 1 },
  { kz: "41", text: "Innergemeinschaftliche Lieferungen an Abnehmer mit USt-IdNr.", nurBemessung: true, seite: 1 },
  { kz: "48", text: "Steuerfreie Umsätze ohne Vorsteuerabzug (je nach Art auch Kz 43 – mit dem Steuerberater klären)", nurBemessung: true, seite: 1 },
  { kz: "89", text: "Innergemeinschaftliche Erwerbe 19 %", satz: 19, seite: 1 },
  { kz: "46", steuerKz: "47", text: "§ 13b: Sonstige Leistungen von Unternehmern aus dem übrigen EU-Gebiet", seite: 1 },
  { kz: "66", text: "Vorsteuer aus Rechnungen anderer Unternehmer", seite: -1 },
  { kz: "61", text: "Vorsteuer aus innergemeinschaftlichem Erwerb", seite: -1 },
  { kz: "67", text: "Vorsteuer aus Leistungen nach § 13b", seite: -1 },
  { kz: "39", text: "Anrechnung der festgesetzten Sondervorauszahlung", seite: -1 },
];

// Wohin die Zahlung ans Finanzamt gebucht wird (Bank & Kasse › Auf Konto buchen) – wie in Migration 88 angelegt.
export const FIN_UST_ZAHLUNG_KONTEN: Record<Kontenrahmen, { vorauszahlung: number; sonder: number }> = {
  skr03: { vorauszahlung: 1780, sonder: 1781 },
  skr04: { vorauszahlung: 3820, sonder: 3830 },
};

const cent = (n: number) => Math.round(n * 100) / 100;

export function ustStandLesen(roh: unknown): FinUstStand {
  const r = (roh ?? {}) as Record<string, unknown>;
  if (!r.eingerichtet) return { eingerichtet: false };
  const zahl = (x: unknown) => (x == null ? null : Number(x));
  const kz = (x: unknown): FinKennzahlen => Object.fromEntries(Object.entries((x ?? {}) as Record<string, { b?: unknown; s?: unknown }>)
    .map(([k, v]) => [k, { ...(v.b != null ? { b: Number(v.b) } : {}), ...(v.s != null ? { s: Number(v.s) } : {}) }]));
  return {
    eingerichtet: true,
    umsatz_vorjahr: zahl(r.umsatz_vorjahr),
    sondervorauszahlung: zahl(r.sondervorauszahlung),
    umsatz_jahr: Number(r.umsatz_jahr ?? 0),
    zeitraeume: ((r.zeitraeume ?? []) as Record<string, unknown>[]).map((z) => ({
      zeitraum: String(z.zeitraum), von: String(z.von), bis: String(z.bis), kennzahlen: kz(z.kennzahlen),
      abgaben: ((z.abgaben ?? []) as Record<string, unknown>[]).map((a) => ({
        fassung: Number(a.fassung), abgegeben_am: String(a.abgegeben_am), kennzahlen: kz(a.kennzahlen),
        notiz: (a.notiz as string | null) ?? null, erstellt_am: String(a.erstellt_am),
      })),
    })),
  };
}

export type FinUstFormZeile = FinUstZeile & { bemessung: number | null; steuer: number | null; steuerBuch: number | null };
export type FinUstFormular = { zeilen: FinUstFormZeile[]; zahllast: number; zahllastBuch: number; leer: boolean };

// Was im Formular steht: Bemessungsgrundlagen in vollen Euro (Cent abgeschnitten), die Steuer zu 81/86/89
// wie das Formular sie aus der Bemessungsgrundlage rechnet; § 13b und Vorsteuer wie gebucht. Kz 83 = Summe.
// `zahllastBuch`: dasselbe mit den gebuchten Cent – die Differenz erklärt Rundungscent.
export function ustFormular(kz: FinKennzahlen): FinUstFormular {
  const zeilen = FIN_UST_ZEILEN.map((z) => {
    const w = kz[z.kz];
    const b = w?.b ?? null;
    const sBuch = w?.s ?? (z.steuerKz ? kz[z.steuerKz]?.s ?? null : null);
    const bemessung = b == null ? null : Math.trunc(b);
    const steuer = z.nurBemessung ? null : z.satz != null && bemessung != null ? cent((bemessung * z.satz) / 100) : sBuch;
    return { ...z, bemessung: z.seite === -1 ? null : bemessung, steuer, steuerBuch: sBuch };
  }).filter((z) => z.bemessung != null || z.steuer != null);
  const summe = (f: (z: FinUstFormZeile) => number | null) => cent(zeilen.reduce((s, z) => s + z.seite * (f(z) ?? 0), 0));
  return { zeilen, zahllast: summe((z) => z.steuer), zahllastBuch: summe((z) => z.steuerBuch), leer: zeilen.length === 0 };
}

// ---------------------------------------------------------------- Zeiträume und Fristen
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export function zeitraumText(zeitraum: string, jahr: number): string {
  if (zeitraum === "J") return `Jahr ${jahr}`;
  if (zeitraum.startsWith("Q")) return `${zeitraum.slice(1)}. Quartal ${jahr}`;
  return `${MONATE[Number(zeitraum.slice(1)) - 1]} ${jahr}`;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const tag = (j: number, m: number, t: number) => new Date(Date.UTC(j, m - 1, t));

// Ostersonntag (gregorianisch, Gaußsche Osterformel in der Form von Meeus/Jones/Butcher).
export function ostersonntag(j: number): string {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), t = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(tag(j, monat, t));
}

// Bundesweite Feiertage. Landesfeiertage am Sitz des Finanzamts verschieben die Frist zusätzlich – ohne sie
// ist die Frist hier höchstens einen Tag zu früh, nie zu spät.
export function feiertage(j: number): Set<string> {
  const ostern = Date.parse(ostersonntag(j) + "T00:00:00Z");
  const plus = (n: number) => iso(new Date(ostern + n * 86_400_000));
  return new Set([`${j}-01-01`, plus(-2), plus(1), `${j}-05-01`, plus(39), plus(50), `${j}-10-03`, `${j}-12-25`, `${j}-12-26`]);
}

// § 108 Abs. 3 AO: Fällt das Fristende auf Samstag, Sonntag oder Feiertag, endet sie am nächsten Werktag.
export function naechsterWerktag(datum: string): string {
  let d = new Date(datum + "T00:00:00Z");
  for (;;) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6 && !feiertage(d.getUTCFullYear()).has(iso(d))) return iso(d);
    d = new Date(d.getTime() + 86_400_000);
  }
}

// § 18 Abs. 1 UStG: 10. Tag nach Ablauf des Zeitraums, mit Dauerfristverlängerung (§ 46 UStDV) einen Monat
// später. „J“ (befreit) hat keine Voranmeldungsfrist – nur die Jahreserklärung.
export function ustFrist(bis: string, zeitraum: string, dauerfrist: boolean): string | null {
  if (zeitraum === "J") return null;
  const [j, m] = bis.split("-").map(Number);
  const ziel = tag(j, m + 1 + (dauerfrist ? 1 : 0), 10);
  return naechsterWerktag(iso(ziel));
}

const tageBis = (von: string, bis: string) => Math.round((Date.parse(bis + "T00:00:00Z") - Date.parse(von + "T00:00:00Z")) / 86_400_000);

// Gleich, wenn jede Kennzahl auf den Cent gleich ist (Kz 39 zählt mit – sie steht nur in der Abgabe).
function gleicheKennzahlen(a: FinKennzahlen, b: FinKennzahlen): boolean {
  const ohne39 = (k: FinKennzahlen) => Object.entries(k).filter(([kz]) => kz !== "39")
    .map(([kz, v]) => `${kz}:${cent(v.b ?? 0)}:${cent(v.s ?? 0)}`).sort().join("|");
  return ohne39(a) === ohne39(b);
}

export type UstZustand =
  // Ganz vor dem Starttag von Finance (Einstellungen): nicht Teil des Probelaufs.
  | { art: "vorher" }
  | { art: "kommt" }
  | { art: "laeuft" }
  // Kleinunternehmer ohne § 13b und ohne ig. Erwerb in diesem Zeitraum: keine Voranmeldung.
  | { art: "keine" }
  | { art: "offen"; frist: string | null; tage: number | null }
  | { art: "ueberfaellig"; frist: string; tage: number }
  | { art: "abgegeben"; am: string; fassung: number }
  | { art: "geaendert"; am: string; fassung: number };

export function ustZustand(z: FinUstZeitraum, e: Pick<FinEinstellungen, "dauerfrist" | "besteuerung" | "start_datum">, heute: string): UstZustand {
  if (z.bis < e.start_datum) return { art: "vorher" };
  if (heute < z.von) return { art: "kommt" };
  if (heute <= z.bis) return { art: "laeuft" };
  const letzte = z.abgaben[z.abgaben.length - 1];
  if (letzte) {
    return gleicheKennzahlen(letzte.kennzahlen, z.kennzahlen)
      ? { art: "abgegeben", am: letzte.abgegeben_am, fassung: letzte.fassung }
      : { art: "geaendert", am: letzte.abgegeben_am, fassung: letzte.fassung };
  }
  if (e.besteuerung === "klein" && !z.kennzahlen["46"] && !z.kennzahlen["89"]) return { art: "keine" };
  const frist = ustFrist(z.bis, z.zeitraum, e.dauerfrist);
  if (frist && heute > frist) return { art: "ueberfaellig", frist, tage: tageBis(frist, heute) };
  return { art: "offen", frist, tage: frist ? tageBis(heute, frist) : null };
}

export function ustZustandText(s: UstZustand): string {
  switch (s.art) {
    case "vorher": return "vor dem Start von Finance";
    case "kommt": return "kommt noch";
    case "laeuft": return "läuft noch";
    case "keine": return "keine Voranmeldung nötig";
    case "offen": return s.frist == null ? "nur Jahreserklärung" : s.tage === 0 ? "heute fällig" : `fällig in ${s.tage} ${s.tage === 1 ? "Tag" : "Tagen"}`;
    case "ueberfaellig": return `überfällig seit ${s.tage} ${s.tage === 1 ? "Tag" : "Tagen"}`;
    case "abgegeben": return s.fassung > 1 ? `berichtigt abgegeben (Fassung ${s.fassung})` : "abgegeben";
    case "geaendert": return "seit der Abgabe geändert – Berichtigung nötig";
  }
}

// Für Übersicht › Zu erledigen: fällig in höchstens 7 Tagen, überfällig oder geändert.
export function ustZuErledigen(stand: FinUstStand, e: Pick<FinEinstellungen, "dauerfrist" | "besteuerung" | "start_datum">, heute: string): { faellig: number; ueberfaellig: number; geaendert: number } {
  const z = stand.eingerichtet ? stand.zeitraeume.map((x) => ustZustand(x, e, heute)) : [];
  return {
    faellig: z.filter((s) => s.art === "offen" && s.tage != null && s.tage <= 7).length,
    ueberfaellig: z.filter((s) => s.art === "ueberfaellig").length,
    geaendert: z.filter((s) => s.art === "geaendert").length,
  };
}

// ---------------------------------------------------------------- Kleinunternehmer, Sondervorauszahlung
// § 19 UStG seit 2025: Vorjahr höchstens 25.000 €, laufendes Jahr höchstens 100.000 € – wer die 100.000 €
// überschreitet, ist ab diesem Umsatz regelbesteuert. Warnung ab 80 %.
export const FIN_KU_WARNUNG_AB = 0.8;
export function kuPruefung(umsatzJahr: number, umsatzVorjahr: number | null): {
  laufend: { anteil: number; stufe: "ok" | "nahe" | "ueber" }; vorjahr: { anteil: number; stufe: "ok" | "nahe" | "ueber" } | null;
} {
  const stufe = (a: number) => (a > 1 ? "ueber" : a >= FIN_KU_WARNUNG_AB ? "nahe" : "ok") as "ok" | "nahe" | "ueber";
  const l = umsatzJahr / KLEINUNTERNEHMER_GRENZE_LAUFEND;
  const v = umsatzVorjahr == null ? null : umsatzVorjahr / KLEINUNTERNEHMER_GRENZE_VORJAHR;
  return { laufend: { anteil: l, stufe: stufe(l) }, vorjahr: v == null ? null : { anteil: v, stufe: stufe(v) } };
}

// Sondervorauszahlung: ein Elftel der Vorauszahlungen des Vorjahres (§ 47 UStDV) – nur als Vorschlag, die
// Höhe setzt das Finanzamt fest. Gezählt wird die jeweils letzte Fassung, negative (Erstattungen) mit.
export function sondervorauszahlungVorschlag(vorjahr: FinUstStand): number | null {
  if (!vorjahr.eingerichtet) return null;
  const mit = vorjahr.zeitraeume.filter((z) => z.abgaben.length);
  if (!mit.length) return null;
  const summe = mit.reduce((s, z) => {
    const k = { ...z.abgaben[z.abgaben.length - 1].kennzahlen };
    delete k["39"];
    return s + ustFormular(k).zahllast;
  }, 0);
  return Math.max(0, Math.round(summe / 11));
}
