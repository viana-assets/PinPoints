import type { PlatzGroesse, Saison, StorageSlot, TireStorage, Verkaufsreifen, Warehouse } from "./types";
import { lagerplatzIdAusCode, satzIdAusCode, verkaufsreifenIdAusCode } from "./aufkleberCode";
import { groesseAusText, groesseText, type Reifengroesse } from "./reifenverkauf";

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

// `verkauf`: Auf dem Platz liegen Verkaufsreifen (Migration 61). Dann ist er nicht frei, auch
// wenn kein Kundensatz darauf liegt – Prüfen und Saison betreffen nur Kundensätze.
export function passtZumFilter(satz: TireStorage | null, gruende: string[], filter: LagerFilter, verkauf = false): boolean {
  if (filter === "alle") return true;
  if (filter === "frei") return !satz && !verkauf;
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
  | { art: "verkauf"; postenId: string }   // Etikett an einem Verkaufsreifen (E17)
  | { art: "unbekannt" }   // ein PinPoints-Code, aber nicht (mehr) in diesem Bestand
  | { art: "fremd" };      // gar kein PinPoints-Aufkleber (Paketaufkleber, Reifenetikett …)

export function scanZiel(
  text: string, plaetze: Pick<StorageSlot, "id">[], saetze: Pick<TireStorage, "id" | "storage_slot_id" | "customer_id" | "removed_at">[],
  posten: Pick<Verkaufsreifen, "id">[] = []
): ScanZiel {
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
  const postenId = verkaufsreifenIdAusCode(text);
  if (postenId) return posten.some((p) => p.id === postenId) ? { art: "verkauf", postenId } : { art: "unbekannt" };
  return { art: "fremd" };
}

// ---------------------------------------------------------------- Auslastung (E11, v102)
//
// Ab welchem Anteil belegter Plätze ein Lager als „fast voll" gilt. Dann färbt sich sein Knopf in
// der Lagerseite, darunter steht, wie viele Plätze noch frei sind, und das Dashboard nennt es
// unter „Zu erledigen". Ein Lager ohne Plätze (das Lager „Zuhause") zählt nicht.
export const LAGER_VOLL_AB = 0.9;

export type LagerStand = { id: string; name: string; belegt: number; gesamt: number; anteil: number; voll: boolean };

export function lagerAuslastung(lager: Pick<Warehouse, "id" | "name">[], plaetze: Pick<StorageSlot, "id" | "warehouse_id">[], belegt: Set<string>): LagerStand[] {
  return lager.map((w) => {
    const eigene = plaetze.filter((s) => s.warehouse_id === w.id);
    const b = eigene.filter((s) => belegt.has(s.id)).length;
    const anteil = eigene.length > 0 ? b / eigene.length : 0;
    return { id: w.id, name: w.name, belegt: b, gesamt: eigene.length, anteil, voll: eigene.length > 0 && anteil >= LAGER_VOLL_AB };
  });
}

export function auslastungText(s: LagerStand): string {
  const frei = s.gesamt - s.belegt;
  return `${s.name} ist zu ${Math.round(s.anteil * 100)} % belegt – ${frei === 0 ? "kein Platz mehr frei" : frei === 1 ? "noch 1 Platz frei" : `noch ${frei} Plätze frei`}.`;
}

// ---------------------------------------------------------------- Fachgröße (E12, v103)
//
// Ein Lagerplatz ist ein normales oder ein großes Fach (Migration 64). Wann ein Reifen ein großes
// braucht, entscheiden zwei Maße: der Außendurchmesser (wie hoch der Stapel im Fach wird, wenn die
// Räder stehen, bzw. ob er hineinpasst, wenn sie liegen) und die Breite (vier liegende Räder
// übereinander). Beide Grenzen sind Startwerte – nach dem ersten Saisonwechsel am echten Regal
// nachmessen und hier anpassen.
//
//   205/55 R16 → 632 mm, 205 breit  → normal
//   235/55 R17 → 690 mm             → normal
//   255/55 R18 → 738 mm             → groß
//   275/45 R20 → 756 mm, 275 breit  → groß
export const GROSSES_FACH_AB_DURCHMESSER_MM = 720;
export const GROSSES_FACH_AB_BREITE_MM = 265;

// Fehlt der Querschnitt („195 R14 C"), gilt der übliche Wert solcher Reifen: 80 %.
const QUERSCHNITT_OHNE_ANGABE = 80;

export function reifenDurchmesserMm(g: Reifengroesse): number {
  return Math.round(g.zoll * 25.4 + 2 * g.breite * (g.querschnitt ?? QUERSCHNITT_OHNE_ANGABE) / 100);
}

// Braucht diese Reifengröße ein großes Fach? Nicht lesbar oder leer → nein: Ohne Größe gibt es
// nichts zu warnen, und „vielleicht groß" wäre bei jedem Altbestand ohne Größe Lärm.
export function brauchtGrossesFach(groesse: string | null | undefined): boolean {
  const g = groesseAusText(groesse);
  if (!g) return false;
  return reifenDurchmesserMm(g) >= GROSSES_FACH_AB_DURCHMESSER_MM || g.breite >= GROSSES_FACH_AB_BREITE_MM;
}

export function platzGroesse(slot: Pick<StorageSlot, "groesse">): PlatzGroesse {
  return slot.groesse === "gross" ? "gross" : "normal";
}

// Der Hinweis, wenn ein großer Reifen in ein normales Fach soll – ein Hinweis, keine Sperre: Wer
// davorsteht und sieht, dass es passt, darf. Null, wenn nichts zu sagen ist.
export function platzZuKlein(slot: Pick<StorageSlot, "groesse" | "code">, groesse: string | null | undefined): string | null {
  if (platzGroesse(slot) === "gross" || !brauchtGrossesFach(groesse)) return null;
  const g = groesseAusText(groesse)!;
  return `Großes Fach nötig: ${groesseText(g)} (Ø ${reifenDurchmesserMm(g)} mm) – Platz ${slot.code} ist ein normales Fach`;
}

// Die freien Plätze in der Reihenfolge, in der sie angeboten werden: Für einen großen Reifen die
// großen Fächer zuerst, für alle anderen die normalen – damit die wenigen großen frei bleiben für
// die Reifen, die sie brauchen. Innerhalb der Gruppe bleibt die bisherige Reihenfolge.
export function plaetzeFuerReifen<T extends Pick<StorageSlot, "groesse">>(plaetze: T[], gross: boolean): T[] {
  const passend = plaetze.filter((p) => (platzGroesse(p) === "gross") === gross);
  const andere = plaetze.filter((p) => (platzGroesse(p) === "gross") !== gross);
  return [...passend, ...andere];
}
