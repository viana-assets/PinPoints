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

export const APP_VERSION = "v140";

export type Neuigkeit = {
  version: string;
  datum: string; // JJJJ-MM-TT
  titel: string;
  punkte: string[];
};

export const NEUIGKEITEN: Neuigkeit[] = [
  {
    version: "v140", datum: "2026-10-09", titel: "Navigation am iPhone",
    punkte: [
      "„Navigation › Google Maps“ bzw. „Apple Karten“ springt am iPhone jetzt direkt in die Karten-App. Das leere weiße Fenster, das beim Zurückwechseln in der App stehen blieb, gibt es nicht mehr.",
      "Ist Google Maps nicht installiert, öffnet es sich wie bisher im Browser.",
    ],
  },
  {
    version: "v139", datum: "2026-10-09", titel: "Termin aus dem Kalender wählen",
    punkte: [
      "Im Auftrag oben auf den Termin tippen: Es geht der Monat wie in der Einsatzplanung auf – mit Punkten, wo schon Termine liegen. Mit ‹ › oder Wischen blättern.",
      "Tag antippen, dann im Tagesplan in die Uhrzeit tippen. Von und Bis lassen sich darüber noch genau einstellen.",
      "„Fertig“ übernimmt Tag und Uhrzeit in den Auftrag – gespeichert wird wie immer mit „Auftrag anlegen“ bzw. „Speichern“.",
    ],
  },
  {
    version: "v138", datum: "2026-10-09", titel: "Haken im Chat, Feierabend, Stempel-Erinnerung",
    punkte: [
      "Im Chat stehen an deinen Nachrichten Haken wie bei WhatsApp: ✓ gesendet, ✓✓ grau bei allen angekommen, ✓✓ grün von allen gelesen.",
      "Wer seinen letzten Auftrag des Tages erledigt, wird gefragt „Für heute fertig?“. „Ja, Feierabend“ stempelt aus und schreibt 30 Minuten Heimfahrt gut – in der Zeiterfassung steht, wie oft.",
      "Neue Erinnerung aufs Handy: 30 Minuten vor dem ersten Termin, wenn du noch nicht eingestempelt bist, und 30 Minuten nach dem letzten, wenn du noch eingestempelt bist. Abschalten unter Einstellungen.",
    ],
  },
  {
    version: "v137", datum: "2026-10-08", titel: "Chat: Einzelchats, Bearbeiten, Fotos",
    punkte: [
      "Im Chat führt der Knopf oben rechts zu allen Unterhaltungen: Team-Chat und Einzelchats. Einen Einzelchat lesen nur ihr beide – auch kein Admin.",
      "Eigene Nachricht lange drücken (am Rechner ☺): „Bearbeiten“ geht in den ersten 24 Stunden, „Löschen“ jederzeit. Dann steht dort „Nachricht gelöscht“.",
      "Fotos im Chat: der Kamera-Knopf neben „+“. Antippen zeigt das Foto groß.",
      "Ganz oben im Verlauf holt „Ältere Nachrichten laden“ weiter zurückliegende Nachrichten.",
    ],
  },
  {
    version: "v136", datum: "2026-10-08", titel: "Zeiterfassung: Monat, Urlaub, Export",
    punkte: [
      "Unter „Zeiterfassung“ gibt es jetzt „Monat“: deine Arbeitszeit, Pausen und Urlaub im ganzen Monat.",
      "Wer „Zeiten aller“ sieht, schaltet unter „Alle“ zwischen Woche und Monat um und kann Urlaub eintragen – ganzer Tag, halber Tag oder eigene Stunden, immer mit Grund.",
      "Export für Lohn oder Steuerberater: „CSV (Excel)“ und ein Arbeitszeitnachweis zum Drucken oder als PDF, eine Seite je Person mit Unterschriftszeilen.",
      "Im Tag steht jetzt, wer eine Zeit korrigiert hat, wann und warum.",
    ],
  },
  {
    version: "v135", datum: "2026-10-08", titel: "Einheitliches Aussehen",
    punkte: [
      "Rechnung, Auskunft (DSGVO) und die Etiketten- und Aufkleberfenster sehen jetzt aus wie alle anderen Fenster. Die Knöpfe stehen unten; gedruckt wird wie bisher nur das Blatt selbst.",
      "Unter „Rechnungen“ führen „Zum Auftrag“ und „Zum Kunden“ jetzt oben im Fenster direkt weiter.",
      "Die Anmeldeseite, die Einstellungen und Admin › Wartung passen sich dem übrigen Stil an.",
      "Knöpfe und Umschalter sind überall gleich geformt. Die alten Admin-Seiten /admin/users und /admin/invite gibt es nicht mehr – Einladen und Rollen stehen unter Admin › Nutzer.",
    ],
  },
  {
    version: "v134", datum: "2026-10-08", titel: "Fenster im neuen Stil",
    punkte: [
      "Neuer Auftrag, Einlagern, Auslagern, Anrufen, Mitnehmen, der Scanner und „Noch nicht übertragen“ sehen jetzt aus wie die übrigen Fenster: größerer Titel, rundes ✕, Felder in grauen Gruppen.",
      "Der Knopf zum Speichern bleibt unten stehen – auch beim langen Einlagern-Fenster muss man nicht mehr ans Ende scrollen.",
      "Am Handy kommen diese Fenster von unten herein statt den ganzen Bildschirm zu füllen.",
      "Bei der Kundenauswahl erscheinen die Treffer, sobald du tippst; der gewählte Kunde steht als Karte mit „Ändern“ da.",
    ],
  },
  {
    version: "v133", datum: "2026-10-08", titel: "Mehr Platz am Rechner",
    punkte: [
      "Am Rechner stehen Aufträge, Rechnungen, Artikel, Lager, Einsatzplanung, Auswertungen, Zeiterfassung und Admin jetzt linksbündig und nutzen die ganze Breite des Bildschirms.",
      "Aufträge, Rechnungen und Artikel stehen als Karten nebeneinander – auf einem großen Monitor zwei oder drei pro Zeile.",
      "Einsatzplanung (Monat): Auf breiten Bildschirmen steht der gewählte Tag rechts neben dem Kalender. Zeiterfassung: links die Stempeluhr, rechts Tag oder Woche.",
      "Kleine Schrift, Eingabefelder und Knöpfe sind am Rechner etwas größer. Am Handy bleibt alles wie bisher.",
    ],
  },
  {
    version: "v132", datum: "2026-10-08", titel: "Stoppuhr über dem Chat",
    punkte: [
      "Über der Chat-Blase unten rechts sitzt jetzt eine Stoppuhr. Ein Tipp darauf führt in die Zeiterfassung. Läuft deine Zeit, ist sie grün und zeigt die Stunden.",
      "In der Zeiterfassung steht die Stempeluhr jetzt ganz oben – ein- und ausstempeln geht dort genauso wie im Dashboard.",
    ],
  },
  {
    version: "v131", datum: "2026-10-08", titel: "Stempeluhr",
    punkte: [
      "Neu: die Stempeluhr ganz oben im Dashboard – einstempeln, Pause, weiter, ausstempeln. Solange sie läuft, steht oben rechts eine grüne Anzeige mit deiner Arbeitszeit; ein Tipp darauf öffnet die Stempeluhr.",
      "Unter „Zeiterfassung“ siehst du deinen Tag und deine Woche. Wer das Recht hat, sieht unter „Alle“ die Woche aller Mitarbeiter und kann vergessene Stempelungen mit Grund korrigieren.",
      "Wer die Stempeluhr nutzt, steht unter Admin › Rechte in der Zeile „Zeiterfassung“. Techniker sind dort noch nicht freigeschaltet.",
    ],
  },
  {
    version: "v130", datum: "2026-10-08", titel: "Chat: Reaktionen und Antworten",
    punkte: [
      "Im Team-Chat kannst du auf eine Nachricht reagieren: am Handy lange auf die Nachricht drücken, am Rechner auf das kleine ☺ daneben. Zur Wahl stehen 👍 👎 ❤️ 😂 😮 ✅.",
      "Über dieselbe Leiste antwortest du direkt auf eine Nachricht – sie steht dann als Zitat über deiner Antwort. Ein Tipp auf das Zitat springt zur ursprünglichen Nachricht.",
      "Wer eine Antwort oder Reaktion auf seine Nachricht bekommt, erhält eine Mitteilung aufs Handy.",
    ],
  },
  {
    version: "v129", datum: "2026-10-08", titel: "Team-Chat",
    punkte: [
      "Neu: der Team-Chat. Die dunkle Sprechblase unten rechts öffnet ihn, die rote Zahl zeigt, was du noch nicht gelesen hast – am iPhone auch am App-Symbol.",
      "Im Auftrag und beim Kunden (⋯) sowie am Lagerplatz und am Verkaufsreifen gibt es „In den Chat“: Die Sache hängt dann als Karte an deiner Nachricht. Ein Tipp auf die Karte öffnet sie.",
      "Mit @ sprichst du jemanden direkt an. Bei jeder neuen Nachricht kommt eine Mitteilung aufs Handy, wie bei der Terminerinnerung.",
      "Wer mitlesen und schreiben darf, steht unter Admin › Rechte in der neuen Zeile „Team-Chat“. Nachrichten werden nach 12 Monaten gelöscht.",
    ],
  },
  {
    version: "v128", datum: "2026-10-08", titel: "Rechnung ohne E-Mail, Kundenart",
    punkte: [
      "Mit „Rechnung nötig“ lässt sich ein Auftrag jetzt auch ohne E-Mail-Adresse des Kunden abschließen.",
      "Unter Aufträge › „Rechnungen noch nicht ausgestellt“ steht dann rot „E-Mail hinterlegen“. Nachtragen geht im Auftrag unter „Rechnung nötig“ – auch, wenn er schon erledigt ist.",
      "In der Kundenliste gibt es neben A–Z den Filter „Kundenart“: Privatkunden, Firmenkunden, Einmalkunden, Testkunden.",
    ],
  },
  {
    version: "v127", datum: "2026-10-08", titel: "Aufgeräumt",
    punkte: [
      "Unter der Haube neu sortiert: Aufträge und Kunden haben eigene Bausteine. Für dich ändert sich nichts – künftige Änderungen werden dadurch sicherer.",
    ],
  },
  {
    version: "v126", datum: "2026-10-08", titel: "Zehn weitere Rechte",
    punkte: [
      "Unter Admin › Rechte gibt es eigene Haken für: Aufträge anlegen, Wiedereröffnen, Transporter einteilen, Fotos und Unterschrift löschen, Reifen auslagern, Lagergebühr anpassen, Reifentausch, Rechnungen stornieren, Kontakte eintragen und Dubletten zusammenführen.",
      "Alle Haken sind so gesetzt, wie es bisher galt – es ändert sich erst etwas, wenn du einen umstellst.",
      "Darf ein Techniker Aufträge anlegen, steht er danach selbst darauf.",
    ],
  },
  {
    version: "v125", datum: "2026-10-08", titel: "Fünf neue Rechte",
    punkte: [
      "Unter Admin › Rechte gibt es eigene Haken für: Endpreis überschreiben, Stornieren, Kontaktdaten am Auftrag, Fahrzeuge anlegen und ändern sowie Einkaufspreise im Reifenverkauf.",
      "Die Haken sind so gesetzt, wie es bisher galt. Neu ist nur: Der Techniker sieht den Einkaufspreis nicht mehr – wer will, setzt den Haken.",
      "Stornieren und Löschen sind für den Techniker jetzt Haken statt fester Sperre (ab Werk aus).",
    ],
  },
  {
    version: "v124", datum: "2026-10-08", titel: "Rechte übersichtlicher",
    punkte: [
      "Unter Admin › Rechte lassen sich Aufträge, Einsatzplanung und Lager einklappen. Zugeklappt steht dabei, wie viel die gewählte Rolle dort darf – etwa „8 von 12 erlaubt“.",
      "Läuft ein Haken ins Leere – zum Beispiel „Mitarbeiter einteilen“ ohne „Mitarbeiter sehen“ –, steht ein Hinweis mit Begründung an der Zeile.",
      "„Ansehen als …“ zeigt in Sätzen, was die Rolle kann und was nicht, dazu die Regeln, die immer gelten.",
    ],
  },
  {
    version: "v123", datum: "2026-10-07", titel: "Etikett je Rad als Vorgabe",
    punkte: [
      "Beim Etikett für den Reifensatz ist jetzt „Ein Etikett je Rad (VL, VR, HL, HR)“ vorgewählt. Wer nur ein Etikett für den ganzen Satz braucht, stellt es wie bisher um.",
    ],
  },
  {
    version: "v122", datum: "2026-10-07", titel: "Reifentausch: Platz wieder frei",
    punkte: [
      "Wurde ein Auftrag mit Reifentausch storniert oder gelöscht, blieb der neue Satz unsichtbar auf dem Platz stehen – ein späterer Tausch auf diesen Platz scheiterte mit einer Fehlermeldung. Jetzt verschwindet er mit dem Auftrag, und solche Reste sind einmal aufgeräumt.",
    ],
  },
  {
    version: "v121", datum: "2026-10-07", titel: "Rechte aufgeräumt",
    punkte: [
      "In der Datenbank standen noch alte, zu weite Regeln aus der Anfangszeit. Jetzt gilt genau das, was in der Rechtetabelle steht – für alle Rollen.",
      "Der Techniker sieht damit nur noch die Kunden seiner eigenen Aufträge. Im Lager steht bei Sätzen anderer Kunden „Unbekannter Kunde“.",
      "Den Transporter am Auftrag teilt weiterhin das Büro ein – das prüft jetzt auch die Datenbank.",
    ],
  },
  {
    version: "v120", datum: "2026-10-07", titel: "Tagesliste nach Uhrzeit",
    punkte: [
      "In der Einsatzplanung stehen die Aufträge unter dem Monatskalender jetzt nach Uhrzeit – der früheste Termin oben, Aufträge ohne Uhrzeit am Ende.",
    ],
  },
  {
    version: "v119", datum: "2026-10-07", titel: "Techniker ergänzt E-Mail und Fahrzeugangaben",
    punkte: [
      "Fehlt beim Kunden die E-Mail-Adresse, kann sie jetzt auch der Techniker im Auftrag eintragen – sonst ließ sich ein Auftrag mit „Rechnung nötig“ nicht abschließen. Eine schon hinterlegte Adresse ändert weiter das Büro.",
      "Am Fahrzeug im Auftrag gibt es „Modell / Reifengröße ergänzen“ – für alle, die am Auftrag arbeiten, auch für den Techniker.",
      "Beim Auslagern im Lager bietet die App dem Techniker keinen „neuen Auftrag“ mehr an – den legt das Büro an.",
    ],
  },
  {
    version: "v118", datum: "2026-10-07", titel: "Techniker trägt neue Kennzeichen ein",
    punkte: [
      "Der Techniker kann im Auftrag jetzt selbst ein neues Kennzeichen anlegen – bisher lehnte die Datenbank das ab, weil dafür das Recht zum Bearbeiten von Kunden nötig war. Danach erscheint auch das Feld für den Kilometerstand.",
      "Das geht nur für Kunden, auf deren Aufträgen er eingeteilt ist. Fahrzeuge ändern oder löschen bleibt beim Büro.",
    ],
  },
  {
    version: "v117", datum: "2026-10-06", titel: "Alle Daten löschen (nur Superadmin)",
    punkte: [
      "Unter Admin › Wartung kann der Superadmin jetzt alle Daten löschen und die App auf null stellen – wie bei einem frischen Unternehmen: Kunden, Aufträge, Rechnungen, Lager, Artikel, Mitarbeiter, Transporter, Briefkopf, Fotos und Protokoll. Die Nummern beginnen danach neu.",
      "Übrig bleiben nur die Zugänge mit der Rolle Admin oder Superadmin und die Rechte. Alle anderen Zugänge werden gelöscht.",
      "Vorher zeigt das Fenster, was alles weggeht, und bietet eine Sicherung als Datei an. Gelöscht wird erst, wenn das Wort „löschen“ klein eingetippt und bestätigt ist.",
    ],
  },
  {
    version: "v116", datum: "2026-10-06", titel: "Ruhigerer Monatskalender",
    punkte: [
      "Im Monat der Einsatzplanung steht unter den Tagen kein grünes „x frei“ mehr – der Kalender zeigt wieder nur die Termine. Wer wann Zeit hat, steht weiter im Reiter „Verfügbarkeit“, als Punkte in der Woche und beim Einteilen im Auftrag.",
    ],
  },
  {
    version: "v115", datum: "2026-10-06", titel: "Notiz je Rad beim Einlagern",
    punkte: [
      "Beim Einlagern lässt sich jetzt zu jedem einzelnen Reifen eine Notiz eintragen – etwa „Schraube in der Lauffläche“ am Rad vorne rechts. Dazu bleibt die Notiz zum ganzen Satz. Das geht im Auftrag und im Lager unter „Bearbeiten“, auch bei „Ein Wert für den Satz“ und auch ohne Netz.",
      "Die Notizen stehen im Platz-Blatt, am Auftrag beim nächsten Wechsel, im Kundenfenster und auf dem Etikett des Rades. Die Lagersuche findet sie: Wer „Schraube“ sucht, findet den Satz.",
      "Gibt der Kunde die Reifen zum Verkauf ab, kommt die Notiz mit an den Posten.",
    ],
  },
  {
    version: "v114", datum: "2026-10-06", titel: "Unterschrift steht nach dem Abschluss fest",
    punkte: [
      "Ist ein Auftrag abgeschlossen und unterschrieben, steht die Unterschrift fest: Es gibt kein „Neu unterschreiben lassen“ und kein Löschen mehr. Wer wirklich neu unterschreiben lassen muss, öffnet den Auftrag erst wieder.",
      "Fehlt die Unterschrift beim Abschluss noch, lässt sie sich nachholen – etwa wenn der Kunde nicht da war. Fotos lassen sich wie bisher auch nach dem Abschluss ergänzen.",
    ],
  },
  {
    version: "v113", datum: "2026-10-05", titel: "Fahrzeuge und Kilometerstand auch ohne Netz",
    punkte: [
      "Im Auftrag lassen sich jetzt auch ohne Netz Fahrzeuge zuordnen, entfernen und der Kilometerstand eintragen. Die Änderungen warten oben in der Leiste und gehen von selbst raus, sobald wieder Netz da ist.",
      "Ein neues Kennzeichen beim Kunden lässt sich ebenfalls offline anlegen. Beim Senden wird noch einmal nachgesehen, ob es das Auto beim Kunden schon gibt – dann wird das vorhandene genommen.",
      "Die Fahrzeuge der Aufträge der nächsten zwei Wochen legt die App vorab aufs Gerät. Wer ohne Netz einen solchen Auftrag öffnet, sieht sie trotzdem.",
    ],
  },
  {
    version: "v112", datum: "2026-10-05", titel: "Verfügbarkeit und Reifentausch",
    punkte: [
      "In der Einsatzplanung gibt es den Reiter „Verfügbarkeit“. Jeder Techniker trägt dort ein, an welchen Tagen er Zeit hat – ganzer Tag oder ein Zeitfenster, mit „Vorlage …“ auch gleich für mehrere Wochen. Er sieht dabei nur sich selbst.",
      "Admins sehen alle auf einen Blick (eine Woche, eine Zeile je Mitarbeiter) und tragen für Mitarbeiter ohne eigenen Zugang selbst ein. Im Monat steht an jedem Tag „x frei“, in der Woche zeigen Punkte, wer Zeit hat.",
      "Beim Einteilen im Auftrag stehen oben die, die an dem Tag Zeit haben; der Rest steht eingeklappt darunter. Wer eingeplant ist, ohne sich eingetragen zu haben, bekommt am Termin ein rotes „!“.",
      "Reifentausch: Ist im Auftrag ein Satz zum Auslagern vorgemerkt, legt „Tausch auf …“ den anderen Satz auf denselben Platz. Beim Abschließen geht der alte raus und der neue rein.",
    ],
  },
  {
    version: "v111", datum: "2026-10-05", titel: "Auslagern erst beim Abschließen",
    punkte: [
      "„Auslagern“ im Auftrag merkt die Reifen jetzt nur vor. Sie bleiben im Regal und belegen ihren Platz, bis der Auftrag abgeschlossen wird – erst dann gelten sie als ausgelagert. Wird der Termin storniert, bleiben sie einfach liegen.",
      "Im Auftrag steht unter „Aus dem Lager“, auf welchem Platz die Reifen liegen – auch nach dem Abschluss. Im Lager tragen vorgemerkte Plätze die Marke „vorgemerkt · Auftragsnummer“, und die Suche findet sie über die Auftragsnummer.",
      "Die Lagergebühr wird bis zum Termin gerechnet, nicht bis heute. „Zurücknehmen“ hebt die Vormerkung auf und nimmt die Gebühr gleich mit.",
      "Im Kundenfenster steht unter „Früher eingelagert“, wo die Reifen früher lagen. Wer Reifen ohne Auftrag herausgibt (der Kunde holt sie selbst ab), wählt im Dialog „Ohne Auftrag – jetzt gleich auslagern“.",
    ],
  },
  {
    version: "v110", datum: "2026-10-04", titel: "Freie Termine grau, Suche mit ×",
    punkte: [
      "Im Kalender (Woche und Tag) sind Termine, die noch niemandem zugeteilt sind, jetzt hellgrau hinterlegt statt weiß – man sieht sie auf einen Blick.",
      "Jedes Suchfeld in den Listen (Kunden, Aufträge, Lager, Rechnungen …) hat am Ende ein ×, das den Suchtext auf einmal löscht – jetzt auch am iPhone.",
    ],
  },
  {
    version: "v109", datum: "2026-10-04", titel: "Rechnung anderswo erstellt",
    punkte: [
      "Ein erledigter Auftrag lässt sich jetzt als „anderswo abgerechnet“ vermerken, wenn die Rechnung in einem anderen System entstanden ist – auf Wunsch mit deren Rechnungsnummer. Er verschwindet dann aus „Rechnungen noch nicht ausgestellt“ und zählt in der Auswertung mit seinem Betrag. Zu finden im Auftrag bei der Rechnung oder im Menü „⋯“; zurücknehmen geht jederzeit.",
      "Rechnungen für die Laufkundschaft lassen sich ausstellen – bisher verlangte das Fenster eine Anschrift, die es dort nicht gibt.",
      "Aus dem Rechnungsbuch druckt das iPhone die Rechnung jetzt richtig, nicht mehr als leeres Blatt.",
      "Einzeln gelöschte Aufträge stehen im Papierkorb (Admin) und lassen sich zurückholen.",
      "Kleinigkeiten: In den Einstellungen steht bei Technikern jetzt „Techniker“, und der Hinweis beim DATEV-Export nennt den richtigen Reiter „Betrieb“.",
    ],
  },
  {
    version: "v108", datum: "2026-10-04", titel: "Etikett aus dem Auftrag, Kennzeichen groß",
    punkte: [
      "„Etikett drucken“ im Auftrag öffnet das Etikettfenster jetzt sichtbar vorne. Bisher lag es am Handy hinter dem Auftrag und erschien erst nach dem Schließen.",
      "Kennzeichen werden beim Eintippen immer groß geschrieben – am iPhone steht die Tastatur gleich auf Großbuchstaben. Das gilt beim Kunden, im Auftrag, beim Einlagern und bei den Transportern.",
    ],
  },
  {
    version: "v107", datum: "2026-10-04", titel: "Im Kalender wischen",
    punkte: [
      "In der Einsatzplanung lässt sich jetzt auch durch Wischen blättern: nach links wischen zeigt den nächsten Monat, die nächste Woche oder den nächsten Tag, nach rechts wischen den vorherigen – je nachdem, welche Ansicht gerade offen ist. Die Pfeile oben bleiben.",
      "Gewischt wird auf dem Kalender selbst. Senkrecht scrollen, einen Termin lang drücken und ziehen und mit zwei Fingern zoomen gehen wie bisher.",
    ],
  },
  {
    version: "v106", datum: "2026-10-02", titel: "Sicherer und aufgeräumt",
    punkte: [
      "QR-Aufkleber und Terminerinnerungen springen jetzt auch beim allerersten Öffnen auf einem neuen Gerät an die richtige Stelle – vorher landete man dann auf der Startseite.",
      "Strengere Sicherheitsregeln im Browser: Die App führt nur noch Programmcode aus, den sie selbst mitgebracht hat. Für die Arbeit ändert sich nichts.",
      "Im Hintergrund aufgeräumt und mit mehr automatischen Prüfungen versehen – sichtbar wird davon nichts, außer dass seltener etwas kaputtgeht.",
    ],
  },
  {
    version: "v105", datum: "2026-10-02", titel: "Fotos und Unterschrift am Auftrag",
    punkte: [
      "Im Auftragsfenster gibt es die Karte „Fotos & Unterschrift“: Zustand vorher und nachher fotografieren, einen Schaden festhalten, auf Wunsch mit Beschriftung („Felge VL“). Die Fotos werden vor dem Hochladen verkleinert.",
      "Der Kunde unterschreibt mit dem Finger auf dem Handy – mit dem Satz „Arbeiten ausgeführt, Fahrzeug übernommen“ und seinem Namen. Fehlt die Unterschrift, erinnert der Fuß des Auftrags daran; abschließen geht trotzdem.",
      "Fotos und Unterschrift gehen nur mit Netz. Löschen kann nur, wer Aufträge löschen darf.",
    ],
  },
  {
    version: "v104", datum: "2026-10-02", titel: "Tagesroute, Stapel-Auslagern und Terminbestätigung",
    punkte: [
      "Tagesroute: In der Einsatzplanung zeigt „Route ›“ je Mitarbeiter die kürzeste Reihenfolge ab der Firmenadresse und zurück – mit den gesparten Kilometern und einem Knopf für Google Maps. Die Uhrzeiten bleiben, wie sie sind.",
      "Saisonwechsel: Im Mitnehmen-Fenster (oder Lager → „⋯“) lagert „Der Reihe nach auslagern“ die Sätze des Tages in der Reihenfolge des Regals aus – je Satz ein Tipp, die Lagergebühr kommt gleich auf den Auftrag.",
      "Terminbestätigung: Im Auftragsfenster schreibt „Bestätigen“ eine Bestätigung oder Erinnerung für den Kunden. Verschickt wird sie vom eigenen Handy per WhatsApp, SMS oder E-Mail.",
    ],
  },
  {
    version: "v103", datum: "2026-10-02", titel: "Dubletten, Auskunft, große Fächer und Reifenverkauf",
    punkte: [
      "Doppelt angelegte Kunden: „Neuer Kunde“ warnt jetzt auch bei gleicher Telefonnummer, E-Mail oder Name mit PLZ. Unter Admin → „Dubletten“ lassen sich zwei Kunden zu einem zusammenführen.",
      "Auskunft nach DSGVO: Im Kundenfenster unter „⋯“ stellt „Auskunft“ alles Gespeicherte zu einem Kunden zusammen – zum Drucken, als PDF oder als Datei (nur Admin).",
      "Lagerplätze können als „großes Fach“ markiert werden. Für SUV- und 20-Zoll-Reifen stehen die großen Fächer in der Auswahl oben; ein normales Fach gibt einen Hinweis.",
      "Lässt ein Kunde seine Reifen da, macht „Kunde lässt sie da · zum Verkauf“ im Lagerplatz daraus Verkaufsposten – Größe, DOT und Profil kommen mit. Verkaufsreifen bekommen ein Etikett mit QR-Code.",
      "Auswertungen: Der neue Reiter „Reifen“ zeigt Umsatz neu und gebraucht, Marge, Lagerwert im Verlauf und was seit über sechs Monaten liegt.",
    ],
  },
  {
    version: "v102", datum: "2026-10-02", titel: "Vorlagen, Telefonsuche und viele kleine Verbesserungen",
    punkte: [
      "Auftragsvorlagen: Unter „Artikel“ lassen sich Leistungspakete wie „Saisonwechsel mobil“ anlegen. Im Auftrag trägt „+ Vorlage“ alle Leistungen mit einem Tipp ein.",
      "Die Kundensuche findet jetzt auch Telefonnummern – egal ob mit Schrägstrich, Leerzeichen oder +49 geschrieben.",
      "Im Lager: Ist ein Lager zu 90 % voll, steht das deutlich da. Passt die Reifengröße eines gemessenen Rades nicht zum Fahrzeug, erscheint ein Hinweis.",
      "Ein stornierter Auftrag wird jetzt „wieder aufgenommen“ – mit dem Stornogrund vor Augen. Wer ohne eine einzige Leistung auf „Erledigt“ tippt, wird einmal gefragt.",
      "In der Einsatzplanung zeigt „Storniert“ die abgesagten Termine. Freie Lagerplätze sind nach Lager sortiert, große Aufkleberbögen werden in Teilen gedruckt.",
    ],
  },
  {
    version: "v101", datum: "2026-10-02", titel: "Arbeiten ohne Netz",
    punkte: [
      "Im Funkloch oder in der Tiefgarage lässt sich jetzt weiterarbeiten: Notiz, Titel und Beschreibung, Termin, Leistungen und die Radmessung werden auf dem Handy gespeichert und übertragen, sobald wieder Netz da ist.",
      "Unten steht dann „1 Änderung wartet auf Netz“, im Auftrag oben „auf dem Gerät gespeichert – noch nicht übertragen“. Antippen zeigt, was noch aussteht.",
      "Hat in der Zwischenzeit jemand dasselbe Feld geändert, fragt die App nach, welche Fassung gelten soll – nichts wird still überschrieben.",
      "Abschließen, Ein- und Auslagern und Kundendaten brauchen weiterhin Netz.",
    ],
  },
  {
    version: "v100", datum: "2026-10-02", titel: "Packliste, Löschschutz, IBAN-Prüfung",
    punkte: [
      "Neu im Dashboard: die Packliste für heute oder morgen – welche Leistungen anstehen (z. B. 8× Räderwechsel) und welche Reifengrößen die Autos fahren. Dieselbe Liste steht im Fenster hinter dem Abendhinweis.",
      "Ein abgerechneter Auftrag lässt sich nicht mehr löschen – über ihn findet man die Rechnung. Bei erledigten und stornierten Aufträgen fragt die App eigens nach.",
      "Die IBAN in den Betriebsdaten wird jetzt geprüft: Ein Tippfehler fällt schon beim Eintragen auf, nicht erst beim Kunden.",
      "Hinter den Kulissen: Listen mit gleichem Datum stehen immer in derselben Reihenfolge, und die Adresssuche ist gegen Dauerabfragen gebremst.",
    ],
  },
  {
    version: "v99", datum: "2026-10-02", titel: "Etiketten: Format wieder wählbar, Regalaufkleber für den Brother",
    punkte: [
      "Beim Etikett für den Reifensatz lässt sich das Format wieder wählen: 58 × 58 mm ist voreingestellt, 60 × 86 mm (groß) steht zur Auswahl.",
      "Die Aufkleber fürs Regal drucken jetzt ebenfalls auf dem Brother – 58 × 58 oder 60 × 86 mm, als PDF über „Drucken“ wie beim Reifensatz. Groß steht der Platz darauf, klein das Lager. Der A4-Bogen für den Bürodrucker bleibt als dritte Wahl.",
    ],
  },
  {
    version: "v98", datum: "2026-10-02", titel: "Profiltiefe: Umschalten löscht nichts mehr",
    punkte: [
      "Im Lager unter „Bearbeiten“ löschte schon das Antippen von „Je Rad messen“ den Wert für den Satz – auch ohne Speichern. Jetzt bleibt er, bis du „Zuordnung speichern“ tippst oder das erste Rad misst. Mit ✕ bleibt alles, wie es war.",
      "Im Auftragsfenster genauso: „Je Rad messen“ zeigt erst nur die Räder, der Satzwert bleibt bis zum ersten gemessenen Rad.",
      "Die Lagerliste zeigt jetzt, wie gemessen wurde: „Satzwert“ in der Zeile, bei Einzelmessung „je Rad 5,0 · 5,5 · 6,0 · 6,0“.",
    ],
  },
  {
    version: "v97", datum: "2026-10-02", titel: "Knöpfe besser erkennbar",
    punkte: [
      "„Nach neuer Version suchen“ in den Einstellungen ist jetzt ein orangefarbener Knopf.",
      "Weiße Knöpfe in Fenstern und Karten – etwa „Schließen“ beim Etikett, „Abbrechen“, „Zurück“ – haben jetzt einen Rand und sind als Knopf zu erkennen.",
    ],
  },
  {
    version: "v96", datum: "2026-10-02", titel: "Etiketten: immer 58 × 58 mm",
    punkte: [
      "Etiketten für Reifensatz und Einzelräder kommen jetzt immer im Format 58 × 58 mm – die Formatauswahl ist weg, die anderen Formate gibt es nicht mehr.",
      "Gedruckt wird wie bisher: „Drucken“, im Teilen-Menü „Drucken“, Drucker QL-820NWB, Papierformat 58 x 58 mm.",
    ],
  },
  {
    version: "v95", datum: "2026-10-02", titel: "Etiketten für den Brother: richtige Größe",
    punkte: [
      "Zwei neue Formate für den Brother QL-820NWBc, beide mit QR-Code oben: 60 × 86 mm (groß) und 58 × 58 mm (sparsam). 62 × 100 und 62 × 40 gibt es nicht mehr.",
      "„Drucken“ erzeugt jetzt ein PDF in genau der Etikettengröße – ohne Datum und „Seite 1 von 1“ unten und ohne Verkleinern. Im Teilen-Menü „Drucken“ wählen, Drucker QL-820NWB und das Papierformat, das im Fenster steht.",
      "Auf dem Satz-Etikett steht „eingelagert seit …“ jetzt in einer eigenen Zeile, nichts wird mehr abgeschnitten.",
    ],
  },
  {
    version: "v94", datum: "2026-10-01", titel: "Auftrag: anlegen und erledigt",
    punkte: [
      "Ein Auftrag hat jetzt nur noch zwei Schritte: Bei einem neuen Auftrag unten „Auftrag anlegen“, wenn die Arbeit getan ist „Auftrag erledigt“. „Arbeit beginnen“ gibt es nicht mehr.",
      "Wer einen neuen Auftrag schließt, ohne ihn anzulegen, wird gefragt: anlegen oder verwerfen. So bleibt kein halb angelegter Auftrag liegen.",
      "Beim neuen Auftrag steht oben kein „Speichern“ – das übernimmt „Auftrag anlegen“. Später, beim Ändern, erscheint „Speichern“ oben wie gewohnt.",
    ],
  },
  {
    version: "v93", datum: "2026-10-01", titel: "Auftrag anlegen – ein Knopf statt zwei",
    punkte: [
      "Unten im Auftragsfenster steht jetzt immer nur ein Knopf: bei einem neuen Auftrag „Auftrag anlegen“, danach „Arbeit beginnen“, in Arbeit „Auftrag abschließen“. „Direkt abschließen“ (zum Nachtragen) steht im Menü „⋯“.",
      "Ein Fahrzeug, das der Kunde schon hat, wird beim Eintippen des Kennzeichens nicht mehr ein zweites Mal angelegt. Schon doppelt angelegte stehen in der Auswahl als „(doppelt angelegt)“ und lassen sich im Kundenfenster löschen.",
      "Ein neu angelegtes Fahrzeug erscheint sofort in „+ weiteres Fahrzeug des Kunden“ – vorher fehlte es dort, obwohl das Lager es schon zeigte.",
    ],
  },
  {
    version: "v92", datum: "2026-09-30", titel: "Etiketten für den Brother-Drucker",
    punkte: [
      "Beim Etikett gibt es zwei neue Formate für den Brother QL-820NWBc mit der 62-mm-Rolle: 62 × 100 mm hoch (großer QR-Code, voreingestellt) und 62 × 40 mm quer. Der Drucker schneidet jedes Etikett einzeln ab.",
      "Am Handy: Wireless Direct am Drucker einschalten, das iPhone mit dem WLAN des Druckers verbinden und „Drucken“ – oder über Bluetooth „Als Bild teilen“ und in der App „Brother iPrint&Label“ drucken.",
      "Behoben: Beim Drucken kam vorher zuerst ein leeres Etikett heraus.",
    ],
  },
  {
    version: "v91", datum: "2026-09-30", titel: "Termin verschoben? Rückgängig bleibt da",
    punkte: [
      "Nach dem Verschieben eines Termins in der Einsatzplanung steht unten, wo er vorher war und wo er jetzt ist – mit einem leuchtenden Knopf „Rückgängig“. Der Hinweis bleibt, bis man ihn mit ✕ schließt. Mehrere Verschiebungen lassen sich nacheinander zurücknehmen.",
      "In der Historie des Auftrags (Menü „⋯“ → Historie) steht bei jeder Terminänderung direkt „von wann auf wann“, beim Anlegen der ursprüngliche Termin. Aufgeklappt holt „Termin von vorher übernehmen“ den alten Termin zurück ins Fenster – dann nur noch „Speichern“.",
    ],
  },
  {
    version: "v90", datum: "2026-09-30", titel: "Neues App-Symbol",
    punkte: [
      "Das Symbol auf dem Startbildschirm und in den Mitteilungen ist jetzt das ganze Logo „Mobiler Reifenservice – Wo auch immer Sie sind“ auf Schwarz.",
      "Auf dem Handy erscheint es meist erst, wenn die App einmal vom Startbildschirm entfernt und neu hinzugefügt wird. Die Anmeldung bleibt dabei erhalten; danach die Mitteilungen in den Einstellungen einmal neu einschalten.",
    ],
  },
  {
    version: "v89", datum: "2026-09-29", titel: "Profiltiefe je Rad: neues Radbild",
    punkte: [
      "Beim Einlagern (im Lager und im Auftrag) sind die vier Räder jetzt große Kacheln am Auto. Rad antippen, darunter den Wert eingeben – mit den Schnellwerten 1 bis 8 mm oder fein mit − und +.",
      "Es gibt keinen „Übernehmen“-Knopf mehr: Der Wert wird von selbst gespeichert. „Weiter zu VR ›“ springt zum nächsten Rad, „Für alle vier“ übernimmt einen Wert für alle.",
      "Felge, RDKS-Sensor, Größe, DOT und Bemerkung zu einem Rad stehen unter „Mehr zu diesem Rad“. Auch der Wert für den ganzen Satz hat jetzt die Schnellwerte.",
    ],
  },
  {
    version: "v88", datum: "2026-09-29", titel: "Neuer Name: MR Assistent",
    punkte: [
      "Die App heißt jetzt „MR Assistent“ und trägt das Zeichen des Mobilen Reifenservice – auf dem Startbildschirm, im Browser, bei der Anmeldung und in den Mitteilungen. Statt „Settings“ mit Zahnrad steht jetzt der Name und das Logo da.",
      "Auf dem Handy erscheint das neue Symbol oft erst, wenn die App einmal vom Startbildschirm entfernt und neu hinzugefügt wird. Die Anmeldung bleibt dabei erhalten; danach die Mitteilungen in den Einstellungen einmal neu einschalten.",
      "Im Lager lässt sich beim Einlagern und Bearbeiten eines Satzes jetzt wieder wählen: ein Wert für den ganzen Satz oder die Profiltiefe für jedes Rad einzeln – wie im Auftragsfenster.",
    ],
  },
  {
    version: "v87", datum: "2026-09-28", titel: "Auftrag: Termin und Team direkt im Fenster",
    punkte: [
      "Datum, Uhrzeit von–bis, Mitarbeiter und Transporter stehen jetzt direkt in der Karte „Termin & Team“ – ohne erst auf „Ändern“ zu tippen. So fällt sofort auf, wenn noch niemand eingeteilt ist.",
      "Gespeichert wird wie alles andere mit „Speichern“ – oben im Kopf oder direkt unter der Karte, sobald etwas geändert ist.",
    ],
  },
  {
    version: "v86", datum: "2026-09-26", titel: "Reifenverkauf aus dem Lager",
    punkte: [
      "Im Lager gibt es oben den neuen Reiter „Verkauf“: Neue und gebrauchte Reifen – auch Kompletträder – mit Größe, Hersteller, Saison, DOT, Profil, Preis und Einkaufspreis erfassen. Vier gleiche Reifen sind ein Eintrag mit Bestand 4. Das Lager „Zuhause“ geht auch ohne Plätze.",
      "Im Auftrag unter „Leistungen“: „Reifen aus dem Lager“ sucht beim Tippen – „235“, „235 55 17“ oder „Michelin“ – und steht schon auf der Reifengröße des Fahrzeugs. Stückzahl wählen, hinzufügen: Preis und Beschreibung kommen vom Reifen.",
      "Solange der Auftrag offen ist, sind die Reifen reserviert und für andere Aufträge gesperrt. Beim Abschließen werden sie aus dem Bestand gebucht; Position entfernen oder Auftrag stornieren gibt sie wieder frei.",
      "Neu im Artikelstamm: „Reifen neu“ und „Reifen gebraucht“. Plätze mit Verkaufsreifen sind in der Regalwand grün und nehmen keinen Kundensatz auf.",
    ],
  },
  {
    version: "v85", datum: "2026-09-26", titel: "Termine immer auf der Karte",
    punkte: [
      "In „Termine“ und in der Saisonliste zeigt die Karte jetzt immer alle Kunden der Auswahl – auch wenn in „Kunden“ ein Zustand wie „Termin“ ausgeblendet ist. Die Zustands-Knöpfe stehen dort nicht mehr.",
    ],
  },
  {
    version: "v84", datum: "2026-09-26", titel: "Termine auf der Karte",
    punkte: [
      "Behoben: Bei „7 Tage“, „Anstehend“ und „Alle“ blieb die Karte, wo sie war – lagen die Termine woanders, stand dort „Keine Kunden in diesem Ausschnitt“. Jetzt rückt die Karte auf die Termine, auch in der Saisonliste.",
      "Termine werden auf der Karte nicht mehr zu Bündeln zusammengefasst, damit jede Nadel mit ihrer Uhrzeit sichtbar bleibt.",
    ],
  },
  {
    version: "v83", datum: "2026-09-26", titel: "Große Bildschirme",
    punkte: [
      "Auf 22- bis 27-Zoll-Monitoren wird die App jetzt insgesamt größer dargestellt – Schrift, Knöpfe, Listen und Fenster wachsen gleichmäßig mit, statt klein in viel leerem Raum zu stehen. Am Notebook und am Handy bleibt alles, wie es ist.",
      "Behoben: In Admin → Nutzer lief die Rollenwahl über den Kartenrand hinaus.",
    ],
  },
  {
    version: "v82", datum: "2026-09-26", titel: "Wochenplan: ganze Woche und feste Tageszeile",
    punkte: [
      "Am Handy zeigt die Woche jetzt alle sieben Tage auf einen Blick, ohne seitliches Wischen. Ein Tipp auf einen Tag oben öffnet ihn als Tagesplan.",
      "Die Zeile mit den Tagen bleibt beim Herunterscrollen oben stehen, bis der Wochenplan zu Ende ist – auch am Rechner.",
    ],
  },
  {
    version: "v81", datum: "2026-09-26", titel: "Einstellungen: Uhrzeit des Abendhinweises",
    punkte: [
      "Behoben: Das Uhrzeitfeld des Abendhinweises nahm die ganze Zeile ein, der Text daneben stand ein Wort je Zeile.",
    ],
  },
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
