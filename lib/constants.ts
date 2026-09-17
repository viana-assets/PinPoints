// Zentrale, modulübergreifende Konstanten – siehe docs/konstanten-register.md und
// docs/README.md (Konstanten-Regel: ein fester Wertebereich wird genau einmal hier benannt
// und überall per Name referenziert, nie als literaler Wert ein zweites Mal hingeschrieben).
//
// Rein modul-lokale Konstanten (z. B. MAP_STYLES in lib/mapStyles.ts, DEFAULT_VAT_RATE in
// lib/helpers.ts) bleiben bewusst bei ihrem Thema statt hier gesammelt zu werden – hier
// stehen nur Konstanten, die von mehreren, fachlich unterschiedlichen Stellen in
// app/page.tsx verwendet werden (Rollen, Berechtigungen, Auftragsstatus, Kalenderfarben).

import type { Felge, GeoGenauigkeit, OrderStatus, RadPosition, Role, Saison } from "./types";

// ---------------------------------------------------------------- Rollen
export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  techniker: "Techniker",
  user: "Nutzer",
};

// Alle existierenden Rollen, abgeleitet aus ROLE_LABEL – damit es keine zweite Aufzählung
// gibt, die beim Hinzufügen einer Rolle vergessen werden kann (z. B. in der Einladungsroute).
export const ALL_ROLES = Object.keys(ROLE_LABEL) as Role[];

// ---------------------------------------------------------------- Auftragsstatus
// Anzeigename je Auftragsstatus – referenziert von CustomerOrderRow, AuftraegePanel und
// EinsatzplanungPanel (vorher an allen drei Stellen als identische lokale Konstante
// dupliziert, siehe docs/konstanten-register.md).
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  offen: "Offen",
  in_arbeit: "In Arbeit",
  erledigt: "Erledigt",
  storniert: "Storniert",
};

// Farbklasse je Zustand für das Status-Kennzeichen (.badge in globals.css). Seit Migration 20
// ist der Status in den Listen nur noch eine Anzeige – gehandelt wird im Auftragsfenster über
// benannte Schaltflächen, siehe docs/auftragsablauf.md.
export const ORDER_STATUS_FARBE: Record<OrderStatus, string> = {
  offen: "red",
  in_arbeit: "orange",
  erledigt: "green",
  storniert: "grau",
};

// Zustände, in denen die Positionen eines Auftrags eingefroren sind: die Rechnungsgrundlage
// steht fest und darf sich nicht mehr ändern. Ein Datenbank-Trigger erzwingt dasselbe
// (Migration 20) – hier steht es nur, damit die Oberfläche gar nicht erst etwas anbietet, das
// die Datenbank ohnehin ablehnen würde.
export const ABGESCHLOSSENE_ZUSTAENDE: OrderStatus[] = ["erledigt", "storniert"];

export function istAbgeschlossen(status: OrderStatus): boolean {
  return ABGESCHLOSSENE_ZUSTAENDE.includes(status);
}

// ---------------------------------------------------------------- Modul-Berechtigungen
// Ein fester Katalog von Berechtigungs-"Zeilen", jede mit einem eindeutigen Schlüssel (in
// `module_permissions.module_key` gespeichert). "view.*" steuert, ob eine Rolle den
// jeweiligen Tab überhaupt sieht/öffnen kann; "action.*" steuert einzelne Handlungen
// innerhalb eines Moduls (aktuell nur Lager, weil das konkret gefragt war – lässt sich für
// weitere Module genauso ergänzen). Superadmin darf immer alles, unabhängig von dieser
// Tabelle. Dashboard ist immer für alle sichtbar (Startseite/Absturz-Sicherung), daher zwar
// in der Liste (Transparenz), aber nicht abwählbar.
// ---------------------------------------------------------------- Rechte
//
// Seit dem 17.09.2026 hat jeder Bereich je Rolle DREI Haken: lesen, schreiben, löschen.
// Vorher gab es einen Haken je „Modul“ plus eine Handvoll eigener Zeilen für einzelne
// Lager-Aktionen – gewachsen, ungleichmäßig, und man musste raten, ob „Lager“ nur das Sehen
// meinte oder auch das Löschen.
//
// DREI Verben und nicht vier: „anlegen“ und „ändern“ sind beide „schreiben“. Die Trennung
// wäre denkbar, aber im Betrieb gibt es niemanden, der ändern darf und nicht anlegen – sie
// hätte nur die Tabelle verdoppelt.
//
// WICHTIG: Jeder dieser Haken wird von der DATENBANK durchgesetzt (Migration 42,
// `public.darf()`), nicht nur von der Oberfläche. Ein Häkchen, das nur die Anzeige kennt, ist
// eine Zusage, die das Programm nicht hält.
export type Verb = "lesen" | "schreiben" | "loeschen";
export const VERBEN: Verb[] = ["lesen", "schreiben", "loeschen"];
export const VERB_LABEL: Record<Verb, string> = {
  lesen: "Lesen", schreiben: "Schreiben", loeschen: "Löschen",
};

export type RechtBereich = {
  schluessel: string;
  label: string;
  // Welche Verben es hier überhaupt gibt. Was fehlt, erscheint als graue Zelle – nicht als
  // Lücke: Eine leere Stelle in einer Spalte sieht beim Überfliegen aus wie ein nicht
  // gesetzter Haken, und das ist die gefährlichere Verwechslung.
  verben: Verb[];
  // Warum ein Verb fehlt. Steht im Tooltip der grauen Zelle – eine gesperrte Zelle ohne
  // Begründung ist eine Aufforderung zum Rätselraten.
  warumNicht?: string;
  // Eine eingerückte Zeile: eine HANDLUNG innerhalb des Moduls darüber.
  unter?: boolean;
  // Immer an, für alle, nicht abwählbar.
  gesperrt?: boolean;
  // Was dieser Haken konkret erlaubt. Steht als Tooltip an der Zeile – die Erfahrung vom
  // 17.09.2026: „Lager und Lagerplätze" klang nach dem ganzen Modul und meinte nur die
  // Regale. Ein Name allein trägt eine Rechteentscheidung nicht.
  erklaerung?: string;
};

// ZWEI EBENEN, und das ist der Kern der Überarbeitung vom 17.09.2026:
//
//   Modulzeile  = darf jemand diesen Reiter überhaupt sehen?
//   Unterzeile  = was darf er mit den Daten dahinter tun?
//
// Die erste Fassung hatte die Bereiche an TABELLEN geschnitten („Lager und Lagerplätze",
// „Eingelagerte Reifen"). Das war für niemanden nachvollziehbar, der nicht die Datenbank
// kennt – und schlimmer: „Löschen" saß dadurch auf der falschen Sache. Auslagern ist in
// dieser Anwendung ein SCHREIBEN (`removed_at` setzen), gelöscht wird eine Einlagerung nie.
// Der Löschen-Haken hätte also das Entfernen einer Radmessung gesteuert und dabei ausgesehen,
// als ginge es ums Auslagern.
//
// Jetzt heißen die Zeilen nach dem, was man TUT, und „löschen" steht nur dort, wo wirklich
// etwas verschwindet.
//
// Ein Modul mit nur EINEM Datenbereich bekommt keine Unterzeile, sondern trägt die drei Verben
// selbst – eine Einrückung mit genau einem Kind erklärt nichts und kostet eine Zeile.
export const RECHTE_KATALOG: RechtBereich[] = [
  { schluessel: "dashboard", label: "Dashboard", verben: ["lesen"], gesperrt: true,
    erklaerung: "Der Überblick über den Tag. Für alle sichtbar.",
    warumNicht: "Das Dashboard zeigt nur zusammengefasste Zahlen; es gibt dort nichts zu schreiben." },

  { schluessel: "kunden", label: "Kunden", verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Kundenstammdaten, Kontakthistorie und die Fahrzeuge der Kunden. Löschen heißt: als gelöscht markieren – der Datensatz bleibt für Rechnungsbezug und Protokoll erhalten." },

  { schluessel: "auftraege", label: "Aufträge", verben: ["lesen"],
    erklaerung: "Darf der Reiter „Aufträge“ geöffnet werden? Was darin erlaubt ist, steht in den Zeilen darunter.",
    warumNicht: "Die Modulzeile entscheidet nur über die Sichtbarkeit des Reiters. Was mit den Daten geht, steht in den eingerückten Zeilen darunter." },
  { schluessel: "auftraege.auftrag", label: "– Auftrag anlegen und ändern", unter: true,
    verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Der Auftrag selbst: Titel, Datum, Uhrzeit, Fahrzeug, Status. Ein Techniker sieht hier immer nur seine EIGENEN Aufträge – das entscheidet die Datenbank zusätzlich zu diesem Haken." },
  { schluessel: "auftraege.leistungen", label: "– Leistungen im Auftrag", unter: true,
    verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Artikel und Leistungen an einem Auftrag. „Löschen“ heißt hier: eine versehentlich eingetragene Zeile wieder entfernen – das gehört zum Arbeiten, nicht zum Wegwerfen." },
  { schluessel: "auftraege.einteilung", label: "– Mitarbeiter einteilen", unter: true,
    verben: ["lesen", "schreiben"],
    erklaerung: "Wer fährt zu diesem Auftrag? Bewusst getrennt: Wer sich selbst Aufträge zuteilen kann, teilt sich auch fremde zu.",
    warumNicht: "Eine Einteilung wird geändert, nicht gelöscht – wer niemanden mehr zuordnet, hat sie geleert." },

  { schluessel: "termine", label: "Termine", verben: ["lesen"],
    erklaerung: "Die chronologische Terminübersicht. Zeigt dieselben Aufträge, nur anders sortiert.",
    warumNicht: "Ein Termin ist ein Auftrag mit Uhrzeit – geschrieben und gelöscht wird bei „Aufträge“." },
  { schluessel: "einsatzplanung", label: "Einsatzplanung", verben: ["lesen"],
    erklaerung: "Kalender nach Tag, Woche und Monat.",
    warumNicht: "Die Einsatzplanung zeigt Aufträge – geschrieben und gelöscht wird bei „Aufträge“." },

  { schluessel: "lager", label: "Lager", verben: ["lesen"],
    erklaerung: "Darf der Reiter „Lager“ geöffnet werden? Was darin erlaubt ist, steht in den Zeilen darunter.",
    warumNicht: "Die Modulzeile entscheidet nur über die Sichtbarkeit des Reiters." },
  { schluessel: "lager.regale", label: "– Regale und Plätze verwalten", unter: true,
    verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Die Struktur: Lager anlegen, Lagerplätze nummerieren, umbenennen, entfernen. NICHT das, was darin liegt." },
  { schluessel: "lager.einlagerung", label: "– Reifen ein- und auslagern", unter: true,
    verben: ["lesen", "schreiben"],
    erklaerung: "Einen Reifensatz auf einen Platz legen, seine Angaben pflegen und ihn wieder herausgeben. Das ist die tägliche Arbeit am Lager.",
    warumNicht: "Auslagern IST das Schreiben: Die Einlagerung wird als beendet markiert und bleibt als Historie stehen. Gelöscht wird sie nie – sonst wüsste hinterher niemand mehr, dass der Satz je hier lag." },
  { schluessel: "lager.raeder", label: "– Räder einzeln messen", unter: true,
    verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Profiltiefe, DOT, Felge und Sensor je Rad. „Löschen“ heißt: eine falsch erfasste Messung wieder entfernen." },

  { schluessel: "saison", label: "Saisonliste", verben: ["lesen"],
    erklaerung: "Wer hat welche Reifen bei uns liegen – die halbjährliche Anrufliste.",
    warumNicht: "Die Saisonliste ist eine Auswertung der Einlagerungen – geändert wird bei „Lager“." },

  { schluessel: "artikel", label: "Artikel und Preise", verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Artikelstamm und Preishistorie. Wer hier schreiben darf, bestimmt, was eine Leistung kostet." },

  { schluessel: "mitarbeiter", label: "Mitarbeiter", verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Die Mitarbeiterstammdaten der Einsatzplanung. Ein Techniker sieht damit nur sich selbst und Kollegen, die mit ihm auf einem Auftrag stehen – nicht die ganze Belegschaft. Das entscheidet die Datenbank zusätzlich zu diesem Haken." },
  { schluessel: "firmenfahrzeuge", label: "Firmenfahrzeuge", verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Die eigenen Transporter als Stammdaten." },

  { schluessel: "auswertung", label: "Auswertungen", verben: ["lesen"],
    erklaerung: "Umsatz, Steuer, Nachlass, Saisonalität, Mitarbeiter- und Artikelauswertung.",
    warumNicht: "Auswertungen rechnen nur – sie legen nichts an und löschen nichts." },
  { schluessel: "einstellungen", label: "Einstellungen", verben: ["lesen", "schreiben"],
    erklaerung: "Anzeige, Wiedervorlage-Zeitraum, App. Jeder ändert ausschließlich seine eigenen.",
    warumNicht: "Jeder hat genau einen Satz Einstellungen; zu löschen gibt es dort nichts." },
];

// Was gilt, solange in der Datenbank keine Zeile für einen Bereich steht.
//
// Der Techniker ist hier die eigentliche Aussage: Er sieht Aufträge, Termine, Lager und
// Einsatzplanung, arbeitet dort und darf seine eigenen Eingaben auch KORRIGIEREN – eine
// versehentlich eingetragene Leistung wieder entfernen, eine falsch erfasste Radmessung
// löschen. Was er nicht darf: Kundenstammdaten sehen, Preise ändern, Auswertungen öffnen,
// sich selbst einteilen und ganze Aufträge oder Kunden wegwerfen.
//
// Der Unterschied zwischen „korrigieren" und „wegwerfen" ist der Grund, warum es die
// eingerückten Zeilen gibt: In der ersten Fassung hing beides am selben Haken, und ein
// Techniker konnte eine Leistung eintragen, aber seinen Tippfehler nicht mehr entfernen.
export const RECHTE_VORGABE: Record<string, Partial<Record<Verb, Role[]>>> = {
  dashboard:              { lesen: ["admin", "techniker", "user"] },

  kunden:                 { lesen: ["admin", "user"], schreiben: ["admin", "user"], loeschen: ["admin"] },

  auftraege:              { lesen: ["admin", "techniker", "user"] },
  "auftraege.auftrag":    { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "techniker", "user"], loeschen: ["admin", "user"] },
  "auftraege.leistungen": { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "techniker", "user"], loeschen: ["admin", "techniker", "user"] },
  "auftraege.einteilung": { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "user"] },

  termine:                { lesen: ["admin", "techniker", "user"] },
  einsatzplanung:         { lesen: ["admin", "techniker", "user"] },

  lager:                  { lesen: ["admin", "techniker", "user"] },
  "lager.regale":         { lesen: ["admin", "techniker", "user"], schreiben: ["admin"], loeschen: ["admin"] },
  "lager.einlagerung":    { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "techniker", "user"] },
  "lager.raeder":         { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "techniker", "user"], loeschen: ["admin", "techniker", "user"] },

  saison:                 { lesen: ["admin", "user"] },
  artikel:                { lesen: ["admin", "user"], schreiben: ["admin"], loeschen: ["admin"] },
  mitarbeiter:            { lesen: ["admin", "techniker", "user"], schreiben: ["admin"], loeschen: ["admin"] },
  firmenfahrzeuge:        { lesen: ["admin", "techniker", "user"], schreiben: ["admin"], loeschen: ["admin"] },
  auswertung:             { lesen: ["admin"] },
  einstellungen:          { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "techniker", "user"] },
};

export function rechtSchluessel(bereich: string, verb: Verb): string {
  return `${bereich}.${verb}`;
}

export const PERMISSION_ROLES: Role[] = ["admin", "techniker", "user"];

// ---------------------------------------------------------------- Einsatzplanung
// Farbpalette für Mitarbeiter-Punkte im Kalender – Farbe pro Mitarbeiter ist stabil nach
// Reihenfolge in der Mitarbeiterliste, siehe employeeColorFor() in app/page.tsx.
export const EMP_COLORS = ["#FF5A1F", "#1E9B6E", "#1E3A5F", "#8a5cf6", "#e0447a", "#c9a227", "#2f8fd1", "#a15c2e"];

// Die Filter über der Kundenliste – Reihenfolge, Beschriftung und Schlüssel an einer Stelle
// (Konstanten-Regel, siehe docs/README.md). Vorher standen die sechs Knöpfe als sechs fast
// gleiche Zeilen im JSX; wer einen Zustand ergänzt, hätte ihn an drei Stellen nachtragen
// müssen: Knopf, Filterbedingung und Zählung.
export type KundenFilter = "all" | "offen" | "wiedervorlage" | "termin" | "ok" | "kein_interesse" | "nogeo";

// Zeitraum-Filter des Termine-Reiters. Steht hier und nicht in app/page.tsx, weil Liste UND
// Karte damit gefiltert werden – zwei Stellen, eine Werteliste (Konstanten-Regel).
export type TerminFilter = "heute" | "morgen" | "woche" | "anstehend" | "alle";

export const TERMIN_FILTER: { wert: TerminFilter; text: string }[] = [
  { wert: "heute", text: "Heute" },
  { wert: "morgen", text: "Morgen" },
  { wert: "woche", text: "7 Tage" },
  { wert: "anstehend", text: "Anstehend" },
  { wert: "alle", text: "Alle" },
];

// Reihenfolge wie bei KUNDEN_ZUSTAND_REIHENFOLGE: nach Dringlichkeit. „Termin" steht zwischen
// Wiedervorlage und Kontaktiert – der Kunde ist versorgt, aber es steht noch etwas an.
export const KUNDEN_FILTER: { wert: KundenFilter; text: string }[] = [
  { wert: "all", text: "Alle" },
  { wert: "offen", text: "Offen" },
  { wert: "wiedervorlage", text: "Wiedervorlage" },
  { wert: "termin", text: "Termin" },
  { wert: "ok", text: "Kontaktiert" },
  { wert: "kein_interesse", text: "Kein Interesse" },
  { wert: "nogeo", text: "Ohne Karte" },
];

// ---------------------------------------------------------------- Terminerinnerung
//
// Wie viele Minuten vor dem Termin die Erinnerung rausgeht, und in welcher Zeitzone die
// Uhrzeiten an den Aufträgen gemeint sind. Beides braucht die Versandroute
// (app/api/push/senden) – die Zeitzone deshalb, weil der Server in UTC läuft, die Uhrzeit am
// Auftrag aber die Uhr an der Wand meint. Siehe docs/benachrichtigungen-plan.md.
export const VORLAUF_MINUTEN = 5;
export const ZEITZONE = "Europe/Berlin";

// Adressparameter, mit denen eine angetippte Benachrichtigung direkt das richtige Fenster
// öffnet. Gegenstück zu LAGERPLATZ_PARAMETER in lib/lagerplatzCode.ts – dasselbe Muster wie
// beim QR-Aufkleber am Regal.
//
// Die Terminerinnerung benutzt `auftrag`: Der Techniker steht im Auto und braucht Fahrzeug,
// Leistungen und die Navigation zu DIESEM Termin – nicht die Kundenakte mit allen Aufträgen
// der letzten Jahre. `kunde` bleibt bestehen, weil es ohne Auftrag trotzdem sinnvoll ist.
export const KUNDE_PARAMETER = "kunde";
export const AUFTRAG_PARAMETER = "auftrag";

// ---------------------------------------------------------------- Lager: Saison
//
// Die drei Saisonarten eines eingelagerten Satzes (Migration 30). Reihenfolge und Beschriftung
// stehen genau hier, damit Auswahlknöpfe, Listenanzeige und Auswertung dieselben Wörter
// benutzen. Die Datenbank kennt dieselben drei Werte als Prüfregel.
export const SAISON_LABEL: Record<Saison, string> = {
  sommer: "Sommer",
  winter: "Winter",
  ganzjahr: "Ganzjahr",
};

export const SAISON_LISTE: Saison[] = ["sommer", "winter", "ganzjahr"];

// ---------------------------------------------------------------- Lager: Räder und Profil
//
// Die vier Positionen in der Reihenfolge, in der sie auch im Radbild stehen: vorne zuerst,
// links vor rechts. Dieselbe Reihenfolge in Liste, Bild und Auswertung – sonst sucht man beim
// Vergleichen jedes Mal neu.
export const RAD_POSITIONEN: RadPosition[] = ["VL", "VR", "HL", "HR"];

export const RAD_POSITION_LABEL: Record<RadPosition, string> = {
  VL: "vorne links",
  VR: "vorne rechts",
  HL: "hinten links",
  HR: "hinten rechts",
};

export const FELGE_LABEL: Record<Felge, string> = {
  stahl: "Stahl",
  alu: "Alu",
  keine: "ohne Felge",
};

export const FELGEN: Felge[] = ["stahl", "alu", "keine"];

// Grenzwerte für die Profiltiefe in Millimetern.
//
// 1,6 mm ist das gesetzliche Minimum für Sommerreifen – darunter darf ein Reifen nicht mehr
// gefahren werden. Die beiden Werte hier liegen bewusst darüber: Sie sind keine Vorschrift,
// sondern der Punkt, an dem man den Kunden ansprechen sollte. 4 mm gilt als Untergrenze für
// Winterreifen und ist die übliche Empfehlung zum Wechseln; unter 3 mm wird es auch bei
// Sommerreifen eng, lange bevor die 1,6 erreicht sind.
//
// Sie stehen hier und nicht im Code, weil sie an drei Stellen gebraucht werden (Radbild,
// Liste, späterer Verkaufsanlass) – und weil ein Betrieb sie irgendwann anders sehen kann.
// Wie genau eine Kartenposition ist (Migration 35). Dieselbe feste Werteliste steht als
// Prüfregel in der Datenbank – hier nur die Beschriftung.
export const GEO_GENAUIGKEIT_LABEL: Record<GeoGenauigkeit, string> = {
  exakt: "genaue Position",
  ungefaehr: "ungefähre Position – nur die Straße war auffindbar",
  hand: "Position von Hand gesetzt",
};

export const PROFIL_GESETZLICH_MM = 1.6;
export const PROFIL_KRITISCH_MM = 3;
export const PROFIL_HINWEIS_MM = 4;

// Ab wann ist an einem eingelagerten Satz etwas zu tun? Diese beiden Grenzen ergänzen die
// Profiltiefe oben – zusammen bilden sie die Regel hinter dem orangen Punkt an der Regalwand
// (lib/helpers.ts, `handlungsgruende`).
//
// Sechs Jahre: Reifen altern auch ungefahren. Die Gummimischung verhärtet, der Grip auf
// nasser Fahrbahn lässt messbar nach. Sechs Jahre ist die gängige Empfehlung zum Ansprechen,
// zehn die zum Austauschen – wir warnen beim Ansprechen, nicht erst beim Austauschen.
export const DOT_ALT_JAHRE = 6;

// Ein Jahr: Ein Satz, der eine ganze Saison übersprungen hat, ist entweder vergessen worden
// oder der Kunde ist weg. Beides sollte jemand wissen. Bei einem Betrieb, der zweimal im Jahr
// wechselt, ist ein Jahr ohne Bewegung ein ausgelassener Termin.
export const LAGERDAUER_HINWEIS_TAGE = 365;

// Ab welcher Fensterbreite die Regalwand von selbst zur Reihenliste wird. Dieselbe Zahl steht
// im Stilblatt (app/globals.css, „Reihenliste“) – sie muss dort stehen, weil CSS keine
// TypeScript-Konstante lesen kann. Wer sie ändert, ändert sie an beiden Stellen; der Kommentar
// im Stilblatt verweist hierher.
//
// Von Hand lässt sich die Ansicht seitdem trotzdem umschalten: Die Breite ist die Vorgabe,
// nicht das Gesetz.
export const REGAL_LISTE_BREITE_PX = 700;

// ---------------------------------------------------------------- Protokoll (Migration 36)
//
// Der Trigger schreibt Tabellen- und Spaltennamen, wie sie in der Datenbank heißen. Für
// jemanden, der das Protokoll liest, ist „order_articles.net_price“ keine Auskunft, sondern
// eine Zumutung. Hier steht die Übersetzung – einmal, weil sie an zwei Stellen gebraucht
// wird (Adminliste und Auftragsfenster).
//
// Was NICHT übersetzt ist, wird im Rohnamen angezeigt statt verschwiegen: Ein Feld, das
// niemand benannt hat, ist immer noch eine Änderung, die stattgefunden hat.
export const PROTOKOLL_TABELLE_LABEL: Record<string, string> = {
  orders: "Auftrag",
  order_articles: "Leistung im Auftrag",
  order_employees: "Mitarbeiter am Auftrag",
  customers: "Kunde",
  vehicles: "Fahrzeug",
  contact_history: "Kontakteintrag",
  tire_storage: "Einlagerung",
  eingelagerte_raeder: "Einzelnes Rad",
  storage_slots: "Lagerplatz",
  warehouses: "Lager",
  articles: "Artikel",
  article_prices: "Artikelpreis",
  firmenfahrzeuge: "Firmenfahrzeug",
  employees: "Mitarbeiter",
  profiles: "Zugang",
  module_permissions: "Rechte",
};

// WICHTIG: Aus dieser Liste wird NICHTS entfernt, wenn eine Spalte aus der Datenbank fällt.
// Das Protokoll (audit_log) hält die alten Werte als jsonb fest, und die bleiben lesbar,
// nachdem die Spalte weg ist. Wer einen Eintrag von vorletzter Woche aufschlägt, soll dort
// „Rabatt %“ lesen und nicht den rohen Spaltennamen. `discount_percent` und
// `assigned_employee_id` stehen deshalb weiter hier, obwohl Migration 39 sie gelöscht hat –
// sie beschreiben Vergangenheit, und die ändert sich nicht mehr.
export const PROTOKOLL_FELD_LABEL: Record<string, string> = {
  // Auftrag
  order_number: "Auftragsnummer", title: "Titel", description: "Beschreibung",
  status: "Status", order_date: "Datum", time: "Uhrzeit",
  techniker_notiz: "Technikernotiz", cancel_reason: "Stornogrund",
  reopen_reason: "Grund der Wiedereröffnung",
  completed_at: "abgeschlossen am", completed_by: "abgeschlossen von",
  cancelled_at: "storniert am", cancelled_by: "storniert von",
  firmenfahrzeug_id: "Firmenfahrzeug", assigned_employee_id: "Mitarbeiter",
  rechnung_noetig: "Rechnung benötigt", rechnung_erstellt_am: "Rechnung erstellt am",
  rechnung_erstellt_von: "Rechnung erstellt von", rechnung_nummer: "Rechnungsnummer",
  // Leistung
  quantity: "Menge", net_price: "Nettopreis", vat_rate: "Steuersatz",
  discount_percent: "Rabatt %", article_id: "Artikel",
  // Kunde
  name: "Name", company: "Firma", anrede: "Anrede", address: "Adresse",
  email: "E-Mail", phone_mobile: "Mobil", phone_landline: "Festnetz",
  last_contact: "letzter Kontakt", kontakt_ergebnis: "Kontaktergebnis",
  wiedervorlage_am: "Wiedervorlage am", lat: "Breitengrad", lng: "Längengrad",
  geo_genauigkeit: "Genauigkeit der Position", active: "aktiv",
  // Fahrzeug / Lager
  license_plate: "Kennzeichen", make_model: "Marke/Modell", tire_size: "Reifengröße",
  code: "Platz-Code", saison: "Saison", dot_date: "DOT-Datum",
  profiltiefe_mm: "Profiltiefe (mm)", erfassungsart: "Erfassungsart",
  anzahl_raeder: "Anzahl Räder", position: "Radposition",
  storage_slot_id: "Lagerplatz", removed_at: "ausgelagert am",
  warehouse_id: "Lager", customer_id: "Kunde", vehicle_id: "Fahrzeug",
  order_id: "Auftrag", employee_id: "Mitarbeiter",
  // Zugänge und Rechte
  role: "Rolle", module_key: "Berechtigung", roles: "Rollen", profile_id: "Zugang",
  // Allgemein
  note: "Notiz", deleted_at: "gelöscht am", created_at: "angelegt am",
};

// Wie viele Tage das Protokoll im Adminbereich standardmäßig zurückreicht. Ältere Einträge
// bleiben erhalten und sind über den Datumsfilter erreichbar – die Voreinstellung soll nur
// verhindern, dass die Seite beim Öffnen Monate lädt, die niemand angefragt hat.
export const PROTOKOLL_TAGE_STANDARD = 90;

// Das Terminraster: in welchen Schritten die Terminlänge vorgeschlagen wird, und wie lang ein
// Termin ohne gepflegtes Ende gilt.
//
// Seit Migration 38 steht der tatsächliche Wert in der Datenbank (`betrieb.termin_intervall_min`)
// und ist im Adminbereich einstellbar. Diese Konstante ist nur noch der Rückfall für den
// Augenblick, in dem die Einstellung noch nicht geladen ist – sie darf deshalb nicht von der
// Voreinstellung der Datenbank abweichen.
export const STANDARD_DAUER_MIN = 30;

// Die Schritte, die im Adminbereich zur Auswahl stehen. Feste Liste statt freiem Zahlenfeld:
// Ein Raster von 37 Minuten ergibt keinen Termin, den jemand ansagen würde.
export const TERMIN_INTERVALLE = [15, 20, 30, 45, 60, 90, 120];

// Das Grundfenster der Tages- und Wochenansicht in Stunden. Es dehnt sich aus, sobald ein
// Termin darüber hinausgeht, wird aber nie enger – sonst läge die Acht-Uhr-Linie an jedem Tag
// woanders (siehe `zeitfenster()` in lib/calendar.ts).
export const KALENDER_VON_STUNDE = 7;
export const KALENDER_BIS_STUNDE = 19;
