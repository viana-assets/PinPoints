import type { StorageSlot, TireStorage, Vehicle, Warehouse } from "./types";

// Die eingelagerten Sätze EINES Kunden als Liste (25.09.2026).
//
// Anlass: Firmenkunden mit zehn und mehr Sätzen. Bis hierher stand der Lagerplatz nur beim
// jeweiligen Fahrzeug im Kundenfenster – verstreut zwischen den Autos, und ein Satz ohne
// zugeordnetes Fahrzeug (Altbestand, Migration 30) tauchte dort gar nicht auf. Die Frage am
// Regal ist aber „was liegt von dieser Firma wo?", und die beantwortet eine Liste.
//
// Sortiert nach Lager und Lagerplatz, nicht nach Kennzeichen: Man geht die Liste im Regal ab.
// Die Platznummern werden NATÜRLICH verglichen („A-2" vor „A-10", „17" vor „20") – eine
// reine Zeichenfolgen-Sortierung stellte „100" vor „17".

export type EingelagerterSatz = {
  satz: TireStorage;
  lager: string;
  platz: string;
  platzId: string;
  fahrzeug: Vehicle | null;
};

export function eingelagerteSaetze(
  saetze: TireStorage[],
  plaetze: StorageSlot[],
  lager: Warehouse[],
  fahrzeuge: Vehicle[]
): EingelagerterSatz[] {
  return saetze
    .filter((s) => !s.removed_at)
    .map((satz) => {
      const platz = plaetze.find((p) => p.id === satz.storage_slot_id);
      const halle = platz ? lager.find((w) => w.id === platz.warehouse_id) : undefined;
      return {
        satz,
        lager: halle?.name ?? "?",
        platz: platz?.code ?? "?",
        platzId: satz.storage_slot_id,
        fahrzeug: satz.vehicle_id ? fahrzeuge.find((v) => v.id === satz.vehicle_id) ?? null : null,
      };
    })
    .sort((a, b) =>
      a.lager.localeCompare(b.lager, "de", { numeric: true })
      || a.platz.localeCompare(b.platz, "de", { numeric: true, sensitivity: "base" }));
}
