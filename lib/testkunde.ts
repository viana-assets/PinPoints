// Testkunden (Migration 60, 26.09.2026).
//
// Ein Testkunde bekommt keine Kundennummer, seine Aufträge eine negative Nummer aus einer
// eigenen Folge und seine Rechnungen eine negative Nummer mit dem Text „T-RE…". Die Datenbank
// vergibt das alles (Trigger `vergib_auftragsnummer`, `vergib_rechnungsnummer`); hier steht nur,
// wie man es liest. Dieselbe Regel steht in `public.auftrag_nr_text()` (Migration 60) – wer eine
// Stelle ändert, ändert beide.

// Buchstabe vor der Nummer eines Testauftrags.
export const TEST_PRAEFIX = "T";

// Die Auftragsnummer, wie Menschen sie lesen: „1318" oder „T3".
export function auftragsNr(n: number | null | undefined): string {
  if (n == null) return "?";
  return n < 0 ? `${TEST_PRAEFIX}${-n}` : String(n);
}

// Negative Nummer = Testauftrag bzw. Testrechnung.
export function istTestauftrag(o: { order_number: number }): boolean {
  return o.order_number < 0;
}
export function istTestrechnung(r: { nummer: number }): boolean {
  return r.nummer < 0;
}

// Aus Auswertungen, DATEV-Export und Umsatzzahlen bleiben Testdaten immer draußen – sonst
// „blitzt" eine Probe als Umsatz auf. Sichtbar bleiben sie in den Listen, deutlich markiert.
export function ohneTestauftraege<T extends { order_number: number }>(auftraege: T[]): T[] {
  return auftraege.filter((o) => !istTestauftrag(o));
}
export function ohneTestrechnungen<T extends { nummer: number }>(rechnungen: T[]): T[] {
  return rechnungen.filter((r) => !istTestrechnung(r));
}
export function ohneTestkunden<T extends { testkunde?: boolean | null }>(kunden: T[]): T[] {
  return kunden.filter((k) => !k.testkunde);
}
