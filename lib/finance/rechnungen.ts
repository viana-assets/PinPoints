// Finance F3 (Migration 89, v147): Rechnungen mit „Rechnung nötig“ und offene Posten – die Regeln ohne
// Datenbank, geprüft in tests/financeRechnungen.test.ts. Gebucht wird in der Datenbank (Trigger an
// `rechnungen`, `fin_rechnung_erfassen()`); hier steht nur, wie Finance › Rechnungen die Daten ordnet.

import type { Kontenrahmen } from "./einstellungen";

// Zahlungsziel ab Rechnungsdatum. Dieselbe Zahl steht in `fin_rechnung_erfassen()` (Migration 89,
// `r.datum + 14`) – wer sie ändert, ändert beide.
export const FIN_ZAHLUNGSZIEL_TAGE = 14;

// Konten, auf die eine Rechnung gebucht wird – wie `fin_rechnung_konto()` in Migration 89.
export const FIN_RECHNUNG_KONTEN: Record<Kontenrahmen, Record<"forderung" | "kasse" | "bank" | "erloes19" | "erloes7" | "erloes0" | "erloes_klein", number>> = {
  skr03: { forderung: 1400, kasse: 1000, bank: 1200, erloes19: 8400, erloes7: 8300, erloes0: 8200, erloes_klein: 8195 },
  skr04: { forderung: 1200, kasse: 1600, bank: 1800, erloes19: 4400, erloes7: 4300, erloes0: 4200, erloes_klein: 4185 },
};

export type FinVorgang = {
  order_id: string;
  order_number: number;
  datum: string;
  zeit: string | null;
  status: "offen" | "in_arbeit" | "erledigt";
  kunde: string;
  kundennummer: number | null;
  // Schätzung aus den Leistungen (brutto) – die Rechnung entscheidet.
  betrag: number;
};

export type FinRechnungStatus = "offen" | "gebucht" | "fehler" | "storniert";

export type FinRechnungZeile = {
  rechnung_id: string;
  nummer_text: string;
  datum: string;
  brutto: number;
  order_id: string | null;
  order_number: number | null;
  kunde: string;
  storniert: boolean;
  storno_nummer: string | null;
  // „offen“ = Finance hat die Rechnung noch nicht gesehen (Haken kam später, ältere Rechnung).
  status: FinRechnungStatus;
  fehler: string | null;
  faellig_am: string | null;
  bezahlt_am: string | null;
  bezahlt_art: "bar" | "bank" | "skonto" | null;
  // Schon bezahlter Teil (Teilzahlungen, Migration 93); bezahlt ist die Rechnung erst mit `bezahlt_am`.
  teilbezahlt?: number;
  buchung_nr: number | null;
};

const cent = (n: number) => Math.round(n * 100) / 100;

// Was an einer Rechnung noch offen ist – wie `brutto - fin_teilbezahlt()` in Migration 93.
export function rechnungRest(r: Pick<FinRechnungZeile, "brutto" | "teilbezahlt" | "bezahlt_am">): number {
  return r.bezahlt_am ? 0 : cent(Number(r.brutto) - Number(r.teilbezahlt ?? 0));
}

// Skonto (Migration 98): höchstens dieser Anteil am Bruttobetrag – wie die Grenze in `fin_skonto_buchen()`.
export const FIN_SKONTO_HOECHST = 0.1;

// Was gegen einen Skontoabzug spricht – oder null. `bisher`: schon abgezogener Skonto.
export function skontoMangel(betrag: number | null, rest: number, brutto: number, bisher = 0): string | null {
  if (betrag == null || !(betrag > 0)) return "Den Skontobetrag eintragen.";
  if (Math.abs(betrag * 100 - Math.round(betrag * 100)) > 1e-6) return "Höchstens zwei Nachkommastellen.";
  if (betrag > rest + 1e-9) return `Höher als der offene Rest (${rest.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €).`;
  if (bisher + betrag > cent(brutto * FIN_SKONTO_HOECHST) + 1e-9) return "Mehr als 10 % ist kein Skonto – einen Ausfall oder Nachlass mit dem Steuerberater klären.";
  return null;
}

export type FinAnderswo = { order_id: string; order_number: number; datum: string; kunde: string; rechnung_nummer: string | null };

// `umfang` (Migration 111): ob Finance in diesem Jahr alle Rechnungen bucht oder nur die mit „Rechnung nötig“.
export type FinRechnungenStand = { vorgaenge: FinVorgang[]; rechnungen: FinRechnungZeile[]; anderswo: FinAnderswo[]; umfang: "pilot" | "alle" };

// Vorgemerkt: Haken gesetzt, Auftrag läuft noch. Zu erstellen: erledigt, noch keine Rechnung.
export function vorgaengeTeilen(v: FinVorgang[]): { zuErstellen: FinVorgang[]; vorgemerkt: FinVorgang[] } {
  return {
    zuErstellen: v.filter((x) => x.status === "erledigt"),
    vorgemerkt: v.filter((x) => x.status !== "erledigt"),
  };
}

export type RechnungZustand =
  | { art: "nicht_gebucht"; grund: string | null }
  | { art: "offen"; faellig: string; tage: number; teil: number }
  | { art: "ueberfaellig"; faellig: string; tage: number; teil: number }
  | { art: "bezahlt"; am: string; wie: "bar" | "bank" | "skonto" }
  | { art: "storniert"; bezahlt: boolean };

function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(bis + "T00:00:00Z") - Date.parse(von + "T00:00:00Z")) / 86_400_000);
}

// Wie eine Rechnung in Finance steht. `heute` als JJJJ-MM-TT.
export function rechnungZustand(r: FinRechnungZeile, heute: string): RechnungZustand {
  if (r.status === "storniert" || r.storniert) return { art: "storniert", bezahlt: !!r.bezahlt_am };
  if (r.status !== "gebucht") return { art: "nicht_gebucht", grund: r.status === "fehler" ? r.fehler : null };
  if (r.bezahlt_am && r.bezahlt_art) return { art: "bezahlt", am: r.bezahlt_am, wie: r.bezahlt_art };
  const faellig = r.faellig_am ?? r.datum;
  const tage = tageZwischen(heute, faellig);
  const teil = Number(r.teilbezahlt ?? 0);
  return tage < 0 ? { art: "ueberfaellig", faellig, tage: -tage, teil } : { art: "offen", faellig, tage, teil };
}

export function zustandText(z: RechnungZustand): string {
  switch (z.art) {
    case "nicht_gebucht": return "nicht gebucht";
    case "offen": return (z.tage === 0 ? "fällig heute" : `offen · fällig in ${z.tage} ${z.tage === 1 ? "Tag" : "Tagen"}`) + teilText(z.teil);
    case "ueberfaellig": return `überfällig seit ${z.tage} ${z.tage === 1 ? "Tag" : "Tagen"}` + teilText(z.teil);
    case "bezahlt": return z.wie === "bar" ? "bar bezahlt" : z.wie === "skonto" ? "mit Skonto ausgeglichen" : "überwiesen";
    case "storniert": return z.bezahlt ? "storniert – war bezahlt, Erstattung prüfen" : "storniert";
  }
}

function teilText(teil: number): string {
  return teil > 0 ? ` · ${teil.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € schon beglichen` : "";
}

// Offene Posten: gebucht, nicht bezahlt, nicht storniert – älteste Fälligkeit zuerst. Summen = offener Rest.
export function offenePosten(r: FinRechnungZeile[], heute: string): { posten: (FinRechnungZeile & { zustand: RechnungZustand })[]; summe: number; ueberfaellig: number } {
  const posten = r
    .map((x) => ({ ...x, zustand: rechnungZustand(x, heute) }))
    .filter((x) => x.zustand.art === "offen" || x.zustand.art === "ueberfaellig")
    .sort((a, b) => (a.faellig_am ?? a.datum).localeCompare(b.faellig_am ?? b.datum) || a.nummer_text.localeCompare(b.nummer_text));
  return {
    posten,
    summe: cent(posten.reduce((s, x) => s + rechnungRest(x), 0)),
    ueberfaellig: cent(posten.filter((x) => x.zustand.art === "ueberfaellig").reduce((s, x) => s + rechnungRest(x), 0)),
  };
}

// Was in der Übersicht unter „Zu erledigen“ steht.
export function rechnungenZuErledigen(s: FinRechnungenStand, heute: string): { zuErstellen: number; nichtGebucht: number; ueberfaellig: number } {
  const z = s.rechnungen.map((r) => rechnungZustand(r, heute));
  return {
    zuErstellen: vorgaengeTeilen(s.vorgaenge).zuErstellen.length,
    nichtGebucht: z.filter((x) => x.art === "nicht_gebucht").length,
    ueberfaellig: z.filter((x) => x.art === "ueberfaellig").length,
  };
}

// numeric kommt aus jsonb als Zahl; zur Sicherheit einheitlich.
// Noch nicht gebuchte Rechnungen (für „Alle nachbuchen“): ohne Finance-Stand oder mit Fehler, nicht storniert.
export function nichtGebucht(r: readonly FinRechnungZeile[]): FinRechnungZeile[] {
  return r.filter((x) => x.status === "offen" || x.status === "fehler");
}

export function standLesen(roh: unknown): FinRechnungenStand {
  const s = (roh ?? {}) as Partial<FinRechnungenStand>;
  return {
    vorgaenge: (s.vorgaenge ?? []).map((v) => ({ ...v, betrag: Number(v.betrag) || 0 })),
    rechnungen: (s.rechnungen ?? []).map((r) => ({ ...r, brutto: Number(r.brutto) || 0, teilbezahlt: Number(r.teilbezahlt ?? 0) || 0 })),
    anderswo: s.anderswo ?? [],
    umfang: s.umfang === "alle" ? "alle" : "pilot",
  };
}
