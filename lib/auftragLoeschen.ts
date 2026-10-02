// Darf dieser Auftrag gelöscht werden – und wenn ja, mit welcher Frage? (D2, 02.10.2026)
//
// Bis v99 ließ sich jeder Auftrag mit derselben Rückfrage löschen, auch ein abgerechneter. Die
// Rechnung blieb als Beleg bestehen, war aber über den Auftrag nicht mehr auffindbar. Jetzt:
//
//   * Rechnung vorhanden → NICHT löschen. Der Auftrag ist der Weg zur Rechnung.
//   * erledigt / storniert → löschen geht, aber mit einer Frage, die sagt, was dabei verloren geht.
//   * sonst → die bisherige Rückfrage.
//
// Die Datenbank erzwingt den ersten Fall zusätzlich (Migration 62, `pruefe_auftrag_loeschen()`),
// auch für Rechnungen, die der Auftrag nach einem Storno nicht mehr als Nummer trägt. Die
// Oberfläche bietet nur gar nicht erst an, was die Datenbank ablehnen würde – sie ersetzt sie
// nicht. Wer eine der beiden Stellen ändert, ändert beide.

import type { Order } from "./types";
import { auftragsNr } from "./testkunde";

export type LoeschPruefung =
  | { erlaubt: false; grund: string }
  | { erlaubt: true; frage: string };

export function auftragLoeschPruefung(o: Pick<Order, "order_number" | "status" | "rechnung_nummer">): LoeschPruefung {
  const nr = auftragsNr(o.order_number);
  if (o.rechnung_nummer) {
    return {
      erlaubt: false,
      grund: `Auftrag ${nr} ist abgerechnet (Rechnung ${o.rechnung_nummer}) und wird nicht gelöscht – über ihn findet man die Rechnung.`,
    };
  }
  if (o.status === "erledigt") {
    return {
      erlaubt: true,
      frage: `Auftrag ${nr} ist erledigt. Wirklich löschen? Er fehlt danach in allen Listen und Auswertungen.`,
    };
  }
  if (o.status === "storniert") {
    return {
      erlaubt: true,
      frage: `Auftrag ${nr} ist storniert und bleibt mit seinem Grund in der Liste. Wirklich ganz löschen?`,
    };
  }
  return { erlaubt: true, frage: `Auftrag ${nr} wirklich löschen?` };
}
