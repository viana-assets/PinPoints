import type { Order, StorageSlot, TireStorage, Warehouse } from "./types";
import type { MitnehmenEintrag } from "./mitnehmen";
import { lagermonate } from "./helpers";

// Stapel-Auslagern für den Saisonwechsel (Fahrplan E7, v104).
//
// Beim Saisonwechsel gingen bisher alle Sätze eines Tages einzeln durch den Auslagern-Dialog. Der
// geführte Modus nimmt die Mitnehmen-Liste des Tages (`mitnehmenListe`, lib/mitnehmen.ts – dieselbe
// Regel wie Abendhinweis und Mitnehmen-Fenster) und führt in der Reihenfolge des REGALS durch:
// erst Lager, dann Platz – so, wie man an den Regalen entlanggeht, nicht in der Reihenfolge der
// Termine. Je Satz ein Tipp: „Ausgelagert" (mit der Lagergebühr auf den Auftrag des Tages) oder
// „Überspringen".
//
// Reine Funktionen, geprüft in tests/stapelAuslagern.test.ts.

export type StapelSchritt = {
  satz: TireStorage;
  auftrag: Order;
  platz: StorageSlot | null;
  lagerName: string;
};

export function stapelSchritte(eintraege: MitnehmenEintrag[], plaetze: StorageSlot[], lager: Warehouse[]): StapelSchritt[] {
  const schritte: StapelSchritt[] = [];
  for (const e of eintraege) {
    for (const satz of e.saetze) {
      const platz = plaetze.find((p) => p.id === satz.storage_slot_id) ?? null;
      const lagerName = (platz && lager.find((w) => w.id === platz.warehouse_id)?.name) || "Lager unbekannt";
      schritte.push({ satz, auftrag: e.auftrag, platz, lagerName });
    }
  }
  return schritte.sort((a, b) =>
    a.lagerName.localeCompare(b.lagerName, "de")
    || (a.platz?.code ?? "~").localeCompare(b.platz?.code ?? "~", "de", { numeric: true })
    || a.satz.id.localeCompare(b.satz.id));
}

export type GebuehrVorschlag = { monate: number; summe: number | null; an: boolean; grund: string | null };

// Die Lagergebühr für einen Satz, wie der Auslagern-Dialog sie vorschlägt: angefangene Monate seit
// dem Einlagern mal Monatspreis. Aus ist sie, wenn es keinen Preis gibt oder auf dem Auftrag schon
// eine Lagergebühr steht (dann hat jemand sie vorher eingetragen – zweimal wäre zu viel).
export function gebuehrVorschlag(satz: Pick<TireStorage, "created_at">, heute: string, monatspreis: number | null, schonGebucht: boolean): GebuehrVorschlag {
  const monate = lagermonate(satz.created_at, heute);
  const summe = monatspreis != null ? Math.round(monatspreis * monate * 100) / 100 : null;
  if (monatspreis == null) return { monate, summe, an: false, grund: "kein Preis für die Lagergebühr gepflegt" };
  if (schonGebucht) return { monate, summe, an: false, grund: "auf dem Auftrag steht schon eine Lagergebühr" };
  return { monate, summe, an: true, grund: null };
}
