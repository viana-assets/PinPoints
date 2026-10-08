// Zentrale, modulübergreifende Konstanten – siehe docs/konstanten-register.md und
// docs/README.md (Konstanten-Regel: ein fester Wertebereich wird genau einmal hier benannt
// und überall per Name referenziert, nie als literaler Wert ein zweites Mal hingeschrieben).
//
// Rein modul-lokale Konstanten (z. B. MAP_STYLES in lib/mapStyles.ts, DEFAULT_VAT_RATE in
// lib/helpers.ts) bleiben bewusst bei ihrem Thema statt hier gesammelt zu werden – hier
// stehen nur Konstanten, die von mehreren, fachlich unterschiedlichen Stellen in
// app/page.tsx verwendet werden (Rollen, Berechtigungen, Auftragsstatus, Kalenderfarben).

import type { Article, BelegArt, Felge, OrderStatus, PlatzGroesse, RadPosition, ReifenZustand, Role, Saison } from "./types";

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
  // Eine reine Handlung ohne eigenes „Lesen“ (v125): „Endpreis überschreiben“, „stornieren“ – was
  // man dabei sieht, regelt die Zeile darüber. Nur hier darf `lesen` in `verben` fehlen.
  handlung?: boolean;
  // Immer an, für alle, nicht abwählbar.
  gesperrt?: boolean;
  // Was ein Haken in Klartext bedeutet – für „Ansehen als …“ unter der Rechtematrix (v124):
  // „Kann: Reifen ein- und auslagern“. Je Verb, das es in diesem Bereich gibt.
  klartext?: Partial<Record<Verb, string>>;
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
  { schluessel: "dashboard", klartext: { lesen: "das Dashboard sehen" }, label: "Dashboard", verben: ["lesen"], gesperrt: true,
    erklaerung: "Der Überblick über den Tag. Für alle sichtbar.",
    warumNicht: "Das Dashboard zeigt nur zusammengefasste Zahlen; es gibt dort nichts zu schreiben." },

  { schluessel: "kunden", klartext: { lesen: "Kunden, ihre Fahrzeuge und die Kontakthistorie sehen", schreiben: "Kunden anlegen und ihre Stammdaten ändern", loeschen: "Kunden und ihre Fahrzeuge löschen" }, label: "Kunden", verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Kundenstammdaten, Kontakthistorie und die Fahrzeuge der Kunden. Löschen heißt: als gelöscht markieren – der Datensatz bleibt für Rechnungsbezug und Protokoll erhalten." },
  { schluessel: "kunden.fahrzeuge", label: "– Fahrzeuge anlegen und ändern", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "Fahrzeuge anlegen und ändern (Kennzeichen, Modell, Reifengröße)" },
    erklaerung: "Im Kundenfenster und im Auftrag ein Fahrzeug anlegen und seine Angaben ändern (Migration 77). Ein Techniker nur bei Kunden, auf deren Aufträgen er eingeteilt ist. Löschen gehört zu „Kunden löschen“.",
    warumNicht: "Gesehen werden Fahrzeuge mit den Kunden (Zeile darüber); gelöscht ebenfalls dort." },

  { schluessel: "kunden.kontakte", label: "– Kontakte eintragen", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "Kontakte eintragen (kontaktiert/offen, Wiedervorlage, Kontakthistorie)" },
    erklaerung: "Einen Anruf festhalten, die Wiedervorlage setzen, einen Kunden wieder auf offen stellen, die Anrufliste aus der Saisonliste erzeugen (Migration 78). Geht auch ohne „Kunden schreiben“ – dann bleiben die Stammdaten gesperrt. Ein Techniker nur bei Kunden seiner Aufträge.",
    warumNicht: "Die Kontakthistorie sieht, wer Kunden sieht; einzelne Einträge löscht man mit dem Kunden." },
  { schluessel: "kunden.dubletten", label: "– Dubletten zusammenführen", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "Dubletten zusammenführen und „keine Dublette“ vermerken" },
    erklaerung: "Zwei Kundeneinträge derselben Person zu einem zusammenführen oder als „keine Dublette“ markieren (Admin › Dubletten, Migration 78). Braucht zusätzlich „Kunden löschen“ – der zweite Eintrag geht dabei in den Papierkorb.",
    warumNicht: "Gesehen werden Dubletten mit den Kunden." },
  { schluessel: "auftraege", klartext: { lesen: "den Reiter „Aufträge“ öffnen" }, label: "Aufträge", verben: ["lesen"],
    erklaerung: "Darf der Reiter „Aufträge“ geöffnet werden? Was darin erlaubt ist, steht in den Zeilen darunter.",
    warumNicht: "Die Modulzeile entscheidet nur über die Sichtbarkeit des Reiters. Was mit den Daten geht, steht in den eingerückten Zeilen darunter." },
  { schluessel: "auftraege.auftrag", klartext: { lesen: "Aufträge sehen", schreiben: "Aufträge ändern und abschließen", loeschen: "Aufträge löschen" }, label: "– Auftrag ändern", unter: true,
    verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Der Auftrag selbst: Titel, Datum, Uhrzeit, Fahrzeug, Status. Ein Techniker sieht hier immer nur seine EIGENEN Aufträge – das entscheidet die Datenbank zusätzlich zu diesem Haken." },
  { schluessel: "auftraege.anlegen", label: "– Aufträge anlegen", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "neue Aufträge anlegen" },
    erklaerung: "Einen neuen Auftrag anlegen – in der Auftragsliste, im Kalender, beim Kunden oder beim Auslagern (Migration 78). Legt ein Techniker an, steht er danach selbst darauf; sein Zugang muss dafür mit einem Mitarbeiter verknüpft sein.",
    warumNicht: "Anlegen ist eine Handlung; gesehen und geändert wird der Auftrag in der Zeile darüber." },
  { schluessel: "auftraege.wiedereroeffnen", label: "– Wiedereröffnen", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "abgeschlossene oder stornierte Aufträge wiedereröffnen" },
    erklaerung: "Einen erledigten oder stornierten Auftrag mit Begründung wieder öffnen (Migration 78). Bis dahin fest: nur Admin.",
    warumNicht: "Wiedereröffnen ist eine Handlung am Auftrag." },
  { schluessel: "auftraege.transporter", label: "– Transporter einteilen", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "den Transporter eines Auftrags einteilen" },
    erklaerung: "Welcher eigene Transporter zu diesem Auftrag fährt (Migration 78). Bis dahin für Techniker fest gesperrt – das Büro teilt ein.",
    warumNicht: "Der Transporter steht am Auftrag – gesehen wird er dort." },
  { schluessel: "auftraege.storno", label: "– Aufträge stornieren", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "Aufträge stornieren" },
    erklaerung: "Einen Auftrag mit Grund stornieren – er bleibt in der Liste (Migration 77). Bisher hing das an „Auftrag anlegen und ändern“ und war für Techniker fest gesperrt.",
    warumNicht: "Stornieren ist eine Handlung am Auftrag; gesehen wird er über „Auftrag anlegen und ändern“." },
  { schluessel: "auftraege.belege", label: "– Fotos und Unterschrift löschen", unter: true, handlung: true, verben: ["loeschen"],
    klartext: { loeschen: "Fotos und Unterschrift am Auftrag löschen" },
    erklaerung: "Ein Foto oder die Unterschrift wieder vom Auftrag entfernen (Migration 78). Aufnehmen gehört zu „Auftrag ändern“, Löschen ist getrennt – ein Beleg, der verschwindet, fehlt im Streitfall.",
    warumNicht: "Gesehen und aufgenommen werden Fotos mit dem Auftrag (Zeile „Auftrag ändern“)." },
  { schluessel: "auftraege.leistungen", klartext: { lesen: "die Leistungen im Auftrag sehen", schreiben: "Leistungen eintragen und ändern, auch den Endpreis", loeschen: "eingetragene Leistungen wieder entfernen" }, label: "– Leistungen im Auftrag", unter: true,
    verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Artikel und Leistungen an einem Auftrag. „Löschen“ heißt hier: eine versehentlich eingetragene Zeile wieder entfernen – das gehört zum Arbeiten, nicht zum Wegwerfen." },
  { schluessel: "auftraege.preis", label: "– Endpreis überschreiben", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "den Endpreis einer Leistung überschreiben (Sonderpreis)" },
    erklaerung: "Statt des Listenpreises einen eigenen Endpreis für eine Position eintragen (Migration 77). Ohne diesen Haken gilt immer der Preis aus dem Artikelstamm.",
    warumNicht: "Der Preis steht an der Leistung – gesehen wird er mit „Leistungen im Auftrag“." },
  { schluessel: "auftraege.einteilung", klartext: { lesen: "sehen, wer eingeteilt ist", schreiben: "Mitarbeiter einteilen" }, label: "– Mitarbeiter einteilen", unter: true,
    verben: ["lesen", "schreiben"],
    erklaerung: "Wer fährt zu diesem Auftrag? Bewusst getrennt: Wer sich selbst Aufträge zuteilen kann, teilt sich auch fremde zu.",
    warumNicht: "Eine Einteilung wird geändert, nicht gelöscht – wer niemanden mehr zuordnet, hat sie geleert." },
  { schluessel: "auftraege.kontakt", label: "– Kontaktdaten am Auftrag ergänzen", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "eine fehlende E-Mail des Kunden am Auftrag ergänzen" },
    erklaerung: "Fehlt die E-Mail-Adresse des Kunden, lässt sie sich im Auftrag eintragen – auch ohne „Kunden schreiben“ (Migration 77). Eine vorhandene ändert nur, wer Kunden bearbeiten darf. Ein Techniker nur bei Kunden seiner Aufträge.",
    warumNicht: "Die Adresse gehört zum Kunden – gesehen wird sie dort und im Auftrag." },

  { schluessel: "termine", klartext: { lesen: "den Reiter „Termine“ öffnen" }, label: "Termine", verben: ["lesen"],
    erklaerung: "Die chronologische Terminübersicht. Zeigt dieselben Aufträge, nur anders sortiert.",
    warumNicht: "Ein Termin ist ein Auftrag mit Uhrzeit – geschrieben und gelöscht wird bei „Aufträge“." },
  { schluessel: "einsatzplanung", klartext: { lesen: "die Einsatzplanung öffnen" }, label: "Einsatzplanung", verben: ["lesen"],
    erklaerung: "Kalender nach Tag, Woche und Monat.",
    warumNicht: "Die Einsatzplanung zeigt Aufträge – geschrieben und gelöscht wird bei „Aufträge“." },
  { schluessel: "einsatzplanung.verfuegbarkeit", klartext: { lesen: "die Verfügbarkeit ALLER Mitarbeiter sehen", schreiben: "Verfügbarkeit für andere eintragen" }, label: "– Verfügbarkeit aller Mitarbeiter", unter: true,
    verben: ["lesen", "schreiben"],
    erklaerung: "Sehen, wann ALLE Mitarbeiter Zeit haben (Reiter „Verfügbarkeit“, Punkte in der Woche, Hinweise beim Einteilen), und mit „Schreiben“ für sie eintragen – auch für Mitarbeiter ohne Zugang und für vergangene Tage. Die EIGENEN Tage sieht und pflegt jeder mit verknüpftem Mitarbeiter auch ohne dieses Recht (Migration 68).",
    warumNicht: "Austragen IST hier ein Schreiben: Der Tag steht danach wieder auf „nichts eingetragen“. Ein eigenes Löschen gibt es nicht." },

  { schluessel: "lager", klartext: { lesen: "den Reiter „Lager“ öffnen" }, label: "Lager", verben: ["lesen"],
    erklaerung: "Darf der Reiter „Lager“ geöffnet werden? Was darin erlaubt ist, steht in den Zeilen darunter.",
    warumNicht: "Die Modulzeile entscheidet nur über die Sichtbarkeit des Reiters." },
  { schluessel: "lager.regale", klartext: { lesen: "Lager und Plätze sehen", schreiben: "Lager und Plätze anlegen und ändern", loeschen: "Lager und Plätze entfernen" }, label: "– Regale und Plätze verwalten", unter: true,
    verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Die Struktur: Lager anlegen, Lagerplätze nummerieren, umbenennen, entfernen. NICHT das, was darin liegt." },
  { schluessel: "lager.einlagerung", klartext: { lesen: "eingelagerte Reifen sehen", schreiben: "Reifen einlagern und ihre Angaben pflegen" }, label: "– Reifen einlagern", unter: true,
    verben: ["lesen", "schreiben"],
    erklaerung: "Einen Reifensatz auf einen Platz legen und seine Angaben pflegen. Herausgeben, Tausch und Lagergebühr stehen in eigenen Zeilen darunter (Migration 78).",
    warumNicht: "Auslagern IST das Schreiben: Die Einlagerung wird als beendet markiert und bleibt als Historie stehen. Gelöscht wird sie nie – sonst wüsste hinterher niemand mehr, dass der Satz je hier lag." },
  { schluessel: "lager.auslagern", label: "– Reifen auslagern", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "Reifen auslagern oder zum Auslagern vormerken" },
    erklaerung: "Einen Satz herausgeben – sofort oder vorgemerkt für einen Auftrag – und eine Vormerkung zurücknehmen (Migration 78). Einen heute selbst eingelagerten Satz wieder herausnehmen geht auch ohne diesen Haken (Korrektur).",
    warumNicht: "Auslagern ist eine Handlung; gesehen wird der Satz mit „Reifen einlagern“." },
  { schluessel: "lager.gebuehr", label: "– Lagergebühr anpassen", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "die Lagergebühr beim Auslagern anpassen oder weglassen" },
    erklaerung: "Beim Auslagern die Monate ändern oder ohne Gebühr herausgeben, die Gebühr am Auftrag ändern (Migration 78). Ohne diesen Haken gilt: berechnete Monate zum Artikelpreis, und mit einem Auftrag geht es nur mit Gebühr – sofern ein Lagergebühr-Artikel mit Preis gepflegt ist.",
    warumNicht: "Die Gebühr steht als Leistung am Auftrag – gesehen wird sie dort." },
  { schluessel: "lager.tausch", label: "– Reifentausch", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "einen Reifentausch anlegen und verwerfen" },
    erklaerung: "„⇄ Tausch“ am Auftrag: der neue Satz kommt auf den Platz des alten (Migration 69, eigener Haken seit 78).",
    warumNicht: "Ein Tausch wird verworfen, nicht gelöscht – das ist hier ein Schreiben." },
  { schluessel: "lager.raeder", klartext: { lesen: "Radmessungen sehen", schreiben: "Räder einzeln messen", loeschen: "Radmessungen entfernen" }, label: "– Räder einzeln messen", unter: true,
    verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Profiltiefe, DOT, Felge und Sensor je Rad. „Löschen“ heißt: eine falsch erfasste Messung wieder entfernen." },

  { schluessel: "lager.verkauf", klartext: { lesen: "Verkaufsreifen sehen und in den Auftrag übernehmen", schreiben: "Verkaufsreifen erfassen, Preise und Bestand pflegen", loeschen: "Verkaufsreifen löschen" }, label: "– Reifenverkauf", unter: true,
    verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Reifen zum Verkauf erfassen, Preise und Bestand pflegen (Migration 61). „Lesen“ reicht, um im Auftrag einen Reifen aus dem Lager einzutragen – das schreibt eine Leistung, nicht den Bestand. „Löschen“ geht nur, solange der Reifen auf keinem Auftrag stand." },
  { schluessel: "lager.verkauf_ek", label: "– Einkaufspreise im Reifenverkauf", unter: true, verben: ["lesen", "schreiben"],
    klartext: { lesen: "Einkaufspreise und Marge im Reifenverkauf sehen", schreiben: "Einkaufspreise eintragen" },
    erklaerung: "Was ein Verkaufsreifen im Einkauf gekostet hat, samt Lagerwert zum Einkauf und Marge (Migration 77). Ohne „Lesen“ fehlt der Einkauf überall – die Datenbank gibt ihn dann gar nicht heraus.",
    warumNicht: "Ein Einkaufspreis wird geleert, nicht gelöscht." },

  { schluessel: "saison", klartext: { lesen: "die Saisonliste öffnen" }, label: "Saisonliste", verben: ["lesen"],
    erklaerung: "Wer hat welche Reifen bei uns liegen – die halbjährliche Anrufliste.",
    warumNicht: "Die Saisonliste ist eine Auswertung der Einlagerungen – geändert wird bei „Lager“." },

  { schluessel: "artikel", klartext: { lesen: "den Artikelstamm öffnen", schreiben: "Artikel und Preise ändern", loeschen: "Artikel und Preise löschen" }, label: "Artikel und Preise", verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Artikelstamm und Preishistorie. Wer hier schreiben darf, bestimmt, was eine Leistung kostet." },

  { schluessel: "mitarbeiter", klartext: { lesen: "Mitarbeiter sehen", schreiben: "Mitarbeiter anlegen und ändern", loeschen: "Mitarbeiter löschen" }, label: "Mitarbeiter", verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Die Mitarbeiterstammdaten der Einsatzplanung. Ein Techniker sieht damit nur sich selbst und Kollegen, die mit ihm auf einem Auftrag stehen – nicht die ganze Belegschaft. Das entscheidet die Datenbank zusätzlich zu diesem Haken." },
  { schluessel: "firmenfahrzeuge", klartext: { lesen: "die Transporter sehen", schreiben: "Transporter anlegen und ändern", loeschen: "Transporter löschen" }, label: "Firmenfahrzeuge", verben: ["lesen", "schreiben", "loeschen"],
    erklaerung: "Die eigenen Transporter als Stammdaten." },

  { schluessel: "rechnungen", klartext: { lesen: "Rechnungen sehen", schreiben: "Rechnungen ausstellen" }, label: "Rechnungen", verben: ["lesen", "schreiben"],
    erklaerung: "Rechnungen ansehen und ausstellen. „Schreiben“ heißt hier: einen Beleg in die Welt setzen – wer das darf, verschiebt den Nummernkreis. Stornieren steht darunter in einer eigenen Zeile.",
    warumNicht: "Eine Rechnung wird nicht gelöscht, sondern storniert. Eine fehlende Nummer ist eine Lücke im Kreis, und die erklärt man bei der nächsten Prüfung." },

  { schluessel: "rechnungen.storno", label: "– Rechnungen stornieren", unter: true, handlung: true, verben: ["schreiben"],
    klartext: { schreiben: "Rechnungen stornieren" },
    erklaerung: "Eine Stornorechnung zu einer ausgestellten Rechnung erzeugen (Migration 78). Bis dahin an „Rechnungen schreiben“.",
    warumNicht: "Ein Storno ist selbst ein Beleg – gesehen wird es mit den Rechnungen." },
  { schluessel: "auswertung", klartext: { lesen: "Auswertungen und DATEV-Export öffnen" }, label: "Auswertungen", verben: ["lesen"],
    erklaerung: "Umsatz, Kunden, Einsatz, Lager und Artikel; Export für den Steuerberater (DATEV).",
    warumNicht: "Auswertungen rechnen nur – sie legen nichts an und löschen nichts." },
  { schluessel: "chat", klartext: { lesen: "den Team-Chat lesen und dort genannt werden", schreiben: "im Team-Chat schreiben und Aufträge, Kunden oder Lagerplätze hineinstellen" }, label: "Team-Chat", verben: ["lesen", "schreiben"],
    erklaerung: "Ein gemeinsamer Chat für alle mit diesem Recht (Migration 80). Wer „Lesen“ hat, bekommt bei jeder neuen Nachricht eine Push-Meldung und erscheint in der @-Liste. Eine Karte im Chat öffnet den Auftrag oder Kunden nur, wenn man ihn ohnehin sehen darf. Nachrichten werden nach 12 Monaten gelöscht.",
    warumNicht: "Nachrichten werden nicht von Hand gelöscht, sondern nach 12 Monaten automatisch." },
  { schluessel: "einstellungen", klartext: { lesen: "die eigenen Einstellungen öffnen", schreiben: "die eigenen Einstellungen ändern" }, label: "Einstellungen", verben: ["lesen", "schreiben"],
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
  "kunden.fahrzeuge":     { schreiben: ["admin", "techniker", "user"] },
  "kunden.kontakte":      { schreiben: ["admin", "user"] },
  "kunden.dubletten":     { schreiben: ["admin"] },

  auftraege:              { lesen: ["admin", "techniker", "user"] },
  "auftraege.auftrag":    { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "techniker", "user"], loeschen: ["admin", "user"] },
  "auftraege.leistungen": { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "techniker", "user"], loeschen: ["admin", "techniker", "user"] },
  "auftraege.einteilung": { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "user"] },
  "auftraege.storno":     { schreiben: ["admin", "user"] },
  "auftraege.preis":      { schreiben: ["admin", "techniker", "user"] },
  "auftraege.kontakt":    { schreiben: ["admin", "techniker", "user"] },
  "auftraege.anlegen":    { schreiben: ["admin", "user"] },
  "auftraege.wiedereroeffnen": { schreiben: ["admin"] },
  "auftraege.transporter": { schreiben: ["admin", "user"] },
  "auftraege.belege":     { loeschen: ["admin", "user"] },

  termine:                { lesen: ["admin", "techniker", "user"] },
  einsatzplanung:         { lesen: ["admin", "techniker", "user"] },
  "einsatzplanung.verfuegbarkeit": { lesen: ["admin"], schreiben: ["admin"] },

  lager:                  { lesen: ["admin", "techniker", "user"] },
  "lager.regale":         { lesen: ["admin", "techniker", "user"], schreiben: ["admin"], loeschen: ["admin"] },
  "lager.einlagerung":    { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "techniker", "user"] },
  "lager.raeder":         { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "techniker", "user"], loeschen: ["admin", "techniker", "user"] },
  "lager.verkauf":        { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "user"], loeschen: ["admin"] },
  "lager.verkauf_ek":     { lesen: ["admin", "user"], schreiben: ["admin", "user"] },
  "lager.auslagern":      { schreiben: ["admin", "techniker", "user"] },
  "lager.gebuehr":        { schreiben: ["admin", "techniker", "user"] },
  "lager.tausch":         { schreiben: ["admin", "techniker", "user"] },

  saison:                 { lesen: ["admin", "user"] },
  artikel:                { lesen: ["admin", "user"], schreiben: ["admin"], loeschen: ["admin"] },
  mitarbeiter:            { lesen: ["admin", "techniker", "user"], schreiben: ["admin"], loeschen: ["admin"] },
  firmenfahrzeuge:        { lesen: ["admin", "techniker", "user"], schreiben: ["admin"], loeschen: ["admin"] },
  rechnungen:             { lesen: ["admin"], schreiben: ["admin"] },
  "rechnungen.storno":    { schreiben: ["admin"] },
  auswertung:             { lesen: ["admin"] },
  chat:                   { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "techniker", "user"] },
  einstellungen:          { lesen: ["admin", "techniker", "user"], schreiben: ["admin", "techniker", "user"] },
};

// Welche Haken einen anderen voraussetzen (v124). Steht als Hinweis an der Zeile in der
// Rechtematrix, wenn für die gewählte Rolle das eine an und das andere aus ist. Es sperrt nichts:
// Die Datenbank setzt jeden Haken für sich durch. Aber ein Recht, das ins Leere läuft, ist eine
// Einstellung, die man für wirksam hält – so lag „Kennzeichen anlegen“ bis Migration 73 still an
// „Kunden schreiben“. Dass „Schreiben“ oder „Löschen“ in derselben Zeile „Lesen“ braucht und eine
// eingerückte Zeile ihren Reiter, prüft `rechteHinweise()` (lib/rechteAnsicht.ts) ohne Eintrag hier.
export type RechtAbhaengigkeit = { bereich: string; verb: Verb; braucht: { bereich: string; verb: Verb }[]; grund: string };
export const RECHTE_ABHAENGIGKEITEN: RechtAbhaengigkeit[] = [
  { bereich: "auftraege.leistungen", verb: "schreiben", braucht: [{ bereich: "auftraege.auftrag", verb: "lesen" }],
    grund: "Leistungen stehen im Auftrag – ohne „Aufträge sehen“ gibt es keinen Ort, sie einzutragen." },
  { bereich: "auftraege.preis", verb: "schreiben", braucht: [{ bereich: "auftraege.leistungen", verb: "schreiben" }],
    grund: "Den Endpreis ändert man an einer Leistung – ohne „Leistungen eintragen“ gibt es dort nichts zu ändern." },
  { bereich: "auftraege.storno", verb: "schreiben", braucht: [{ bereich: "auftraege.auftrag", verb: "lesen" }],
    grund: "Storniert wird im Auftragsfenster – ohne „Aufträge sehen“ ist es nicht zu öffnen." },
  { bereich: "auftraege.kontakt", verb: "schreiben", braucht: [{ bereich: "auftraege.auftrag", verb: "lesen" }],
    grund: "Die E-Mail wird im Auftrag ergänzt – ohne „Aufträge sehen“ ist er nicht zu öffnen." },
  { bereich: "lager.verkauf_ek", verb: "lesen", braucht: [{ bereich: "lager.verkauf", verb: "lesen" }],
    grund: "Der Einkauf steht am Verkaufsreifen – ohne „Verkaufsreifen sehen“ gibt es keinen." },
  { bereich: "lager.verkauf_ek", verb: "schreiben", braucht: [{ bereich: "lager.verkauf", verb: "schreiben" }],
    grund: "Eingetragen wird im Blatt des Verkaufsreifens – dafür braucht es „Verkaufsreifen erfassen“." },
  { bereich: "auftraege.anlegen", verb: "schreiben", braucht: [{ bereich: "auftraege.auftrag", verb: "schreiben" }],
    grund: "Ein neuer Auftrag öffnet sich zum Ausfüllen – ohne „Auftrag ändern“ bliebe er leer stehen." },
  { bereich: "auftraege.wiedereroeffnen", verb: "schreiben", braucht: [{ bereich: "auftraege.auftrag", verb: "schreiben" }],
    grund: "Wiedereröffnen ändert den Auftrag – dafür braucht es „Auftrag ändern“." },
  { bereich: "auftraege.transporter", verb: "schreiben", braucht: [{ bereich: "auftraege.auftrag", verb: "schreiben" }, { bereich: "firmenfahrzeuge", verb: "lesen" }],
    grund: "Der Transporter wird am Auftrag eingetragen und aus der Liste der Firmenfahrzeuge gewählt." },
  { bereich: "auftraege.belege", verb: "loeschen", braucht: [{ bereich: "auftraege.auftrag", verb: "lesen" }],
    grund: "Fotos stehen im Auftrag – ohne „Aufträge sehen“ ist er nicht zu öffnen." },
  { bereich: "lager.auslagern", verb: "schreiben", braucht: [{ bereich: "lager.einlagerung", verb: "schreiben" }],
    grund: "Ausgelagert wird ein eingelagerter Satz – dafür braucht es „Reifen einlagern“ (die Datenbank verlangt es)." },
  { bereich: "lager.gebuehr", verb: "schreiben", braucht: [{ bereich: "lager.auslagern", verb: "schreiben" }],
    grund: "Die Gebühr entsteht beim Auslagern." },
  { bereich: "lager.tausch", verb: "schreiben", braucht: [{ bereich: "lager.einlagerung", verb: "schreiben" }],
    grund: "Ein Tausch legt einen neuen Satz ins Regal – dafür braucht es „Reifen einlagern“ (die Datenbank verlangt es)." },
  { bereich: "rechnungen.storno", verb: "schreiben", braucht: [{ bereich: "rechnungen", verb: "schreiben" }],
    grund: "Ein Storno ist eine Rechnung mit umgekehrtem Vorzeichen – dafür braucht es „Rechnungen ausstellen“ (die Datenbank verlangt es)." },
  { bereich: "kunden.kontakte", verb: "schreiben", braucht: [{ bereich: "kunden", verb: "lesen" }],
    grund: "Kontakte werden beim Kunden eingetragen – ohne „Kunden sehen“ (der Techniker: Kunden seiner Aufträge) ist er nicht zu finden." },
  { bereich: "kunden.dubletten", verb: "schreiben", braucht: [{ bereich: "kunden", verb: "loeschen" }],
    grund: "Beim Zusammenführen geht der zweite Eintrag in den Papierkorb – das ist ein Löschen." },
  { bereich: "auftraege.einteilung", verb: "schreiben", braucht: [{ bereich: "mitarbeiter", verb: "lesen" }],
    grund: "Zum Einteilen braucht es die Liste der Mitarbeiter." },
  { bereich: "einsatzplanung.verfuegbarkeit", verb: "lesen", braucht: [{ bereich: "mitarbeiter", verb: "lesen" }],
    grund: "Die Verfügbarkeit steht je Mitarbeiter – ohne „Mitarbeiter sehen“ bleibt die Liste leer." },
  { bereich: "einsatzplanung", verb: "lesen", braucht: [{ bereich: "auftraege.auftrag", verb: "lesen" }],
    grund: "Der Kalender zeigt Aufträge – ohne „Aufträge sehen“ bleibt er leer." },
  { bereich: "termine", verb: "lesen", braucht: [{ bereich: "auftraege.auftrag", verb: "lesen" }],
    grund: "Die Terminübersicht zeigt Aufträge – ohne „Aufträge sehen“ bleibt sie leer." },
  { bereich: "lager.raeder", verb: "schreiben", braucht: [{ bereich: "lager.einlagerung", verb: "lesen" }],
    grund: "Gemessen wird am eingelagerten Satz – ohne „eingelagerte Reifen sehen“ ist er nicht zu finden." },
  { bereich: "saison", verb: "lesen", braucht: [{ bereich: "kunden", verb: "lesen" }, { bereich: "lager.einlagerung", verb: "lesen" }],
    grund: "Die Saisonliste ist eine Anrufliste aus Einlagerungen – ohne Kunden fehlen Name und Telefon, ohne Einlagerungen fehlt die Liste." },
  { bereich: "rechnungen", verb: "lesen", braucht: [{ bereich: "auftraege.auftrag", verb: "lesen" }],
    grund: "Rechnungen entstehen am Auftrag." },
  { bereich: "auswertung", verb: "lesen", braucht: [{ bereich: "kunden", verb: "lesen" }, { bereich: "auftraege.auftrag", verb: "lesen" }, { bereich: "rechnungen", verb: "lesen" }],
    grund: "Die Auswertungen rechnen nur mit dem, was die Rolle sehen darf – sonst sind die Zahlen unvollständig." },
];

// Was für eine Rolle unabhängig von der Rechtematrix gilt – Regeln in der Datenbank, die kein
// Haken ändert (Migrationen 41–45, 64, 72–78). Steht in „Ansehen als …“ unter den Haken, damit
// das Bild vollständig ist.
export const ROLLEN_SONDERREGELN: Record<Role, string[]> = {
  techniker: [
    "Sieht nur Aufträge, auf denen er eingeteilt ist. Ohne „Kunden sehen“ sieht er nur die Kunden dieser Aufträge.",
    "Von den Mitarbeitern sieht er nur sich und Kollegen auf gemeinsamen Aufträgen.",
    "Fahrzeuge anlegen, Kontaktdaten ergänzen und Kontakte eintragen (wenn die Haken gesetzt sind) nur bei Kunden seiner Aufträge.",
    "Legt er einen Auftrag an (wenn der Haken gesetzt ist), steht er danach selbst darauf.",
  ],
  user: [
    "Auskunft nach DSGVO und Änderungsprotokoll: nein.",
  ],
  admin: [
    "Darf die Auskunft nach DSGVO erstellen und das Änderungsprotokoll lesen.",
    "Rechte ändern, die Rolle Superadmin vergeben und „Alle Daten löschen“: nur der Superadmin.",
  ],
  superadmin: ["Darf immer alles – unabhängig von dieser Tabelle."],
};

// Der Schlüssel einer Zelle der Rechtematrix: „lager.regale" + „schreiben" → „lager.regale.schreiben".
export function rechtSchluessel(bereich: string, verb: Verb): string {
  return `${bereich}.${verb}`;
}

// Die Gegenrichtung für `canView()` (D16): „lager.regale" ist ein BEREICH, „auftraege.lesen" ist
// Bereich + Verb. Bis v101 wurde am ersten Punkt geteilt – aus „lager.einlagerung" wurde Bereich
// „lager" mit dem Verb „einlagerung", und das gibt es nicht. Jetzt zählt nur ein Verb am ENDE als
// Verb; alles davor ist der Bereich.
export function regelZerlegen(regel: string): { bereich: string; verb: Verb } {
  const teile = regel.split(".");
  const letztes = teile[teile.length - 1] as Verb;
  if (teile.length > 1 && VERBEN.includes(letztes)) return { bereich: teile.slice(0, -1).join("."), verb: letztes };
  return { bereich: regel, verb: "lesen" };
}

export const PERMISSION_ROLES: Role[] = ["admin", "techniker", "user"];

// ---------------------------------------------------------------- Rechnung (Migration 48/49)
//
// Das Logo liegt als data:-URI in einer Datenbankzeile, nicht in einem Speicherdienst. Das ist
// bequem und hat genau eine Grenze: Die Zeile wird bei JEDEM Laden der Betriebsdaten
// mitgeschickt. 200 kB sind dafür die Schmerzgrenze; ein Briefkopflogo braucht bei 300 Pixel
// Breite etwa 15 kB.
// Die Einheiten, die im Artikelstamm zur Auswahl stehen. Eine Vorschlagsliste, KEINE Grenze:
// Das Feld bleibt frei beschreibbar. Vier Werte decken ab, was heute vorkommt – und wer einen
// fünften braucht, soll ihn tippen können, statt auf eine Auslieferung zu warten.
export const EINHEITEN = ["Stück", "Fahrt", "Monate", "Pauschal", "Stunde"];

export const LOGO_MAX_BYTES = 200 * 1024;
export const LOGO_TYPEN = ["image/png", "image/jpeg", "image/svg+xml"];

// Das Seitenformat der gedruckten Rechnung.
//
// Es steht hier und nicht im Stilblatt, weil `@page` für das GANZE Dokument gilt und sich
// nicht je Element umstellen lässt: Fest im Stilblatt käme es dem Etikettendruck von der
// Rolle in die Quere, der seinerseits 50 × 30 mm setzt. Das Rechnungsfenster hängt die Regel
// deshalb ein, solange es offen ist.
//
// Die Ränder stehen HIER und nicht als Innenabstand der Seite: Ein Innenabstand gilt nur für
// die erste Seite. Auf Seite zwei stünde der Text sonst an der Papierkante – nachgestellt mit
// einer 14-Positionen-Rechnung, der Girocode klebte oben am Blattrand.
//
// Maße nach DIN 5008: links 25 mm (Lochrand), rechts 20 mm, oben 15 mm, unten 10 mm.
export const RECHNUNG_SEITE_CSS = "@page { size: A4; margin: 15mm 20mm 10mm 25mm; }";

// ---------------------------------------------------------------- Einsatzplanung
// Farbpalette für Mitarbeiter-Punkte im Kalender – Farbe pro Mitarbeiter ist stabil nach
// Reihenfolge in der Mitarbeiterliste, siehe employeeColorFor() in app/page.tsx.
export const EMP_COLORS = ["#FF5A1F", "#1E9B6E", "#1E3A5F", "#8a5cf6", "#e0447a", "#c9a227", "#2f8fd1", "#a15c2e"];

// Die Filter über der Kundenliste – Reihenfolge, Beschriftung und Schlüssel an einer Stelle
// (Konstanten-Regel, siehe docs/README.md). Vorher standen die sechs Knöpfe als sechs fast
// gleiche Zeilen im JSX; wer einen Zustand ergänzt, hätte ihn an drei Stellen nachtragen
// müssen: Knopf, Filterbedingung und Zählung.
// „rueckruf" (26.09.2026) steht bewusst NICHT in der Knopfliste unten: Er ist kein eigener
// Zustand, sondern ein Ausschnitt von „Offen" – erreichbar über die Karte „Rückrufe heute
// fällig" über der Kundenliste und aus dem Dashboard.
export type KundenFilter = "all" | "offen" | "wiedervorlage" | "termin" | "ok" | "kein_interesse" | "nogeo" | "rueckruf";

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
// öffnet. Gegenstück zu LAGERPLATZ_PARAMETER in lib/aufkleberCode.ts – dasselbe Muster wie
// beim QR-Aufkleber am Regal.
//
// Die Terminerinnerung benutzt `auftrag`: Der Techniker steht im Auto und braucht Fahrzeug,
// Leistungen und die Navigation zu DIESEM Termin – nicht die Kundenakte mit allen Aufträgen
// der letzten Jahre. `kunde` bleibt bestehen, weil es ohne Auftrag trotzdem sinnvoll ist.
export const KUNDE_PARAMETER = "kunde";
export const AUFTRAG_PARAMETER = "auftrag";
// „Auf dem Handy anrufen" (app/api/push/anruf): Der Rechner schickt eine Meldung, das Antippen
// öffnet auf dem Handy ein Fenster mit den Rufnummern dieses Kunden. In der Adresse steht NUR
// die Kennung – eine Rufnummer als Adressparameter landete im Verlauf und in jedem Protokoll,
// das Adressen mitschreibt.
export const ANRUF_PARAMETER = "anruf";
// Abendhinweis „Reifen mitnehmen" (Migration 55): Das Antippen öffnet die Liste der Sätze, die
// am genannten Tag mitmüssen – `/?mitnehmen=YYYY-MM-DD`. Der Tag steht in der Adresse und nicht
// „morgen", weil die Meldung abends kommt und oft erst am nächsten Morgen angetippt wird.
export const MITNEHMEN_PARAMETER = "mitnehmen";
// Team-Chat (Migration 80): `/?chat=1` öffnet den Chat. Die Push-Meldung einer neuen Nachricht
// führt dorthin, nicht in den Auftrag der Karte – man will erst lesen, was dazu geschrieben wurde.
export const CHAT_PARAMETER = "chat";

// Wann der Abendhinweis kommt, solange jemand nichts anderes einstellt. Dieselbe Vorgabe steht
// als Spaltenvorgabe in der Datenbank (`user_settings.abendhinweis_uhrzeit`, Migration 55) –
// dort, weil eine Zeile ohne Wert sonst keinen hätte; hier, weil die Versandroute auch für
// Konten ohne Einstellungszeile eine Antwort braucht.
export const ABENDHINWEIS_UHRZEIT_STANDARD = "20:00";

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

// ---------------------------------------------------------------- Foto und Unterschrift (E3)
//
// Die vier Arten eines Belegs am Auftrag (Migration 65, Prüfregel `auftrag_belege_art_bekannt`), in
// der Reihenfolge der Knöpfe. Der Speicherbereich heißt in der Datenbank genauso wie hier.
export const BELEG_ARTEN: BelegArt[] = ["vorher", "nachher", "schaden", "unterschrift"];
export const BELEG_ART_LABEL: Record<BelegArt, string> = {
  vorher: "Vorher",
  nachher: "Nachher",
  schaden: "Schaden",
  unterschrift: "Unterschrift",
};
export const BELEG_BUCKET = "auftrag-belege";

// ---------------------------------------------------------------- Lager: Fachgröße (E12)
//
// Die zwei Fachgrößen eines Lagerplatzes (Migration 64, Prüfregel `storage_slots_groesse_bekannt`).
// Ab welcher Reifengröße ein großes Fach nötig ist: lib/lagerAnsicht.ts, `brauchtGrossesFach`.
export const PLATZ_GROESSE_LABEL: Record<PlatzGroesse, string> = {
  normal: "normales Fach",
  gross: "großes Fach",
};

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

// Notiz je Rad (Migration 71): die Spalte am Satz je Position, und wie lang eine Notiz sein darf
// (dieselbe Grenze steht als Prüfregel in der Datenbank, `tire_storage_notiz_je_rad_laenge`).
export const RAD_NOTIZ_SPALTE: Record<RadPosition, "notiz_vl" | "notiz_vr" | "notiz_hl" | "notiz_hr"> = {
  VL: "notiz_vl", VR: "notiz_vr", HL: "notiz_hl", HR: "notiz_hr",
};
export const RAD_NOTIZ_MAX = 300;

export const FELGE_LABEL: Record<Felge, string> = {
  stahl: "Stahl",
  alu: "Alu",
  keine: "ohne Felge",
};

export const FELGEN: Felge[] = ["stahl", "alu", "keine"];

// ---------------------------------------------------------------- Lager: Reifenverkauf (Migration 61)
//
// Neu oder gebraucht – dieselben zwei Werte als Prüfregel in der Datenbank
// (`verkaufsreifen_zustand_bekannt`). Jeder Zustand hat seinen Artikel: Ein neuer Reifen darf
// nur auf „Reifen neu" stehen, ein gebrauchter nur auf „Reifen gebraucht" – das prüft die
// Datenbank (`position_verkaufsreifen_pruefen`), hier steht nur die Zuordnung zum Nachschlagen.
export const REIFEN_ZUSTAENDE: ReifenZustand[] = ["neu", "gebraucht"];

export const REIFEN_ZUSTAND_LABEL: Record<ReifenZustand, string> = {
  neu: "Neu",
  gebraucht: "Gebraucht",
};

export const REIFENVERKAUF_ART: Record<ReifenZustand, Article["abrechnungsart"]> = {
  neu: "reifenverkauf_neu",
  gebraucht: "reifenverkauf_gebraucht",
};

// Die Abrechnungsarten im Artikelstamm, in der Reihenfolge der Auswahlknöpfe.
export const ABRECHNUNGSARTEN: Article["abrechnungsart"][] = ["normal", "lagergebuehr", "reifenverkauf_neu", "reifenverkauf_gebraucht"];

export const ABRECHNUNGSART_LABEL: Record<Article["abrechnungsart"], string> = {
  normal: "Wenn erbracht",
  lagergebuehr: "Lagergebühr (Monate)",
  reifenverkauf_neu: "Reifenverkauf neu",
  reifenverkauf_gebraucht: "Reifenverkauf gebraucht",
};

// Ab wann ein NEUREIFEN als alt gilt. Drei Jahre ist die übliche Grenze, bis zu der ein Reifen
// im Handel als „neu" durchgeht; danach gehört es dem Kunden gesagt. Für gebrauchte gilt die
// Grenze der Einlagerung (`DOT_ALT_JAHRE`).
export const NEUREIFEN_ALT_JAHRE = 3;

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
// `GEO_GENAUIGKEIT_LABEL` stand hier bis v101 und wurde nirgends gelesen – das Kundenfenster
// erklärt die Genauigkeit in ganzen Sätzen (DetailModal, `geoSatz`). Entfernt (Fahrplan C2).

export const PROFIL_GESETZLICH_MM = 1.6;
export const PROFIL_KRITISCH_MM = 3;
export const PROFIL_HINWEIS_MM = 4;
// Die obere Schranke der Eingabe. Ein fabrikneuer Reifen hat je nach Art 8 bis 10 mm, ein
// grobstolliger Geländereifen kommt an 20 heran – 25 lässt jeden davon zu und fängt trotzdem
// den Tippfehler ab, bei dem aus 6 eine 66 wird. Stand bis zum 21.09.2026 als nackte Zahl in
// `RadBild.tsx`; seit dort auch von Hand getippt werden kann, gilt sie an zwei Stellen und
// gehört deshalb hierher.
export const PROFIL_MAX_MM = 25;
// Die Schnellwerte unter der Profiltiefe (RadBild/ProfilEingabe): ein Tipp für den großen
// Sprung, −/+ für die Feinkorrektur. 1 bis 8 mm (Wunsch vom 29.09.2026) – im Entwurf standen
// 3 bis 8; auch die abgefahrenen Reifen sollen mit einem Tipp erfasst sein.
export const PROFIL_SCHNELLWERTE_MM = [1, 2, 3, 4, 5, 6, 7, 8];

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

// ---------------------------------------------------------------- Protokoll (Migration 36)
//
// Nach wie vielen Monaten personenbezogene Felder im Protokoll geschwärzt werden (B1). Die Zahl
// steht als Vorgabe in `protokoll_schwaerzen()` (Migration 56, nächtlich über pg_cron); hier nur
// für den Text im Auskunftsauszug (E10). Wer eine Stelle ändert, ändert beide.
export const PROTOKOLL_SCHWAERZEN_MONATE = 36;
//
// Der Trigger schreibt Tabellen- und Spaltennamen, wie sie in der Datenbank heißen. Für
// jemanden, der das Protokoll liest, ist „order_articles.net_price“ keine Auskunft, sondern
// eine Zumutung. Hier steht die Übersetzung – einmal, weil sie an zwei Stellen gebraucht
// wird (Adminliste und Auftragsfenster).
//
// Was NICHT übersetzt ist, wird im Rohnamen angezeigt statt verschwiegen: Ein Feld, das
// niemand benannt hat, ist immer noch eine Änderung, die stattgefunden hat.
// „Alle Daten löschen“ (Migration 72): das Wort, das der Superadmin zum Bestätigen eintippt. Dasselbe
// Wort prüft die Datenbank in `alle_daten_loeschen()`.
export const ALLE_DATEN_BESTAETIGUNG = "löschen";

export const PROTOKOLL_TABELLE_LABEL: Record<string, string> = {
  orders: "Auftrag",
  betrieb: "Betriebsdaten",
  rechnungen: "Rechnung",
  order_articles: "Leistung im Auftrag",
  order_employees: "Mitarbeiter am Auftrag",
  customers: "Kunde",
  vehicles: "Fahrzeug",
  contact_history: "Kontakteintrag",
  tire_storage: "Einlagerung",
  eingelagerte_raeder: "Einzelnes Rad",
  verkaufsreifen: "Verkaufsreifen",
  auftragsvorlagen: "Auftragsvorlage",
  storage_slots: "Lagerplatz",
  warehouses: "Lager",
  articles: "Artikel",
  article_prices: "Artikelpreis",
  firmenfahrzeuge: "Firmenfahrzeug",
  // Migration 44. Fehlte bis zum 23.09.2026 (Fahrplan C4) und erschien im Protokoll als Rohname.
  auftrag_fahrzeuge: "Fahrzeug am Auftrag",
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
  rechnung_extern: "anderswo abgerechnet",
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
  // Leistung, Fortsetzung
  endpreis_netto: "Endpreis netto",
  // Artikel (Migration 46/48/50)
  abrechnungsart: "Abrechnungsart", fragt_einlagerung: "fragt nach Altreifen",
  einheit: "Einheit", freitext: "Bezeichnung am Auftrag",
  // Auftrag / Lager, Nachzügler
  end_time: "Uhrzeit bis", entnahme_order_id: "Auslagerung mit Auftrag",
  // Migration 67: die Lagergebühr gehört zu einem Reifensatz.
  lager_satz_id: "Lagergebühr für Reifensatz",
  kundennummer: "Kundennummer",
  // Nachgezogen am 23.09.2026 (Fahrplan C4): Diese Spalten stehen in protokollierten Tabellen,
  // hatten aber keine Beschriftung und erschienen im Protokoll als Rohname. Gegengeprüft gegen
  // alle Spalten aller Tabellen mit Protokoll-Trigger; ohne Beschriftung bleiben nur die
  // technischen, die ohnehin nicht angezeigt werden (siehe `PROTOKOLL_STILLE_FELDER` in
  // lib/helpers.ts).
  kilometerstand: "Kilometerstand", laufkundschaft: "Laufkundschaft",
  // Migration 57
  laufkunde_name: "Name des Laufkunden", laufkunde_telefon: "Telefon des Laufkunden",
  laufkunde_ort: "Einsatzort des Laufkunden", einmalkunde: "Einmalkunde",
  kennzeichen: "Kennzeichen", bezeichnung: "Bezeichnung", bemerkung: "Bemerkung",
  notiz: "Notiz", aktiv: "aktiv", date: "Datum",
  short_name: "Kurzbezeichnung", long_name: "Langbezeichnung", article_number: "Artikelnummer",
  valid_from: "gültig ab", valid_to: "gültig bis",
  read_roles: "Rollen mit Leserecht", edit_roles: "Rollen mit Schreibrecht",
  delete_roles: "Rollen mit Löschrecht",
  felge: "Felge", sensor: "RDKS-Sensor", reifengroesse: "Reifengröße",
  // Migration 72
  alle_daten_geloescht: "alle Daten gelöscht", zugaenge_geloescht: "Zugänge gelöscht",
  // Migration 71
  notiz_vl: "Notiz vorne links", notiz_vr: "Notiz vorne rechts", notiz_hl: "Notiz hinten links", notiz_hr: "Notiz hinten rechts",
  // Migration 56: der eine Eintrag, der nach dem endgültigen Löschen eines Kunden übrig bleibt.
  endgueltig_geloescht: "endgültig gelöscht (DSGVO)",
  tire_storage_id: "Einlagerung", braucht_lagerplatz: "braucht Lagerplatz (bis Migration 46)",
  // Reifenverkauf (Migration 61)
  zustand: "Zustand", breite: "Breite", querschnitt: "Querschnitt", zoll: "Zoll",
  kennung: "Last-/Geschwindigkeitsindex", hersteller: "Hersteller", modell: "Modell", dot: "DOT",
  runflat: "Runflat", xl: "XL (verstärkt)", eprel: "EPREL-Nummer", preis_netto: "Verkaufspreis netto",
  ek_netto: "Einkaufspreis netto", bestand: "Bestand", reserviert: "reserviert", verkauft: "verkauft",
  verkaufsreifen_id: "Reifen aus dem Lager",
  // Betrieb: der Briefkopf (Migration 38/48). Er steht im Protokoll, weil er auf jeder
  // Rechnung landet – „warum steht auf den Rechnungen seit gestern eine andere IBAN" ist
  // genau die Frage, für die es das Protokoll gibt.
  termin_intervall_min: "Terminraster (Min.)",
  firma: "Firma", inhaber: "Inhaber", strasse: "Straße", plz: "PLZ", ort: "Ort",
  telefon: "Telefon", webseite: "Webseite",
  ust_id: "USt-IdNr.", steuernummer: "Steuernummer",
  kontoinhaber: "Kontoinhaber", bank: "Bank", iban: "IBAN", bic: "BIC", logo: "Logo",
  anschreiben: "Anschreiben",
  fuss_zahlung: "Fußzeile: Zahlung", fuss_hinweis: "Fußzeile: Hinweis", fuss_dank: "Fußzeile: Dank",
  rechnung_praefix: "Rechnungs-Präfix",
  rechnung_naechste_nummer: "nächste Rechnungsnummer",
  kunde_naechste_nummer: "nächste Kundennummer",
  // Migration 59: DATEV-Export
  datev_berater: "DATEV-Beraternummer", datev_mandant: "DATEV-Mandantennummer",
  datev_wj_beginn_monat: "DATEV: Beginn Wirtschaftsjahr (Monat)", datev_sachkontenlaenge: "DATEV: Sachkontenlänge",
  datev_skr: "DATEV: Kontenrahmen", datev_konto_19: "DATEV: Erlöskonto 19 %", datev_konto_7: "DATEV: Erlöskonto 7 %",
  datev_konto_0: "DATEV: Erlöskonto 0 %", datev_debitor_basis: "DATEV: Debitor = Kundennummer +",
  datev_sammeldebitor: "DATEV: Sammeldebitor",
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
