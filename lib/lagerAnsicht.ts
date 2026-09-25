import type { Saison, StorageSlot, TireStorage } from "./types";
import { lagerplatzIdAusCode, satzIdAusCode } from "./aufkleberCode";

// Die Regeln hinter der neu gestalteten Lagerseite (26.09.2026, Entwurf „H · Lager").
//
// Die Seite selbst (components/lager/LagerPanel.tsx) zeichnet nur. Was ein Filter heißt, wie
// eine Reihe überschrieben wird und wohin ein gescannter Code führt, steht hier – als reine
// Funktionen, geprüft in tests/lagerAnsicht.test.ts.

// ---------------------------------------------------------------- Filter
//
// Eine Zeile Filter statt Suchfeld + Schalter + Wand/Liste. „Zu prüfen" ist der frühere
// Schalter „nur Handlungsbedarf" – dieselbe Regel (`handlungsgruende` in lib/helpers.ts), nur
// kürzer benannt. Die Saisons zeigen nur belegte Plätze: Ein freier Platz hat keine Saison.
export type LagerFilter = "alle" | "pruefen" | "frei" | Saison;

export function passtZumFilter(satz: TireStorage | null, gruende: string[], filter: LagerFilter): boolean {
  if (filter === "alle") return true;
  if (filter === "frei") return !satz;
  if (filter === "pruefen") return !!satz && gruende.length > 0;
  return !!satz && satz.saison === filter;
}

// ---------------------------------------------------------------- Reihen
//
// „Reihe A" für ein Präfix, „Ohne Reihe" für Plätze ohne erkennbares Präfix – und wenn das
// ganze Lager nur aus solchen Plätzen besteht, schlicht „Alle Plätze": Eine einzige namenlose
// Reihe ist keine Reihe, sondern das Lager.
export function reiheTitel(reihe: string, anzahlReihen: number): string {
  if (reihe) return `Reihe ${reihe}`;
  return anzahlReihen <= 1 ? "Alle Plätze" : "Ohne Reihe";
}

// ---------------------------------------------------------------- Scannen
//
// Der Scan-Knopf im Lager nimmt BEIDE Aufkleber an: den am Regal (welcher Platz ist das?) und
// das Etikett am Satz (wem gehört der hier?). Das ist dieselbe Weiche wie beim Aufruf über die
// Handy-Kamera (`?lagerplatz=` / `?satz=`, app/page.tsx) – nur ohne Umweg über die Adresszeile.
//
// Ein Satz, der noch liegt, führt zu seinem PLATZ; einer, der schon ausgelagert ist, zum
// Kunden – auf seinem alten Platz liegt womöglich längst der Satz eines anderen.
export type ScanZiel =
  | { art: "platz"; slotId: string }
  | { art: "kunde"; kundeId: string }
  | { art: "unbekannt" }   // ein PinPoints-Code, aber nicht (mehr) in diesem Bestand
  | { art: "fremd" };      // gar kein PinPoints-Aufkleber (Paketaufkleber, Reifenetikett …)

export function scanZiel(text: string, plaetze: Pick<StorageSlot, "id">[], saetze: Pick<TireStorage, "id" | "storage_slot_id" | "customer_id" | "removed_at">[]): ScanZiel {
  const platzId = lagerplatzIdAusCode(text);
  if (platzId) {
    return plaetze.some((p) => p.id === platzId) ? { art: "platz", slotId: platzId } : { art: "unbekannt" };
  }
  const satzId = satzIdAusCode(text);
  if (satzId) {
    const satz = saetze.find((s) => s.id === satzId);
    if (!satz) return { art: "unbekannt" };
    if (!satz.removed_at && plaetze.some((p) => p.id === satz.storage_slot_id)) return { art: "platz", slotId: satz.storage_slot_id };
    return { art: "kunde", kundeId: satz.customer_id };
  }
  return { art: "fremd" };
}
