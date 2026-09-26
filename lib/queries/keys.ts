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

  // Alle Fahrzeuge (Lager-Modul und Saisonliste). Getrennt von kundeFahrzeuge: das ist der
  // Ausschnitt für EIN Kundenfenster, das hier der Vollabzug.
  fahrzeuge: () => ["fahrzeuge"] as const,

  mitarbeiter: () => ["mitarbeiter"] as const,
  firmenfahrzeuge: () => ["firmenfahrzeuge"] as const,
  artikel: () => ["artikel"] as const,
  artikelpreise: () => ["artikelpreise"] as const,

  lager: () => ["lager"] as const,
  lagerplaetze: () => ["lagerplaetze"] as const,
  einlagerungen: () => ["einlagerungen"] as const,
  eingelagerteRaeder: () => ["eingelagerte-raeder"] as const,
  lagerKennzahlen: () => ["lager", "kennzahlen"] as const,
  // Reifenverkauf (Migration 61). Ändert sich auch, wenn im Auftrag eine Reifen-Position
  // eingetragen, entfernt oder der Auftrag abgeschlossen wird – die Datenbank zählt dann mit.
  verkaufsreifen: () => ["verkaufsreifen"] as const,

  // Der Briefkopf (Migration 48). Eine einzige Zeile, die auf jeder Rechnung landet – und
  // deshalb genau EINEN Schlüssel hat, nicht einen je Fenster, das sie braucht.
  betrieb: () => ["betrieb"] as const,
  rechnungen: () => ["rechnungen"] as const,
  auftragRechnungen: (orderId: string) => ["auftrag", orderId, "rechnungen"] as const,

  modulrechte: () => ["modulrechte"] as const,

  // Haken bei „Reifen mitnehmen" (Migration 58), je Liste von Einsatztagen.
  gepackt: (daten: string[]) => ["mitnehmen-gepackt", ...daten] as const,
  gepacktAlle: () => ["mitnehmen-gepackt"] as const,
};
