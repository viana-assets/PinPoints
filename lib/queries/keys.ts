import type { AuftragsFenster } from "@/lib/api/orders";

// Zentrale Query-Schlüssel (Roadmap Phase 10). Ein Schlüssel identifiziert einen Datenbestand
// im Zwischenspeicher; nach einer Änderung wird gezielt der betroffene Schlüssel für ungültig
// erklärt, statt wie vorher die komplette Tabelle neu zu laden.
//
// Konstanten-Regel (siehe docs/README.md): Schlüssel werden ausschließlich hier gebildet und
// überall per Funktion referenziert – nie als Zeichenketten-Array an einer zweiten Stelle
// hingeschrieben, sonst laufen Laden und Ungültigmachen irgendwann auseinander.
export const qk = {
  kunden: () => ["kunden"] as const,
  kundeFahrzeuge: (kundeId: string) => ["kunde", kundeId, "fahrzeuge"] as const,
  kundeAuftraege: (kundeId: string) => ["kunde", kundeId, "auftraege"] as const,
  kundeHistorie: (kundeId: string) => ["kunde", kundeId, "historie"] as const,

  auftraege: (fenster: AuftragsFenster) => ["auftraege", fenster] as const,
  // Oberbegriff zum Ungültigmachen: trifft alle Zeitfenster auf einmal.
  auftraegeAlle: () => ["auftraege"] as const,

  mitarbeiter: () => ["mitarbeiter"] as const,
  artikel: () => ["artikel"] as const,
  artikelpreise: () => ["artikelpreise"] as const,

  lager: () => ["lager"] as const,
  lagerplaetze: () => ["lagerplaetze"] as const,
  einlagerungen: () => ["einlagerungen"] as const,
  lagerKennzahlen: () => ["lager", "kennzahlen"] as const,

  modulrechte: () => ["modulrechte"] as const,
};
