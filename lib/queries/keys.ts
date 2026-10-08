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
  // Verfügbarkeit der Mitarbeiter (Migration 68). Was davon zurückkommt, entscheidet die Rolle.
  verfuegbarkeiten: () => ["verfuegbarkeiten"] as const,
  artikel: () => ["artikel"] as const,
  artikelpreise: () => ["artikelpreise"] as const,
  // Auftragsvorlagen (Migration 63, E6).
  vorlagen: () => ["vorlagen"] as const,

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
  // Fahrzeuge am Auftrag (Migration 44) – seit v113 eine Abfrage statt eines Zustands, damit sie im
  // Offline-Speicher landet (Offline Runde 2).
  auftragFahrzeuge: (orderId: string) => ["auftrag", orderId, "fahrzeuge"] as const,
  // Der Vorrat für unterwegs (v113): Fahrzeuge am Auftrag und Fahrzeuge der Kunden für die
  // kommenden offenen Aufträge, einmal geladen, solange Netz da ist.
  einsatzVorrat: () => ["einsatz-vorrat"] as const,
  // Fotos und Unterschrift am Auftrag (Migration 65, E3).
  auftragBelege: (orderId: string) => ["auftrag", orderId, "belege"] as const,
  // Die zeitlich begrenzten Anzeige-Links dazu – je Satz Pfade ein Eintrag.
  belegLinks: (pfade: string[]) => ["beleglinks", ...pfade] as const,

  modulrechte: () => ["modulrechte"] as const,

  // Team-Chat (Migration 80). Der Oberbegriff trifft Verlauf, Zahl und Personen zugleich – eine neue
  // Nachricht ändert Verlauf und Zahl auf einmal.
  chat: () => ["chat"] as const,
  chatNachrichten: () => ["chat", "nachrichten"] as const,
  // Eine Unterhaltung (Migration 84): Team (`null`) oder Einzelchat mit `partner`, `anzahl` wächst mit
  // „Ältere laden“. Liegt unter chatNachrichten – dessen Ungültigmachen trifft alle Unterhaltungen.
  chatVerlauf: (partner: string | null, anzahl: number) => ["chat", "nachrichten", partner ?? "team", anzahl] as const,
  chatUnterhaltungen: () => ["chat", "unterhaltungen"] as const,
  // Anzeige-Links der Chatfotos. Bewusst NICHT unter „chat“: Jede neue Nachricht macht „chat“
  // ungültig, die Links sollen aber eine Stunde halten (sonst lädt jedes Bild neu).
  chatFotoLinks: (pfade: string[]) => ["chatfotolinks", ...pfade] as const,
  chatUngelesen: () => ["chat", "ungelesen"] as const,
  chatPersonen: () => ["chat", "personen"] as const,

  // Zeiterfassung (Migration 82). Der Oberbegriff trifft Stempeluhr, Wochen und Personen zugleich –
  // eine Stempelung ändert alles davon.
  zeit: () => ["zeit"] as const,
  zeitStatus: () => ["zeit", "status"] as const,
  zeitSchichten: (montag: string) => ["zeit", "schichten", montag] as const,
  zeitOffene: () => ["zeit", "offene"] as const,
  zeitPersonen: () => ["zeit", "personen"] as const,
  // Migration 83 (v136): der Monat, Urlaub je Zeitraum, Korrekturen je Person.
  zeitMonat: (monat: string) => ["zeit", "monat", monat] as const,
  zeitUrlaub: (vonTag: string, bisTag: string) => ["zeit", "urlaub", vonTag, bisTag] as const,
  zeitKorrekturen: (profileId: string, ab: string) => ["zeit", "korrekturen", profileId, ab] as const,

  // Haken bei „Reifen mitnehmen" (Migration 58), je Liste von Einsatztagen.
  gepackt: (daten: string[]) => ["mitnehmen-gepackt", ...daten] as const,
  gepacktAlle: () => ["mitnehmen-gepackt"] as const,
};
