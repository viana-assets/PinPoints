// Suchen über mehrere Felder und eindeutiges Sortieren von Listen.
//
// Bis v105 Teil von lib/helpers.ts (Fahrplan C5, v106: die Datei war auf über 1.100 Zeilen
// gewachsen). lib/helpers.ts reicht alles hier weiter, damit bestehende Importe gültig bleiben;
// neuer Code importiert direkt aus dieser Datei.

// ---------------------------------------------------------------- Suchen
//
// Eine Suche über mehrere Felder eines Datensatzes – gebraucht in der Regalwand („wo liegt
// Müller?") und in der Lagerübersicht („in welchem Lager liegt N-AB 123?").
//
// Drei Entscheidungen, die nicht offensichtlich sind:
//
// 1. ALLE Begriffe müssen vorkommen, nicht irgendeiner. Wer „müller winter" eintippt, meint
//    beides – eine Oder-Suche lieferte dann alle Winterreifen dazu und wäre unbrauchbar.
// 2. Zusätzlich wird ohne Trennzeichen verglichen. „A01" findet „A-01", „NAB123" findet
//    „N-AB 123". Am Handy tippt niemand Bindestriche, und ein Kennzeichen schreibt jeder
//    anders.
// 3. Eine leere Suche trifft alles. Sonst müsste jede Aufrufstelle denselben Sonderfall
//    selbst behandeln.
export function suchtreffer(felder: (string | null | undefined)[], suche: string): boolean {
  const begriffe = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (begriffe.length === 0) return true;
  const heu = felder.filter(Boolean).join(" ").toLowerCase();
  const ohneTrenner = (s: string) => s.replace(/[^a-z0-9äöüß]/g, "");
  const heuOhne = ohneTrenner(heu);
  return begriffe.every((b) => heu.includes(b) || (ohneTrenner(b) !== "" && heuOhne.includes(ohneTrenner(b))));
}

// ---------------------------------------------------------------- Sortieren
//
// Die Auftragsliste lässt sich nach jeder Spalte sortieren. Die Regel steht hier und nicht in
// der Tabelle, weil sie sonst neben der Anzeige läge und beim nächsten Umbau mitwandern
// müsste.
//
// Drei Entscheidungen:
//
// 1. Sortiert wird nach dem WERT, nicht nach dem angezeigten Text. „3.11.2026" steht als Text
//    vor „19.10.2026", als Datum dahinter. Deshalb liefert `sortierWert` je Spalte den Wert,
//    der die Reihenfolge trägt.
// 2. Leere Werte stehen IMMER am Ende, in beiden Richtungen. Ein Auftrag ohne Uhrzeit ist
//    nicht „früh", er hat schlicht keine – und wer nach Uhrzeit sortiert, sucht Termine, nicht
//    Lücken.
// 3. Text wird mit `localeCompare` verglichen, damit „Ä" bei „A" landet und nicht hinter „Z".
export type SortRichtung = "auf" | "ab";

export function vergleiche(a: unknown, b: unknown, richtung: SortRichtung): number {
  const aLeer = a == null || a === "";
  const bLeer = b == null || b === "";
  // Bewusst VOR der Richtung: Leeres bleibt unten, egal wie herum sortiert wird.
  if (aLeer && bLeer) return 0;
  if (aLeer) return 1;
  if (bLeer) return -1;

  let d: number;
  if (typeof a === "number" && typeof b === "number") d = a - b;
  else d = String(a).localeCompare(String(b), "de");
  return richtung === "auf" ? d : -d;
}

export function sortiere<T>(zeilen: T[], wert: (z: T) => unknown, richtung: SortRichtung): T[] {
  // Kopie, nicht an Ort und Stelle: `orders` kommt aus dem Zwischenspeicher und gehört nicht
  // dieser Ansicht. Eine Sortierung, die die Quelle umstellt, wirkt an Stellen, die niemand
  // vermutet.
  return [...zeilen].sort((x, y) => vergleiche(wert(x), wert(y), richtung));
}
