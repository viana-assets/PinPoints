// Finance Stufe C, Teil 2 (Migration 107, v181, docs/finance.md Abschnitt 13): Buchungsvorlagen und wiederkehrende
// Buchungen – die Regeln ohne React. Termine wie bei den Planposten (`planTermine`, lib/finance/liquiditaet.ts) und wie
// `fin_wiederkehrend_holen()` in der Datenbank: ab + k × Rhythmus Monate, am Monatsende abgeschnitten. Wer die
// Rechnung an einer Stelle ändert, ändert alle drei. Geprüft in tests/financeVorlagen.test.ts.

import { betragText } from "./arbeitsplatz";
import { FIN_RHYTHMEN, planTermine, type FinRhythmus } from "./liquiditaet";
import type { FinStapelZeile, StapelEingabe } from "./stapel";

export type FinVorlage = {
  id: string; kurz: string; text: string; soll: number; haben: number; betrag: number | null; steuer: string | null;
  kost1?: string | null; kost2?: string | null;
};

export type FinWkRhythmus = Exclude<FinRhythmus, "einmal">;
export type FinWiederkehrend = {
  id: string; text: string; soll: number; haben: number; betrag: number; steuer: string | null;
  rhythmus: FinWkRhythmus; ab: string; bis: string | null; aktiv: boolean;
  kost1?: string | null; kost2?: string | null;
};

// Die Rhythmen einer wiederkehrenden Buchung: die der Planposten ohne „einmalig“ (wie `fin_wk_rhythmus`, Migration 107).
export const FIN_WK_RHYTHMEN = FIN_RHYTHMEN.filter((r): r is typeof r & { wert: FinWkRhythmus } => r.wert !== "einmal");

// Text einer geholten Zeile: „Leasing VW T6.1 02/2027“ (wie in der Datenbank, höchstens 200 Zeichen).
export function wkText(text: string, termin: string): string {
  return `${text} ${termin.slice(5, 7)}/${termin.slice(0, 4)}`.slice(0, 200);
}

type Vergeben = Pick<FinStapelZeile, "wiederkehrend_id" | "termin">[];
const schluessel = (id: string, termin: string) => `${id}|${termin}`;

// Was „Wiederkehrende holen“ in einen Stapel des Jahres `jahr` legen würde: aktive Buchungen, Termine im Jahr bis zum
// Stichtag, die noch in keinem Stapel stehen. Reihenfolge Datum, dann Text.
export function wiederkehrendOffen(wks: readonly FinWiederkehrend[], vergeben: Vergeben, jahr: number, stichtag: string):
  { wk: FinWiederkehrend; termin: string; text: string }[] {
  const belegt = new Set(vergeben.filter((z) => z.wiederkehrend_id && z.termin).map((z) => schluessel(z.wiederkehrend_id as string, z.termin as string)));
  const jahresende = `${jahr}-12-31`;
  const bis = stichtag < jahresende ? stichtag : jahresende;
  return wks.filter((w) => w.aktiv)
    .flatMap((w) => planTermine({ ab: w.ab, rhythmus: w.rhythmus, bis: w.bis }, `${jahr}-01-01`, bis)
      .filter((t) => !belegt.has(schluessel(w.id, t)))
      .map((t) => ({ wk: w, termin: t, text: wkText(w.text, t) })))
    .sort((a, b) => (a.termin < b.termin ? -1 : a.termin > b.termin ? 1 : a.text.localeCompare(b.text, "de")));
}

// Der nächste Termin, der noch in keinem Stapel steht (für die Liste); null, wenn keiner mehr kommt.
export function naechsterOffenerTermin(w: FinWiederkehrend, vergeben: Vergeben): string | null {
  const belegt = new Set(vergeben.filter((z) => z.wiederkehrend_id === w.id).map((z) => z.termin));
  const ende = w.bis ?? `${Number(w.ab.slice(0, 4)) + 50}-12-31`;
  return planTermine({ ab: w.ab, rhythmus: w.rhythmus, bis: w.bis }, w.ab, ende).find((t) => !belegt.has(t)) ?? null;
}

// Eine Vorlage füllt die Erfassungszeile: Konten, Steuer, Text, und den Betrag, wenn sie einen hat. Datum und Beleg
// bleiben, wie sie sind.
export function vorlageInEingabe(v: FinVorlage, e: StapelEingabe): StapelEingabe {
  return { ...e, soll: v.soll, haben: v.haben, steuer: v.steuer ?? "", text: v.text, betrag: v.betrag != null ? betragText(v.betrag) : "",
    kost1: v.kost1 ?? "", kost2: v.kost2 ?? "" };
}

// Vorlagen nach Kurzname, wiederkehrende nach Text.
export function vorlagenSortiert(v: readonly FinVorlage[]): FinVorlage[] {
  return [...v].sort((a, b) => a.kurz.localeCompare(b.kurz, "de", { sensitivity: "base" }));
}
