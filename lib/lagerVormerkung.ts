import type { Order, TireStorage } from "./types";

// Auslagern erst beim Abschließen (Migration 67, v111).
//
// Ein Reifensatz ist entweder im Regal, für einen Auftrag VORGEMERKT oder ausgelagert. Vorgemerkt
// heißt: Die Reifen liegen noch im Fach, belegen ihren Platz weiter und gehen heraus, wenn der
// Auftrag abgeschlossen wird – das erledigt die Datenbank (`auftrag_lager_entnahme()`), nicht
// diese Datei. Stornieren oder Löschen des Auftrags hebt die Vormerkung auf, Wiedereröffnen holt
// die Sätze zurück, wenn ihr Platz noch frei ist.
//
// Reine Funktionen, geprüft in tests/lagerVormerkung.test.ts.

export type SatzZustand = "im_regal" | "vorgemerkt" | "ausgelagert";

export function satzZustand(satz: Pick<TireStorage, "removed_at" | "entnahme_order_id">): SatzZustand {
  if (satz.removed_at) return "ausgelagert";
  return satz.entnahme_order_id ? "vorgemerkt" : "im_regal";
}

export function istVorgemerkt(satz: Pick<TireStorage, "removed_at" | "entnahme_order_id">): boolean {
  return satzZustand(satz) === "vorgemerkt";
}

// Bis wann zählt die Lagergebühr? Bis zum Termin des Auftrags, mit dem der Satz herausgeht – nicht
// bis heute. Wer am 01.10. einen Auftrag für den 08.10. anlegt, hätte sonst eine Woche zu wenig
// berechnet; liegt dazwischen ein Monatswechsel, einen ganzen Monat. Ein Termin in der
// Vergangenheit (nachgetragener Auftrag) zählt bis heute: Bis jetzt lag der Satz ja im Regal.
export function lagerBis(heute: string, auftrag: Pick<Order, "order_date"> | null | undefined): string {
  const termin = auftrag?.order_date?.slice(0, 10);
  return termin && termin > heute ? termin : heute;
}

// Die Sätze, die mit DIESEM Auftrag aus dem Lager gehen oder gegangen sind – vorgemerkt oder schon
// ausgelagert –, in der Reihenfolge, in der sie eingelagert wurden. Damit steht der Platz auch nach
// dem Abschluss noch am Auftrag: Wo lagen die Reifen, die wir am 08.10. gewechselt haben?
export function saetzeAusDemLager(saetze: TireStorage[], auftragId: string): TireStorage[] {
  return saetze
    .filter((t) => t.entnahme_order_id === auftragId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

// Die Sätze, die in diesem Auftrag EINGELAGERT und inzwischen wieder herausgegeben wurden. Im
// Auftrag stehen sonst nur die, die noch liegen – der Platz von damals wäre weg.
export function frueherEingelagert(saetze: TireStorage[], auftragId: string): TireStorage[] {
  return saetze
    .filter((t) => t.order_id === auftragId && !!t.removed_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
