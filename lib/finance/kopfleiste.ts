// Finance am Rechner: Kopfleiste, Statuszeile und Zähler in der Seitenleiste (v187, docs/finance.md Abschnitt 22) –
// die Regeln ohne React. Wirtschaftsjahr und Periode gelten für alle Seiten; die Suche (F2) findet Seiten, Konten,
// Personen und Buchungen; die Statuszeile zeigt, was offen ist. Geprüft in tests/financeKopfleiste.test.ts.
//
// Entwurf: Claude outputs/Mockup_Finance_StufeA_v1.html (Kopfleiste, Statuszeile, Zähler an „Belegeingang“, „Bank“).

import { kontoNr, type FinFestschreibung, type FinKonto } from "./buchung";
import { kontoVorschlaege } from "./arbeitsplatz";
import { zeitraumVorgaben, type Zeitraum } from "./kontoblatt";
import { belegZustand, type FinBeleg } from "./belege";
import type { FinPersonenkonto } from "./personen";
import type { FinanceSeite, FinanceSeiteKey } from "./seiten";
import { MONATSNAMEN } from "./auswertungen";

// ---------------------------------------------------------------- Wirtschaftsjahr und Periode
// Zur Wahl: zwei Jahre zurück (Abschluss, Kanzlei) und das nächste (Vorbereitung im Dezember). Neueste oben.
export const FIN_WJ_ZURUECK = 2;
export function wjAuswahl(laufend: number): number[] {
  return Array.from({ length: FIN_WJ_ZURUECK + 2 }, (_, i) => laufend + 1 - i);
}

// Periode als Schlüssel aus `zeitraumVorgaben` (lib/finance/kontoblatt.ts): „jahr“, „q1“–„q4“, „m1“–„m12“.
export type Periode = string;
export const FIN_PERIODE_JAHR: Periode = "jahr";

export function periodeZeitraum(jahr: number, p: Periode): Zeitraum {
  const v = zeitraumVorgaben(jahr);
  const t = v.find((x) => x.key === p) ?? v[0];
  return { von: t.von, bis: t.bis };
}

// Die Periode als Monate für die Auswertungen (Summen & Salden von–bis, BWA bis). Ganzes Jahr: bis zum laufenden Monat.
export function periodeMonate(p: Periode, laufend: number): { von: number; bis: number } {
  const q = /^q([1-4])$/.exec(p);
  if (q) return { von: Number(q[1]) * 3 - 2, bis: Number(q[1]) * 3 };
  const m = /^m(1[0-2]|[1-9])$/.exec(p);
  if (m) return { von: Number(m[1]), bis: Number(m[1]) };
  return { von: 1, bis: laufend };
}

// Für den Journalfilter: ganzes Jahr = kein Zeitraumfilter.
export function periodeFilter(jahr: number, p: Periode): { von: string | null; bis: string | null } {
  if (p === FIN_PERIODE_JAHR) return { von: null, bis: null };
  const z = periodeZeitraum(jahr, p);
  return { von: z.von, bis: z.bis };
}

// ---------------------------------------------------------------- Suche (F2)
export type SuchZiel =
  | { art: "seite"; seite: FinanceSeiteKey }
  | { art: "konto"; konto: number }
  | { art: "person"; nummer: number }
  | { art: "journal"; text: string };
export type SuchTreffer = { key: string; titel: string; unter: string; ziel: SuchZiel };

export const FIN_SUCHE_JE_ART = 5;

// Reihenfolge: Seiten, Konten, Personen, zuletzt „im Journal suchen“ (immer da, sobald etwas getippt ist).
// Konten und Personen nur, wenn die Person Buchungen sehen darf (`buchungen`).
export function globaleSuche(eingabe: string, d: {
  seiten: readonly FinanceSeite[]; konten: readonly FinKonto[]; personen: readonly FinPersonenkonto[]; buchungen: boolean;
}): SuchTreffer[] {
  const t = eingabe.trim();
  if (!t) return [];
  const klein = t.toLowerCase();
  const seiten = d.seiten.filter((s) => s.label.toLowerCase().startsWith(klein) || s.label.toLowerCase().split(/[\s&]+/).some((w) => w.startsWith(klein)))
    .slice(0, 3).map((s): SuchTreffer => ({ key: `s:${s.key}`, titel: s.label, unter: "Seite", ziel: { art: "seite", seite: s.key } }));
  if (!d.buchungen) return seiten;
  const konten = kontoVorschlaege([...d.konten], t, FIN_SUCHE_JE_ART)
    .map((k): SuchTreffer => ({ key: `k:${k.nummer}`, titel: `${kontoNr(k.nummer)} ${k.bezeichnung}`, unter: "Kontoblatt", ziel: { art: "konto", konto: k.nummer } }));
  const ziffern = /^\d+$/.test(t);
  const personen = d.personen
    .filter((p) => (ziffern ? String(p.nummer).startsWith(t) || String(p.kundennummer ?? "").startsWith(t) : p.name.toLowerCase().includes(klein)))
    .sort((a, b) => (ziffern ? a.nummer - b.nummer : Number(!a.name.toLowerCase().startsWith(klein)) - Number(!b.name.toLowerCase().startsWith(klein)) || a.name.localeCompare(b.name, "de")))
    .slice(0, FIN_SUCHE_JE_ART)
    .map((p): SuchTreffer => ({ key: `p:${p.nummer}`, titel: `${p.nummer} ${p.name}`, unter: p.art === "debitor" ? "Debitor · Buchungen im Journal" : "Kreditor · Buchungen im Journal",
      ziel: { art: "person", nummer: p.nummer } }));
  return [...seiten, ...konten, ...personen, { key: "j", titel: `„${t}“ im Journal suchen`, unter: "Text, Beleg, Betrag", ziel: { art: "journal", text: t } }];
}

// ---------------------------------------------------------------- Festgeschrieben bis
// Der letzte Monat, bis zu dem ab Januar lückenlos festgeschrieben ist (0 = noch nichts).
export function festgeschriebenBis(fest: readonly FinFestschreibung[], jahr: number): number {
  const monate = new Set(fest.filter((f) => f.jahr === jahr).map((f) => f.monat));
  let bis = 0;
  while (monate.has(bis + 1)) bis++;
  return bis;
}

// Im Mockup „Dezember 2026“ – auch wenn das Jahr gewechselt hat, steht hier das gewählte Jahr.
export function festText(bis: number, jahr: number): string {
  return bis ? `${MONATSNAMEN[bis - 1]} ${jahr}` : "noch nichts";
}

// ---------------------------------------------------------------- Zähler und Statuszeile
export type FinanceStand = {
  // Belegeingang: Entwürfe (Fotos, PDFs, E-Rechnungen, die noch gebucht werden müssen).
  belegeOffen: number | null;
  // Bankumsätze ohne Zuordnung.
  bankOffen: number | null;
  // Überfällige Kunden-Rechnungen und Lieferantenbelege zusammen.
  opUeberfaellig: number | null;
  festBis: number | null;
};

export function financeStand(d: {
  belege?: readonly FinBeleg[] | null; bankStatus?: readonly { status: string }[] | null; rechnungenUeberfaellig?: number | null;
  fest?: readonly FinFestschreibung[] | null; jahr: number; heute: string;
}): FinanceStand {
  const belege = d.belege ? d.belege.map((b) => belegZustand(b, d.heute)) : null;
  const belegeUeber = belege ? belege.filter((z) => z.art === "ueberfaellig").length : null;
  return {
    belegeOffen: belege ? belege.filter((z) => z.art === "entwurf").length : null,
    bankOffen: d.bankStatus ? d.bankStatus.filter((u) => u.status === "offen").length : null,
    opUeberfaellig: belegeUeber == null && d.rechnungenUeberfaellig == null ? null : (belegeUeber ?? 0) + (d.rechnungenUeberfaellig ?? 0),
    festBis: d.fest ? festgeschriebenBis(d.fest, d.jahr) : null,
  };
}

// Die Zahl hinter einem Eintrag der Seitenleiste – nur, wenn es etwas zu tun gibt.
export function navZahl(key: FinanceSeiteKey, s: FinanceStand): number | null {
  const n = key === "belege" ? s.belegeOffen : key === "bank" ? s.bankOffen : key === "op" ? s.opUeberfaellig : null;
  return n ? n : null;
}
