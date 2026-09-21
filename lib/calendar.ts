// Kalender-Hilfsfunktionen für die Einsatzplanung (Montag als Wochenstart,
// ISO-Kalenderwochen, Mitarbeiterfarbe). Reine Funktionen ohne React/Supabase-Abhängigkeit,
// ausgelagert aus app/page.tsx.
import type { Employee } from "./types";
import { EMP_COLORS } from "./constants";
import { datumStr } from "./helpers";

export function employeeColorFor(employees: Employee[], employeeId: string): string {
  const idx = employees.findIndex((e) => e.id === employeeId);
  return EMP_COLORS[(idx < 0 ? 0 : idx) % EMP_COLORS.length];
}

export function startOfWeekMonday(d: Date): Date {
  const nd = new Date(d);
  const day = (nd.getDay() + 6) % 7; // Montag = 0 … Sonntag = 6
  nd.setDate(nd.getDate() - day);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

export function addDays(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

// Ein Datum als `JJJJ-MM-TT` in Ortszeit. Die Rechnung selbst steht in `lib/helpers.ts`
// (`datumStr`) – eine Regel, eine Stelle. Der Name bleibt, weil ihn der Kalender überall
// verwendet; bis zum 21.09.2026 stand hier dieselbe Rechnung ein zweites Mal, und
// `todayStr()` daneben rechnete in UTC. Zwei Fassungen desselben Gedankens laufen auseinander.
export const toDateStr = datumStr;

export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ---------------------------------------------------------------- Stundenraster (Block B)
//
// Ab hier: die Rechnung hinter Tages- und Wochenansicht. Sie steht in dieser Datei und nicht
// in der Komponente, weil sie in beiden Ansichten dieselbe ist – und weil eine
// Überlappungsrechnung, die man nicht prüfen kann, unauffällig falsch wird: Zwei Termine, die
// sich in Wahrheit überschneiden, aber nebeneinander gezeichnet werden sollten, sähen
// übereinander gestapelt aus wie EIN Termin.

// „08:30" → 510. Alles, was nicht wie eine Uhrzeit aussieht, ergibt null statt einer 0 –
// Mitternacht und „keine Angabe" dürfen nicht dasselbe sein.
export function minutenAus(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const treffer = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!treffer) return null;
  const std = parseInt(treffer[1], 10);
  const min = parseInt(treffer[2], 10);
  if (std > 23 || min > 59) return null;
  return std * 60 + min;
}

// 510 → „08:30". Über 24 Stunden wird auf 23:59 gedeckelt: Ein Termin, der rechnerisch über
// Mitternacht liefe, gehört in den Tag, an dem er steht – nicht in den nächsten.
export function hhmmAus(minuten: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minuten)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export type Zeitraum = { start: number; ende: number };

// Der Zeitraum eines Auftrags in Minuten seit Mitternacht.
//
// Ohne Startzeit gibt es keinen Zeitraum – so ein Auftrag gehört nicht ins Raster, sondern in
// die Leiste „ohne Uhrzeit" darüber. Ihn auf 00:00 zu setzen wäre schlimmer als ihn
// wegzulassen: Er stünde jeden Tag ganz oben und sähe aus wie ein Termin um Mitternacht.
//
// Ohne Endzeit gilt die Standarddauer. Das ist eine Annahme, und sie wird auch als solche
// angezeigt (gestrichelte Unterkante im Raster).
export function auftragsZeitraum(
  auftrag: { time: string | null; end_time?: string | null },
  standardMinuten: number
): (Zeitraum & { geschaetzt: boolean }) | null {
  const start = minutenAus(auftrag.time);
  if (start == null) return null;
  const ende = minutenAus(auftrag.end_time);
  if (ende != null && ende > start) return { start, ende, geschaetzt: false };
  return { start, ende: Math.min(start + standardMinuten, 24 * 60), geschaetzt: true };
}

// Wie breit ist ein Termin und wo sitzt er, wenn mehrere gleichzeitig laufen?
//
// Das Verfahren in zwei Schritten, weil ein einfaches „zähl die Überlappungen" falsche
// Breiten liefert: Termine, die sich nur MITTELBAR überschneiden (A mit B, B mit C, aber A
// nicht mit C), gehören trotzdem in dieselbe Aufteilung – sonst überdeckt A die Hälfte von C.
//
//   1. Zusammenhängende Gruppen bilden: Alles, was sich direkt oder über Dritte berührt.
//   2. Innerhalb einer Gruppe jedem Termin die erste Spalte geben, die zum Zeitpunkt seines
//      Beginns wieder frei ist. Die Spaltenzahl der GRUPPE bestimmt die Breite aller ihrer
//      Termine – damit sind sie gleich breit und die Kanten fluchten.
export function layoutSpalten<T extends Zeitraum>(termine: T[]): (T & { spalte: number; spalten: number })[] {
  const sortiert = termine.slice().sort((a, b) => a.start - b.start || b.ende - a.ende);
  const ergebnis: (T & { spalte: number; spalten: number })[] = [];

  let gruppe: (T & { spalte: number; spalten: number })[] = [];
  let spaltenEnde: number[] = [];   // wann die jeweilige Spalte wieder frei wird
  let gruppenEnde = -1;

  function gruppeAbschliessen() {
    for (const t of gruppe) t.spalten = spaltenEnde.length;
    ergebnis.push(...gruppe);
    gruppe = [];
    spaltenEnde = [];
    gruppenEnde = -1;
  }

  for (const termin of sortiert) {
    // Beginnt der Termin erst, nachdem ALLES Bisherige zu Ende ist, fängt eine neue Gruppe an.
    if (gruppe.length > 0 && termin.start >= gruppenEnde) gruppeAbschliessen();

    let spalte = spaltenEnde.findIndex((frei) => frei <= termin.start);
    if (spalte === -1) { spalte = spaltenEnde.length; spaltenEnde.push(termin.ende); }
    else spaltenEnde[spalte] = termin.ende;

    gruppe.push({ ...termin, spalte, spalten: 1 });
    gruppenEnde = Math.max(gruppenEnde, termin.ende);
  }
  if (gruppe.length > 0) gruppeAbschliessen();

  return ergebnis;
}

// Welcher Ausschnitt des Tages wird gezeichnet?
//
// Ein festes Raster von 0 bis 24 Uhr verschwendet zwei Drittel der Höhe an Stunden, in denen
// nie jemand arbeitet. Deshalb ein Grundfenster, das sich ausdehnt, sobald ein Termin darüber
// hinausgeht – und nie enger wird als das Grundfenster, damit die Ansicht nicht bei jedem
// Tageswechsel eine andere Höhe hat.
export function zeitfenster(
  zeitraeume: Zeitraum[],
  grundVon = 7,
  grundBis = 19
): { vonStunde: number; bisStunde: number } {
  let von = grundVon;
  let bis = grundBis;
  for (const z of zeitraeume) {
    von = Math.min(von, Math.floor(z.start / 60));
    bis = Math.max(bis, Math.ceil(z.ende / 60));
  }
  return { vonStunde: Math.max(0, von), bisStunde: Math.min(24, Math.max(bis, von + 1)) };
}
