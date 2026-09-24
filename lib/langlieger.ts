import type { TireStorage } from "./types";
import { lagermonate } from "./helpers";

// Die Langlieger-Übersicht (Fahrplan E4, gebaut am 23.09.2026).
//
// Die Schwellen gab es schon (`LANGLIEGER_MONATE`, `LANGLIEGER_EURO` in lib/helpers.ts) – sie
// griffen aber nur im Auslagern-Dialog, also erst in dem Moment, in dem jemand den Satz ohnehin
// in der Hand hat. Ein vergessener Satz wird genau dann nie ausgelagert. Diese Liste dreht das
// um: Sie zeigt ALLE liegenden Sätze, die eine der Schwellen reißen, bevor jemand zufällig
// darüber stolpert. Das ist unmittelbar Umsatz – oder ein Regalplatz, der frei werden kann.
//
// Dieselbe Rechnung wie beim Auslagern: `lagermonate()` (angefangener Monat zählt voll) mal der
// heute gültige Monatspreis der Lagergebühr. Ohne gepflegten Preis bleibt der Betrag leer und
// nur die Monatsschwelle zählt – eine geratene Summe wäre schlimmer als keine.

export type LangliegerZeile = {
  satz: TireStorage;
  monate: number;
  // Gebühr bis heute, netto. null = kein Preis für die Lagergebühr gepflegt.
  summeNetto: number | null;
};

export function langlieger(
  saetze: TireStorage[],
  heute: string,
  monatspreisNetto: number | null,
  abMonaten: number,
  abEuro: number | null
): LangliegerZeile[] {
  return saetze
    .filter((s) => !s.removed_at)
    .map((satz) => {
      const monate = lagermonate(satz.created_at, heute);
      return { satz, monate, summeNetto: monatspreisNetto == null ? null : monate * monatspreisNetto };
    })
    .filter((z) =>
      z.monate >= abMonaten || (abEuro != null && z.summeNetto != null && z.summeNetto >= abEuro)
    )
    // Die ältesten zuerst: Wer am längsten liegt, ist am wahrscheinlichsten vergessen.
    .sort((a, b) => b.monate - a.monate || a.satz.created_at.localeCompare(b.satz.created_at));
}
