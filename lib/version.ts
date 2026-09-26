// Die Fassung der App und was in jeder Fassung neu ist (26.09.2026).
//
// `APP_VERSION` ist die Fassung des PROGRAMMS, das gerade im Browser läuft. `FASSUNG` in
// public/sw.js ist die des Service Workers. Beide werden bei jeder Auslieferung gemeinsam
// hochgezählt; tests/version.test.ts prüft, dass sie gleich sind. Stehen sie am Gerät
// auseinander, ist nur eine der beiden Dateien hochgeladen worden (CLAUDE.md, Abschnitt 4) –
// deshalb zeigen die Einstellungen beide.
//
// Die Neuigkeiten stehen im Code und nicht in der Datenbank: Sie beschreiben genau dieses
// Programm und kommen mit ihm. Neueste zuerst. Geschrieben für das Büro, nicht für Entwickler.

export const APP_VERSION = "v80";

export type Neuigkeit = {
  version: string;
  datum: string; // JJJJ-MM-TT
  titel: string;
  punkte: string[];
};

export const NEUIGKEITEN: Neuigkeit[] = [
  {
    version: "v80", datum: "2026-09-26", titel: "Handy: zurück aus der Karte",
    punkte: [
      "Behoben: War am Handy die Karte offen, blieb sie beim Tippen auf die untere Leiste stehen – jetzt öffnet jeder Menüpunkt wieder seine Seite, und „Kunden“ antippen führt zurück zur Liste.",
    ],
  },
  {
    version: "v79", datum: "2026-09-26", titel: "Karte und Nadeln neu",
    punkte: [
      "Neue Nadeln in den Farben der Kundenliste; Termine tragen ihre Uhrzeit direkt an der Nadel.",
      "Oben auf der Karte stehen die Zustände als Knöpfe mit Anzahl – antippen blendet aus und wieder ein.",
      "Weit weg werden nahe Nadeln zu Bündeln mit Anzahl; der Ring zeigt, wie viel davon offen ist. Antippen zoomt hinein.",
      "Eine Nadel antippen öffnet die Kundenkarte: Anrufen, Navigation, Kontakt, Auftrag – am Handy als Blatt von unten.",
      "Termine → Heute oder Morgen zeigt den Tag auf der Karte: nummerierte Stationen, je Mitarbeiter als Linie verbunden, unten zum Wischen.",
      "Neu: Suche auf der Karte (Handy), „Mein Standort“, Legende „Was bedeuten die Nadeln?“. Am Handy bleibt die untere Leiste jetzt auch bei offener Karte sichtbar.",
      "Behoben: Der QR-Scanner in Lager und Einlagerung bekam vom Browser keine Kamera – jetzt fragt er wie vorgesehen nach der Erlaubnis.",
    ],
  },
  {
    version: "v78", datum: "2026-09-26", titel: "Versionsanzeige und Testkunden",
    punkte: [
      "Die Fassung der App steht jetzt in den Einstellungen, dazu diese Seite „Was gibt es Neues“ für Admin und Superadmin.",
      "Der Superadmin kann beim Anlegen einen Kunden als Testkunden markieren. Seine Aufträge heißen T1, T2 …, seine Rechnungen T-RE1 … – die echten Auftrags- und Rechnungsnummern zählen dabei nicht weiter.",
      "Testkunden sind überall mit TEST gekennzeichnet und zählen in Auswertungen, DATEV-Export und Umsatz nicht mit.",
      "„Testkunde restlos löschen“ entfernt den Kunden mit allem, was an ihm hängt: Aufträge, Rechnungen, Fahrzeuge, Reifen, Kontakte und Protokoll.",
    ],
  },
  {
    version: "v77", datum: "2026-09-26", titel: "Alle übrigen Seiten im neuen Stil",
    punkte: [
      "Auftragsfenster in Karten: oben wer, wann, wo; „Termin & Team“ als eigenes Blatt; unten genau die Handlung, die gerade dran ist.",
      "Abschließen oder „Arbeit beginnen“ speichert ungesicherte Änderungen jetzt vorher mit.",
      "Kundenfenster mit vier Knöpfen (Anrufen, Navigation, Kontakt, Auftrag) und Reitern; Verlauf aus Kontakten und Aufträgen.",
      "Rechnungen nach Monaten mit „Noch nicht ausgestellt“, Artikel als Karten mit Preis-Zeitleiste.",
      "Neuer Kunde, Inaktive Kunden, Einstellungen, „Weitere“ und Admin (acht Reiter, Rechte je Rolle, Betrieb als Zeilen) neu gestaltet.",
    ],
  },
  {
    version: "v76", datum: "2026-09-26", titel: "Auswertungen und DATEV-Export",
    punkte: [
      "Fünf Reiter: Umsatz, Kunden, Einsatz, Lager, Artikel – mit Zeitraum, Vorjahresvergleich und Mitarbeiter-Filter.",
      "Export für den Steuerberater: DATEV-Buchungsstapel (SKR03, je Kunde ein Debitor), Debitoren- und Rechnungsliste.",
      "DATEV-Angaben unter Admin → Betrieb.",
    ],
  },
  {
    version: "v75", datum: "2026-09-26", titel: "Terminliste als Zeitleiste",
    punkte: [
      "Der Tag als Zeitleiste mit Jetzt-Linie und freien Lücken, Filter nach Mitarbeiter, „Als Nächstes“ bei Heute.",
    ],
  },
  {
    version: "v74", datum: "2026-09-26", titel: "Auftragsliste als Karten",
    punkte: ["Suche auch nach Auftragsnummer, Status-Pillen, Navigation und Anrufen an jeder Karte."],
  },
  {
    version: "v73", datum: "2026-09-26", titel: "Kundenliste neu",
    punkte: ["Karten mit Zustandsfarbe, Suche und Filter; Anrufen und Navigation direkt an der Zeile."],
  },
  {
    version: "v72", datum: "2026-09-26", titel: "Saisonliste neu",
    punkte: ["Wer hat welche Reifen bei uns liegen – als Anrufliste für den Saisonwechsel."],
  },
  {
    version: "v71", datum: "2026-09-26", titel: "Lager neu",
    punkte: ["Eine Seite für Regale, Plätze und eingelagerte Sätze, mit Suche und Belegung."],
  },
  {
    version: "v70", datum: "2026-09-25", titel: "Neues Dashboard",
    punkte: ["Was heute ansteht, was zu erledigen ist, und die Liste „Reifen mitnehmen“ zum Abhaken."],
  },
];

// Gibt es für diese Person etwas Ungelesenes? `gesehen` ist die zuletzt geöffnete Fassung
// (user_settings.neuigkeiten_gesehen, Migration 60). Nie gesehen = alles neu.
export function neuigkeitenUngelesen(gesehen: string | null | undefined, liste: Neuigkeit[] = NEUIGKEITEN): Neuigkeit[] {
  const i = gesehen ? liste.findIndex((n) => n.version === gesehen) : -1;
  // Nie gesehen oder eine Fassung, die hier nicht mehr steht: nur die neueste zeigen – nicht die
  // ganze Geschichte auf einmal.
  if (i === -1) return liste.slice(0, 1);
  return liste.slice(0, i);
}
