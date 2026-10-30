// Finance Stufe C, Teil 1 (Migration 106, v180, docs/finance.md Abschnitt 12): Buchungsstapel – erfassen, prüfen,
// auf einmal buchen. Hier die Regeln ohne React und ohne Datenbank: Datum kurz tippen, Beleg weiterzählen, jede
// Zeile vorab so prüfen, wie `fin_buchen()` sie beim Buchen prüfen wird (`postenZeilen`), Summen.
// Die Datenbank entscheidet; diese Prüfung zeigt nur vorher, woran „Stapel buchen“ scheitern würde.
// Geprüft in tests/financeStapel.test.ts.

import { postenZeilen, type FinFestschreibung, type FinKonto, type FinSteuerschluessel, type FinZeile } from "./buchung";
import type { FinEinstellungen } from "./einstellungen";

export type FinStapelZeile = {
  id: string;
  stapel_id: string;
  lfd: number;
  datum: string;
  beleg: string | null;
  text: string;
  soll: number;
  haben: number;
  betrag: number;
  steuer: string | null;
  buchung_id: string | null;
};

export type FinStapel = {
  id: string;
  jahr: number;
  bezeichnung: string;
  zustand: "offen" | "gebucht";
  erstellt_am: string;
  gebucht_am: string | null;
  fin_stapel_zeilen: FinStapelZeile[];
};

// Was in die Erfassungszeile getippt wird – Texte, bis „Übernehmen“.
export type StapelEingabe = { datum: string; beleg: string; soll: number | null; haben: number | null; betrag: string; steuer: string; text: string };

// ---------------------------------------------------------------- Datum kurz
// „1002“, „10.2“, „10.02.“, „10.02.2027“, „10.2.27“ → ISO im Wirtschaftsjahr. Ein anderes Jahr oder ein Tag, den es
// nicht gibt (31.02.), ist kein Datum.
export function datumAusEingabe(text: string, jahr: number): string | null {
  const t = text.trim();
  let tag: number, monat: number, j = jahr;
  let m = /^(\d{2})(\d{2})$/.exec(t);
  if (m) { tag = Number(m[1]); monat = Number(m[2]); }
  else {
    m = /^(\d{1,2})\.(\d{1,2})\.?(?:(\d{2}|\d{4}))?$/.exec(t);
    if (!m) return null;
    tag = Number(m[1]); monat = Number(m[2]);
    if (m[3]) j = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  }
  if (j !== jahr || monat < 1 || monat > 12 || tag < 1) return null;
  if (tag > new Date(Date.UTC(j, monat, 0)).getUTCDate()) return null;
  return `${j}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

// „2027-02-10“ → „10.02.“ (für das Feld; das Jahr steht am Stapel).
export function datumKurz(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}

// Die nächste Belegnummer: die Zahl am Ende um eins weiter, mit derselben Stellenzahl („ER-0042“ → „ER-0043“,
// „7“ → „8“, „RE-099“ → „RE-100“). Ohne Zahl am Ende bleibt der Text.
export function belegWeiter(beleg: string): string {
  const m = /^(.*?)(\d+)$/.exec(beleg.trim());
  if (!m) return beleg.trim();
  const n = String(Number(m[2]) + 1);
  return m[1] + (n.length < m[2].length ? n.padStart(m[2].length, "0") : n);
}

// ---------------------------------------------------------------- Prüfen
export type StapelPruefung = { zeilen: FinZeile[]; fehler: string | null };

// Dieselbe Rechnung wie `fin_buchen()` (über `postenZeilen`) plus Jahr und Festschreibung (`fin_buchbar`, Migration 88).
export function stapelZeilePruefen(
  z: Pick<FinStapelZeile, "datum" | "soll" | "haben" | "betrag" | "steuer" | "text">, jahr: number,
  konten: FinKonto[], schluessel: FinSteuerschluessel[],
  e: Pick<FinEinstellungen, "besteuerung" | "r13b_empfaenger" | "innergemeinschaftlich" | "kontenrahmen">,
  fest: readonly FinFestschreibung[],
): StapelPruefung {
  if (!z.text.trim()) return { zeilen: [], fehler: "Der Buchungstext fehlt." };
  if (z.datum.slice(0, 4) !== String(jahr)) return { zeilen: [], fehler: `Das Datum liegt nicht in ${jahr}.` };
  const monat = Number(z.datum.slice(5, 7));
  if (fest.some((f) => f.jahr === jahr && f.monat === monat)) return { zeilen: [], fehler: `Der ${String(monat).padStart(2, "0")}/${jahr} ist festgeschrieben.` };
  const r = postenZeilen({ soll: z.soll, haben: z.haben, betrag: z.betrag, steuer: z.steuer }, 1, konten, schluessel, e);
  return "fehler" in r ? { zeilen: [], fehler: r.fehler.replace(/^Posten 1: /, "") } : { zeilen: r.zeilen, fehler: null };
}

// Die Eingabe als Zeile – oder was noch fehlt (für „Übernehmen“).
export function eingabeAlsZeile(e: StapelEingabe, jahr: number, betragLesen: (t: string) => number | null):
  { ok: true; zeile: Omit<FinStapelZeile, "id" | "stapel_id" | "lfd" | "buchung_id"> } | { ok: false; fehler: string; feld: keyof StapelEingabe } {
  const datum = datumAusEingabe(e.datum, jahr);
  if (!datum) return { ok: false, fehler: `Datum als TTMM oder TT.MM. in ${jahr}.`, feld: "datum" };
  if (e.soll == null) return { ok: false, fehler: "Soll-Konto fehlt.", feld: "soll" };
  if (e.haben == null) return { ok: false, fehler: "Haben-Konto fehlt.", feld: "haben" };
  if (e.soll === e.haben) return { ok: false, fehler: "Soll und Haben sind dasselbe Konto.", feld: "haben" };
  const betrag = betragLesen(e.betrag);
  if (betrag == null || !(betrag > 0)) return { ok: false, fehler: "Betrag größer als 0.", feld: "betrag" };
  if (!e.text.trim()) return { ok: false, fehler: "Buchungstext fehlt.", feld: "text" };
  if (e.beleg.trim().length > 60) return { ok: false, fehler: "Beleg höchstens 60 Zeichen.", feld: "beleg" };
  return { ok: true, zeile: { datum, beleg: e.beleg.trim() || null, soll: e.soll, haben: e.haben, betrag, steuer: e.steuer || null, text: e.text.trim() } };
}

// In der Reihenfolge, in der „Stapel buchen“ bucht: Datum, dann Erfassung.
export function stapelReihenfolge(zeilen: readonly FinStapelZeile[]): FinStapelZeile[] {
  return [...zeilen].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.lfd - b.lfd));
}

export function stapelSumme(zeilen: readonly Pick<FinStapelZeile, "betrag">[]): number {
  return Math.round(zeilen.reduce((s, z) => s + Number(z.betrag), 0) * 100) / 100;
}
