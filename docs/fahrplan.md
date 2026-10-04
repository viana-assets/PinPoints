# Fahrplan

Alles, was offen ist – an genau einer Stelle. Diese Datei ersetzt die früheren
`roadmap.md`, `architektur-review-2026-08.md`, `lager-ausbaukonzept.md` und
`termine-kontakt-auftrag-analyse.md`. Die vier sind gelöscht; was von ihnen noch gilt,
steht hier oder in der jeweiligen Baustein-Doku. Wer den alten Wortlaut braucht, findet
ihn im Git-Verlauf des Repositorys.

Grundlage: vollständige Durchsicht des Projekts am 18.09.2026 (alle 50 Migrationen, der
gesamte Code unter `app/`, `components/`, `lib/`, `public/`, `tests/`, alle Dokumente).

**Regel:** Ist ein Punkt erledigt, wird er hier gestrichen – nicht abgehakt stehen
gelassen. Sonst entsteht wieder das, was am 18.09.2026 aufgeräumt wurde.

---

## Zuletzt erledigt

* **04.10.2026 – Freie Termine grau, Suche mit × (Service Worker v110, ohne Migration).**
  Termine ohne zugeteilten Mitarbeiter sind im Stundenraster hellgrau statt weiß. Jedes
  Listen-Suchfeld hat ein × zum Leeren, auch am iPhone (`components/SuchFeld.tsx`, neun Stellen).

* **04.10.2026 – Rechnung anderswo, Fehler aus dem Handbuch (Migration 66, Service Worker v109).**
  Erledigte Aufträge lassen sich als „anderswo abgerechnet" vermerken (Wunsch 04.10.2026: ein
  zweites System schreibt manche Rechnungen). Behoben: Rechnung für Laufkundschaft gesperrt,
  leerer Druck aus dem Rechnungsbuch am iPhone, kein Weg zurück für einzeln gelöschte Aufträge
  (jetzt Papierkorb), Rolle „Nutzer" beim Techniker, DATEV-Hinweis „Betriebsdaten", zwei
  veraltete Doku-Stellen (Protokoll lesen, Uhrzeit-Pflicht, Wiedereröffnen).

* **04.10.2026 – Etikett aus dem Auftrag, Kennzeichen groß (Service Worker v108).** Das
  Satz-Etikett lag am Handy hinter dem Auftragsfenster (eigene Ebene `.modal-etikett`, 10004).
  Kennzeichenfelder schreiben groß (`KennzeichenFeld`, `kennzeichenGross()`).

* **04.10.2026 – Wischen im Kalender (Service Worker v107, ohne Migration).** In der
  Einsatzplanung blättert ein Wisch nach links weiter, nach rechts zurück (Monat, Woche, Tag),
  ohne dem Termin-Ziehen, dem Zoomen oder dem Scrollen in die Quere zu kommen
  (`lib/wischen.ts`, siehe `auftraege.md` Abschnitt 5).

* **02.10.2026 – Runde 1 der großen Liste (Migration 63, Service Worker v102).** D8 (`mit_steuer`
  festgeschrieben), D10 (Telefon-Vergleichsform, Kundensuche über die Nummer), D11 (Filter
  „Storniert" in der Einsatzplanung), D12 (stornierten Auftrag „wieder aufnehmen", mit Grund),
  D13 (Rückfrage beim Abschließen ohne Leistung), D14 (freie Plätze nach Lager gruppiert), D16
  (`canView` über `regelZerlegen`), D18 (Aufkleber in Teilen zu 40), C1 (tote Spalte weg), C2
  (toter Code: `GEO_GENAUIGKEIT_LABEL`, Prop `pflicht`, doppeltes `QrBild`; `rechtSchluessel`
  wird jetzt benutzt), C3 (siehe unten), E6 (Auftragsvorlagen), E8 (Reifengrößen-Abgleich),
  E11 (Lager ab 90 % belegt).

* **02.10.2026 – Offline schreiben, Runde 1 (Service Worker v101).** Ausgangskorb aus Absichten
  (`lib/offline/`), Balken „n Änderungen warten", Fenster „Noch nicht übertragen" mit
  Konfliktentscheidung. Offline: Titel, Beschreibung, Termin, Notiz, Leistungen, Radmessung.

* **02.10.2026 – D2, D4, D17, B3 und E2 in einer Runde (Migration 62, Service Worker v100).**
  Abgerechnete Aufträge lassen sich nicht mehr löschen (Datenbank und Oberfläche,
  `lib/auftragLoeschen.ts`); erledigte und stornierte fragen eigens nach (damit auch D9: jede
  Löschfrage nennt die Auftragsnummer). Alle seitenweisen Abfragen sind eindeutig sortiert
  (`tests/sortierung.test.ts`). Die IBAN wird beim Speichern geprüft (Länge je Land, Prüfsumme).
  Die Adressdienste zählen je Nutzer und Minute in der Datenbank (`fremdabfrage_erlaubt()`).
  Neu im Dashboard und im Mitnehmen-Fenster: die **Packliste** – Leistungen und Reifengrößen
  des Tages (`lib/packliste.ts`).

* **02.10.2026 – Etikettenformat wieder wählbar, Regalaufkleber für den Brother (Service Worker v99).**
  58 × 58 voreingestellt, 60 × 86 wählbar; Regalaufkleber ebenso als PDF, A4-Bogen bleibt.

* **02.10.2026 – Profiltiefe: Umschalten löscht nichts mehr (Service Worker v98).** „Je Rad messen"
  ist ein Entwurf bis zum Speichern bzw. ersten Rad; Lagerliste zeigt „Satzwert" bzw. „je Rad …".
  Rückhol-Skript für verlorene Werte in `PinPoints\lokal\`.

* **02.10.2026 – Knöpfe erkennbar (Service Worker v97).** „Nach neuer Version suchen" orange,
  weiße Nebenknöpfe in Fenstern und Karten mit Rand (`btn-rand`).

* **02.10.2026 – Nur noch ein Etikettenformat: 58 × 58 mm (Service Worker v96).** Drucken im Betrieb
  bestätigt; Formatauswahl und alle anderen Formate entfallen.

* **02.10.2026 – Brother-Druck im Betrieb getestet, Formate angepasst (Service Worker v95).** 60 × 86 und
  58 × 58 mm (QR oben), „Drucken" als PDF in exakter Größe (ohne Safari-Fußzeile/Verkleinerung),
  „eingelagert seit" in eigener Zeile. 62 × 100 und 62 × 40 entfallen.

* **01.10.2026 – Auftrag: „Anlegen" und „Erledigt" statt drei Schritten (Service Worker v94).**
  „Arbeit beginnen" entfällt; neuer Auftrag fragt beim Schließen „anlegen oder verwerfen".

* **01.10.2026 – Auftrag: ein Knopf unten, Fahrzeuge ohne Dubletten (Service Worker v93).**
  „Auftrag anlegen" beim neuen Auftrag; Kennzeichen-Abgleich beim Anlegen; Fahrzeuglisten
  laden nach dem Anlegen überall neu.

* **30.09.2026 – Etiketten für den Brother QL-820NWBc (Service Worker v92).** Formate 62 × 100 mm
  hoch und 62 × 40 mm quer mit 300 dpi; leeres erstes Druckblatt behoben.

* **30.09.2026 – Termin verschieben: Rückgängig bleibt, Historie zeigt von wann auf wann (Service
  Worker v91).** Hinweis „vorher → jetzt" mit leuchtendem Rückgängig-Knopf bleibt bis zum
  Schließen, mehrere Schritte zurück; Historie/Protokoll mit Terminzeile und „Termin von vorher
  übernehmen".

* **30.09.2026 – Neues App-Symbol (Service Worker v90).** Das ganze Logo „Mobiler Reifenservice"
  auf Schwarz als Symbol für Startbildschirm, iOS und Mitteilungen (`public/icons/mr-logo-*.png`).

* **29.09.2026 – Reifen je Rad: neues Radbild (Service Worker v89).** Entwurf „X1" umgesetzt:
  große Radkacheln, Eingabe offen unter dem Bild, Schnellwerte 1–8 mm, automatisches
  Speichern, „Weiter zu …" und „Für alle vier"; gleiche Eingabe für den Satzwert, im Lager und
  im Auftragsfenster.

* **29.09.2026 – Neuer Name „MR Assistent" (Service Worker v88).** Marke „Mobiler Reifenservice"
  mit Signet in App, Anmeldung, Mails und Symbolen; Tarnung „Settings" aufgehoben. Dazu im Lager
  beim Einlagern/Bearbeiten wieder die Wahl „ein Wert für den Satz / Räder einzeln".

* **28.09.2026 – Auftrag: Termin & Team offen (Service Worker v87).** Datum, von–bis,
  Mitarbeiter und Transporter stehen direkt in der Karte statt im Blatt hinter „Ändern" – dort
  wurden sie beim Anlegen vergessen. Speichern im Kopf oder unter der Karte.

* **26.09.2026 – Reifenverkauf aus dem Lager (Migration 61, Service Worker v86).** Neue und
  gebrauchte Reifen und Kompletträder als eigener Bestand (`verkaufsreifen`), Lager-Reiter
  „Verkauf", im Auftrag „+ Reifen aus dem Lager" mit Suche beim Tippen und Vorbelegung aus der
  Reifengröße des Fahrzeugs. Reservieren beim Eintragen, Abbuchen beim Abschließen, beides von
  der Datenbank gezählt; ein Platz hält Kundensatz ODER Verkaufsreifen. Artikel „Reifen neu" /
  „Reifen gebraucht", Rechte-Bereich `lager.verkauf`. Einzelheiten: `docs/lager.md`,
  „Reifenverkauf". Offen daraus: E16 (E17 und E18 seit v103 erledigt).

* **26.09.2026 – Termine immer auf der Karte (Service Worker v85).** Bei einer Auswahl (Termine,
  Saisonliste) gelten die Zustands-Pillen nicht mehr und werden nicht gezeigt – ein in „Kunden"
  ausgeblendetes „Termin" hatte dort alle Termine versteckt.

* **26.09.2026 – Termine auf der Karte (Service Worker v84).** Die Karte richtet sich jetzt auch
  bei „7 Tage/Anstehend/Alle" und in der Saisonliste auf die Auswahl aus (vorher nur im
  Tagesmodus); eine Auswahl wird erst ab `BUENDEL_AUSWAHL_AB` Nadeln gebündelt.

* **26.09.2026 – Desktop 13 bis 27 Zoll (Service Worker v83).** Ab 1680 CSS-Punkten Breite wird
  die ganze Seite gleichmäßig vergrößert (1,1 / 1,2 / 1,35 / 1,6); Höhen in `vh`, Knopfmenüs und
  Stundenraster rechnen den Zoom heraus. Einzelheiten: `docs/design-system.md`,
  „Desktop-Skalierung". Dazu: Rollenwahl in Admin → Nutzer lief über den Rand.

* **26.09.2026 – Wochenplan: ganze Woche am Handy, feste Tageszeile (Service Worker v82).**
  Sieben Tage nebeneinander statt vier zum Wischen, Tag im Kopf antippen öffnet ihn; die
  Tageszeile bleibt unter der Bedienleiste stehen (Einzelheiten in `docs/auftraege.md`, Abschnitt 5).

* **26.09.2026 – Handy: zurück aus der Karte (Service Worker v80).** Seit v79 ist die untere
  Leiste bei offener Karte sichtbar; die Karte blieb aber beim Tippen darauf stehen und
  überdeckte jede Seite. Der Zustand „Karte offen" wird jetzt mit dem Reiter gemerkt
  (`karteOffenIn`), und ein Tipp auf die Leiste schließt die Karte.

* **26.09.2026 – Karte und Nadeln neu (Entwurf W, Service Worker v79, keine Migration).**
  Nadeln aus einer Quelle (`components/karte/nadel.ts`, Farben als Tokens in `globals.css`),
  Terminnadeln mit Uhrzeit; Zustände als Pillen mit Anzahl statt des Schalters „Nadeln";
  Bündel bis Zoomstufe 13 mit Anteilsring (`lib/karte.ts`); Kundenkarte statt Leaflet-Popup
  (am Rechner an der Nadel, am Handy als Blatt); Termine → Heute/Morgen als Tag auf der Karte
  mit nummerierten Stationen, Luftlinie je Mitarbeiter und Streifen zum Wischen; Suche auf der
  Karte am Handy, „Mein Standort", Legende. Nebenbei behoben: Die Permissions-Policy sperrte Kamera und Standort
  ganz (`camera=()`, `geolocation=()`) – der QR-Scanner in Lager und Einlagerung konnte deshalb
  nie auf die Kamera zugreifen; jetzt `(self)`. Am Handy lag die untere Leiste bei offener Karte
  unsichtbar hinter ihr, und der Balken „Position setzen" war am Handy nur halb so breit.

* **26.09.2026 – Versionsanzeige, „Was gibt es Neues" und Testkunden (Service Worker v78,
  Migration 60).** Die Fassung steht in den Einstellungen (`APP_VERSION` in `lib/version.ts`,
  gleichlaufend mit `public/sw.js`); Admin und Superadmin sehen „Was gibt es Neues" (Blatt mit
  allen Fassungen, ungelesene markiert, Hinweis im Dashboard; gemerkt je Person in
  `user_settings.neuigkeiten_gesehen`). Testkunden: nur der Superadmin, beim Anlegen oder im Menü
  „⋯" solange kein Auftrag besteht; Aufträge T1…, Rechnungen T-RE1…, keine Kundennummer – die
  echten Kreise zählen nicht weiter; überall TEST markiert, aus Auswertungen, DATEV und
  Wochenumsatz ausgenommen; „Testkunde restlos löschen" (`testkunde_loeschen()`) entfernt alles
  samt Rechnungen und Protokoll. Lexware: entfällt (02.10.2026, siehe unten).

* **26.09.2026 – Die übrigen Module im Kartenstil (Service Worker v77, keine Migration).**
  Entwürfe N–V in einem Zug: Auftragsfenster (Karten, „Termin & Team" als Blatt, Fuß mit der
  Handlung, die dran ist, Menü „⋯"; ein Zustandswechsel speichert jetzt vorher den Entwurf),
  Kundenfenster (vier Handgriffe, Reiter, Verlauf aus Kontakten und Aufträgen, Menü „⋯";
  Kontaktdialog als Blatt), Rechnungen (Monatsgruppen, Jahr, „Noch nicht ausgestellt"),
  Artikel (Karten, Blatt mit Preis-Zeitleiste), Neuer Kunde, Inaktive Kunden, Einstellungen,
  „Weitere" als Kacheln nach Gruppen und Admin (Reiter Nutzer · Mitarbeiter · Transporter ·
  Rechte · Betrieb · Wartung · Protokoll · Papierkorb; Rechte je Rolle; Betrieb als Zeilen mit
  je einem Blatt). Einzelheiten in `docs/design-system.md` (letzter Abschnitt),
  `docs/auftraege.md`, `docs/kunden-und-karte.md`, `docs/rechnungen.md`.

* **26.09.2026 – Auswertungen neu gebaut, E13 (Service Worker v76, Migration 59).** Entwurf M
  umgesetzt: fünf Reiter (Umsatz, Kunden, Einsatz, Lager, Artikel), Zeitraum Monat/Saison/Quartal/
  Jahr/12 Monate/frei, Vergleich mit dem Vorjahr bis zum selben Tag, Mitarbeiter-Filter. Umsatz
  aus dem Rechnungsbuch (plus erledigte Aufträge ohne „Rechnung nötig"), „Erbracht, noch nicht
  abgerechnet", Monatssäule antippen bis zur Rechnung. Kunden: Wiederkehr Frühjahr → Herbst,
  „Absehbar aus dem Regal", umsatzstärkste Kunden, neu/Bestand. Einsatz: Stunden aus von–bis,
  Wochentag × Uhrzeit. Lager: Belegung im Verlauf mit Kapazität, Ausblick aus dem Vorjahr,
  Liegedauer, Langlieger. Export: DATEV-Buchungsstapel (SKR03, je Kunde ein Debitor –
  entschieden am 26.09.2026), Debitorenliste, Rechnungsliste, Ansicht als CSV. DATEV-Angaben in
  den Betriebsdaten (Migration 59). Einzelheiten in `docs/rechnungen.md`, Abschnitt „Auswertungen
  und DATEV-Export".

* **26.09.2026 – Terminliste neu gestaltet (Service Worker v75).** Entwurf L umgesetzt: statt der
  Tabelle der Tag als Zeitleiste (vorbei grau, läuft gerade orange, kommt noch im Ring der
  Mitarbeiterfarbe), Jetzt-Linie, freie Lücken ab einer Stunde. Zeitraum als Umschalter mit Zahl,
  neu ein Mitarbeiter-Filter (steuert auch die Kartennadeln), bei „Heute" der Kasten „Als Nächstes".
  Navigation und Anrufen an jeder Karte, Kunde und Mitarbeiter zuteilen hinter „⋯". Nebenbei:
  „Morgen"/„7 Tage" rechneten über `toISOString()` in UTC – jetzt in Ortszeit; ein laufender
  Termin zählt jetzt noch zu „Anstehend". Einzelheiten in `docs/auftraege.md`, Abschnitt 5b.

* **26.09.2026 – Auftragsliste neu gestaltet (Service Worker v74).** Entwurf K umgesetzt: Karten
  statt Tabelle, Bedienleiste mit Suche (auch Auftragsnummer), Status-Pillen und Auswahlknöpfen für
  Mitarbeiter, Zeitraum und Sortierung (der Zeitraum-Balken darüber entfällt). Vorgabe „Anstehende
  zuerst": oben „Noch zu erledigen", dann heute und die nächsten Tage; abgeschlossene Aufträge ab
  gestern ausgeblendet, „Vergangene anzeigen" holt sie zurück. Anruf-Knopf direkt an der Karte.
  Einzelheiten in `docs/auftraege.md`, Abschnitt 5a.

* **26.09.2026 – Kundenliste neu gestaltet (Service Worker v73).** Entwurf J umgesetzt:
  Bedienleiste mit Suche, Zustands-Pillen mit Nadelfarbe und Zahl, Gebiet- und A–Z-Blatt, Karte
  „Rückrufe heute fällig" (neuer Filter `rueckruf`, auch aus dem Dashboard erreichbar), Kunden nach
  Anfangsbuchstaben in Karten mit Initialenkreis, Status und großen Knöpfen für Navigation und
  Anruf. Sortierung und A–Z jetzt nach dem angezeigten Namen (Firma vor Ansprechpartner).
  Einzelheiten in `docs/kunden-und-karte.md`.

* **26.09.2026 – Saisonliste neu gestaltet (Service Worker v72).** Entwurf I umgesetzt: Saison
  als Umschalter, die Antwort im dunklen Kasten mit Termin-Balken, Karte „Neue Reifen fällig",
  Filter Ohne Termin (neu, vorbelegt) · Fällig · Profil unter 3 mm · Gebiet (PLZ-Vorschläge), je
  Kunde eine Karte gruppiert nach Postleitzahl, „Anrufliste erzeugen" als Blatt mit 2/4/6 Wochen.
  Einzelheiten in `docs/lager.md`, Abschnitt „Die Saisonliste".

* **26.09.2026 – Lager neu gestaltet (Service Worker v71).** Entwurf H umgesetzt: eine Seite
  statt zwei Ebenen – Suche über alle Lager, Scan-Knopf (Regal-Aufkleber und Satz-Etikett), Lager
  als Umschalter, drei Zahlen (belegt, frei, zu prüfen), eine Zeile Filter, je Reihe eine Karte mit
  kleiner Regalwand, ein Blatt je Platz (Auslagern, Bearbeiten, Etiketten, Verlauf), Langlieger als
  Zeilen. Die alte Regalwand mit Wand/Liste-Umschalter ist entfallen, ebenso
  `REGAL_LISTE_BREITE_PX`. Einzelheiten in `docs/lager.md`.

* **25.09.2026 – Dashboard neu (Service Worker v70, Migration 58).** Entwurf G umgesetzt:
  drei Zahlen (heute, morgen, offen), „Als Nächstes" mit Navigation und Anrufen, „Reifen
  mitnehmen" für heute oder morgen zum Abhaken beim Einladen – der Haken ist fürs ganze Team
  sichtbar (Tabelle `mitnehmen_gepackt`), „Zu erledigen" fürs Büro (Rechnungen offen, Termine
  ohne Mitarbeiter, Überschneidungen, Rückrufe, Laufkunde ohne Namen, Lager-Engpass unter
  `LAGER_ENGPASS_AB` freien Plätzen), der Tag im Überblick, unten Wochenumsatz, Lager,
  Saison-Barometer (Kunden mit eingelagerten Reifen der kommenden Saison ohne Termin) und
  Kundenkontakt. Techniker sehen dieselbe Seite ohne die Büro-Teile. Logik in `lib/dashboard.ts`.

* **25.09.2026 – Einsatzplanung neu gestaltet (Service Worker v69).** Entwurf F umgesetzt:
  kompakte Bedienleiste mit Auswahlknöpfen für Mitarbeiter, Fahrzeug und Zeitraum, Monat ohne
  Rahmen mit kleiner KW, Wochenleiste in der Tagesansicht, Tages- und offene Aufträge als
  Karten. Gleiche Funktionen. Einzelheiten in `docs/auftraege.md`, Abschnitt 5.

* **25.09.2026 – Einsatzplanung: beim Umschalten nach oben (Service Worker v68).** Wer unten
  in den offenen Aufträgen auf Woche oder Tag tippte, behielt die Scrollposition – das
  Stundenraster lag unsichtbar darüber. Jetzt springt die Seite beim Wechsel der Ansicht nach
  oben (nicht beim Blättern).

* **25.09.2026 – „Eingelagerte Reifen" im Kundenfenster (Service Worker v67).** Alle Sätze
  des Kunden als Liste: Lagerplatz, Kennzeichen, Saison, Größe, DOT – auch Sätze ohne Fahrzeug.
  Antippen öffnet den Platz im Lager. Einzelheiten in `docs/lager.md`.

* **25.09.2026 – Termine im Kalender ziehen (Service Worker v66).** Woche und Tag: Termin mit
  der Maus verschieben (auch auf einen anderen Tag) oder unten länger/kürzer ziehen; am Handy
  lange drücken, dann ziehen. Sofort gespeichert, mit „Rückgängig" und Warnung bei
  Doppelbelegung. Nur offene und laufende Termine. Einzelheiten in `docs/auftraege.md`.

* **24.09.2026 – Einsatzplanung am Handy und Auslagern-Fenster (Service Worker v65).**
  Ein Tag im Monat angetippt öffnet die Tagesansicht. Die Liste darunter zeigt nur noch offene
  und laufende Aufträge. Die Bedienleiste (Monat, Mitarbeiter, Fahrzeuge, Ansicht) bleibt beim
  Scrollen stehen, in der Wochenansicht die Uhrzeitspalte beim seitlichen Wischen. Der
  Auslagern-Dialog liegt jetzt über dem Auftragsfenster statt dahinter (`.modal-auslagern`).

* **24.09.2026 – Absturz beim Löschen eines Kunden behoben (Service Worker v64).** Nach dem
  Löschen wurde erst neu geladen und dann das Kundenfenster geschlossen; dazwischen griff das
  noch offene Fenster auf einen Kunden, den es nicht mehr gab, und die Seite zeigte „This page
  couldn't load". Jetzt schließt das Fenster zuerst, und es öffnet sich nur, solange der Kunde
  existiert. Dazu: „Neuer Kunde" sperrt das Kästchen Laufkundschaft, wenn es sie schon gibt,
  und bleibt bei einem Fehler nicht mehr auf „Wird angelegt …" stehen. Die Prüfabfrage meldete
  Migration 41 fälschlich als NEIN (Migration 42 ersetzt die geprüfte Richtlinie).

* **24.09.2026 – Laufkunde am Auftrag und Einmalkunde (Migration 57, Service Worker v63).**
  Aufträge der Laufkundschaft tragen Name (Pflicht beim Abschließen), Telefon und Einsatzort;
  der Name erscheint überall statt „Laufkundschaft" und als Empfänger auf der Rechnung. Neuer
  Haken „Einmalkunde": keine Nadel und keine Anrufliste – außer als Termin-Nadel, solange ein
  Termin ansteht. Einzelheiten in `docs/kunden-und-karte.md`.

* **23.09.2026 – Navigation neu geordnet (Service Worker v62/v63).** Dashboard, Einsatzplanung,
  Aufträge, Kunden, dann alles Weitere – in der Seitenleiste wie in der unteren Leiste am Handy,
  die damit fünf statt vier Punkte hat. Eine Liste für beide: `MODULE` in `lib/module.ts`.
  **Die App startet in der Einsatzplanung** (`START_TAB`); wer sie nicht sehen darf, landet auf
  dem Dashboard.

* **23.09.2026 – Runde 35 (Migrationen 55 und 56, Service Worker v61).** In einem Zug:
  * **D1** Hinweis auf Doppelbuchung beim Einteilen von Mitarbeiter oder Transporter – kein
    Verbot, ein bernsteinfarbener Hinweis direkt unter der Auswahl (`lib/ueberschneidung.ts`).
  * **D3** Ein belegter Lagerplatz und ein Lager mit belegten Plätzen lassen sich nicht mehr
    löschen, auch nicht über die Datenbank. Frühere Einlagerungen sperren nicht; die Rückfrage
    nennt, wie viele mitgelöscht werden (entschieden am 23.09.2026).
  * **D7** Die nächste Rechnungsnummer ist fest, sobald eine Rechnung existiert – nur noch
    „höchste vergebene plus eins", in der Maske und im Trigger.
  * **C4, D5, D6** Protokoll-Beschriftungen nachgezogen (alle Spalten aller protokollierten
    Tabellen gegengeprüft); alte stornierte Aufträge fallen aus dem Zeitfenster; das
    Auftragsfenster setzt beim Auftragswechsel über `key` vollständig neu auf.
  * **E4** Langlieger-Übersicht auf der Lager-Startseite, Schwellen einstellbar.
  * **B1** Das Protokoll wird nach **36 Monaten** geschwärzt (Name, Anschrift, Telefon, E-Mail,
    Koordinaten, Kennzeichen, Freitexte) – nächtlich über pg_cron, die Zeile bleibt stehen.
  * **B2** Papierkorb im Adminbereich: Wiederherstellen, und für den Superadmin endgültig
    löschen samt Protokoll. Ausgestellte Rechnungen bleiben als Beleg.
  * **Neu: Abendhinweis „Reifen mitnehmen"** – um eine Uhrzeit je Person (Vorgabe 20:00) eine
    Meldung, welche eingelagerten Sätze morgen mitmüssen, mit Name und Lagerplatz. Einzelheiten
    in `docs/benachrichtigungen-plan.md`, letzter Abschnitt.
  * **Tarnung auch in den Meldungen:** Push-Meldungen tragen das Symbol und bei der
    Testnachricht den Namen aus `lib/erscheinung.ts` („Settings"), nicht mehr PinPoints.
  * **Das Skript `supabase/einmalig/testrechnungen_entfernen.sql` ist entfernt.** Es hätte ohne
    Sperre ALLE Rechnungen gelöscht und den Kreis auf 1 gesetzt – seit RE1783 (echte Rechnung)
    darf es nicht mehr laufen. Seit Migration 55 würde der Trigger das Zurücksetzen ohnehin
    ablehnen, solange Rechnungen existieren.

* **23.09.2026 – Push bei gesperrtem Bildschirm und im Fokus „Fahren" bestätigt** (vormals F2).
  Die Frage stand seit dem 09.09.2026 offen und war die Voraussetzung für Terminerinnerung und
  „Auf dem Handy anrufen". Beide tragen damit im Alltag.

* **23.09.2026 – Stornogrund ist Pflicht (Migration 54).** Beim Auftrag war er es seit
  Migration 20, bei der Rechnung nicht. Einzelheiten in `docs/rechnungen.md`.
* **23.09.2026 – Laufkundschaft direkt anlegbar.** Das Anlegeformular verlangte eine Adresse,
  die dieser Kunde nicht hat; jetzt entfällt die Pflicht mit dem Kennzeichen.

* **22.09.2026 – Laufkundschaft (Migration 53).** Sammelkunde für Barverkäufe ohne
  Kundenanlage; nimmt den Kunden aus der Anrufliste, hebt beim Abschließen die Empfänger- und
  Fahrzeugpflicht auf (§ 33 UStDV) und zählt in der Auswertung beim Umsatz mit, bei „Kunden
  bedient" aber nicht. Einzelheiten in `docs/kunden-und-karte.md`.
* **22.09.2026 – Geräteliste in den Einstellungen.** Welche Geräte hängen an meinem Konto,
  seit wann, und ein Knopf zum Entfernen. Anlass: „An 2 Geräte geschickt" bei einem Telefon –
  eine Karteileiche vom Neuinstallieren der App, die nur in der Datenbank zu sehen war.
* **22.09.2026 – Storno auch aus dem Rechnungsbuch.** Bis dahin nur über den Umweg
  „Zum Auftrag".
* **22.09.2026 – Skript zum Entfernen der Testrechnungen** – am 23.09.2026 wieder entfernt,
  siehe oben.

* **22.09.2026 – Auftrag aus dem Kalender.** Klick in eine freie Stelle des Stundenrasters →
  Kundenauswahl mit vorbelegtem Termin → vollständiges Auftragsfenster. Kein fünftes Formular;
  Einzelheiten in `docs/auftraege.md`, Abschnitt 3.
* **22.09.2026 – „Auf dem Handy anrufen".** Am Rechner klicken, auf dem iPhone telefonieren
  (`/api/push/anruf`). Einzelheiten in `docs/benachrichtigungen-plan.md`, letzter Abschnitt.
  Die Zustellung auf dem iPhone ist seit dem 23.09.2026 bestätigt, auch bei gesperrtem
  Bildschirm.

---

## A. Sofort – kostet im Betrieb bereits Geld oder erzeugt falsche Belege

Abschnitt A ist am 21.09.2026 abgearbeitet: die vier Punkte, die hier standen (Auslagern im
Auftragsfenster ohne Gebühr, der ungeprüft bestätigbare Auslagern-Dialog ohne gültigen Preis,
das doppelt gepflegte Fahrzeug am Auftrag, `todayStr()` in UTC statt Ortszeit) sind behoben –
Details dazu stehen in `auftraege.md`, `lager.md` und `architektur.md`, nicht mehr hier. Der
Gerätetest der Terminerinnerung (vormals F2) ist am 23.09.2026 ebenfalls erledigt: Die Meldung
kommt bei gesperrtem Bildschirm und im Fokusmodus „Fahren" an. Damit steht die Push-Strecke
vollständig – auch „Auf dem Handy anrufen", das daran hing.

---

## B. Sicherheit, Recht, Datenschutz

*B1 (Protokoll-Aufbewahrung) und B2 (Löschkonzept für Kunden) sind am 23.09.2026 erledigt,
siehe „Zuletzt erledigt".*

### B3. Geokodierung: Drosselung wirkt nur je Serverinstanz

**Erledigt am 02.10.2026 (Migration 62, v100):** Zählung je Dienst, Nutzer und Minute in
`fremdabfrage_zaehler`, abgefragt über `fremdabfrage_erlaubt()` (`lib/fremdabfrage.ts`).
Nominatim 50 je Nutzer / 55 gesamt, Photon 60 / 300. Ohne die Migration fallen die Routen auf
die alte Bremse zurück. Der Text unten ist die ursprüngliche Beschreibung.

`app/api/geocode/route.ts` und `app/api/adresse-suchen/route.ts` bremsen über eine
Modulvariable. Bei mehreren gleichzeitigen Vercel-Instanzen greift das nicht, und ein
angemeldeter Nutzer kann die Route in einer Schleife aufrufen. Im Ernstfall sperrt der
kostenlose Dienst die Firma aus.

*Behebung:* einfache Zählung je Nutzer und Zeitfenster in einer Tabelle. Aufwand: klein
bis mittel.

### B4. CSP erlaubt weiterhin `unsafe-inline`

**Erledigt 02.10.2026 (v106):** `proxy.ts` setzt die CSP mit einer Nonce je Aufruf und
`'strict-dynamic'` (`lib/csp.ts`), alle Seiten werden beim Aufruf erzeugt, `offline.html` ohne
`onclick`. Im Produktionsbau geprüft: alle Skripte mit Nonce, keine CSP-Meldung, ein
eingeschleustes `onerror=` wird blockiert.

`next.config.mjs` setzt `script-src 'self' 'unsafe-inline'`. Sauber wäre eine
Nonce-Lösung über `proxy.ts`. Fremde Skript-Hosts sind bereits ausgeschlossen, das Risiko
ist daher gering – aber der Punkt steht seit Phase 8 offen. Aufwand: klein bis mittel.

### B5. Geprüft und **kein** Befund – bitte nicht „reparieren"

Bei der Durchsicht sind drei Dinge aufgefallen, die nach einer Lücke aussehen und keine
sind. Sie stehen hier, damit sie niemand in guter Absicht kaputtmacht:

- **Die DELETE-Richtlinien in Migration 42 prüfen `lesen`, nicht `loeschen`.** Das ist
  Absicht. Eine Richtlinie, die die Zeile wegfiltert, lässt den Trigger gar nicht erst
  laufen – dann steht wieder „0 Zeilen gelöscht" ohne ein Wort dazu. Die eigentliche
  Entscheidung trifft der BEFORE-Trigger `pruefe_loeschrecht()`, der auf allen zwölf
  betroffenen Tabellen hängt und zusätzlich den Soft-Delete (`deleted_at` wird gesetzt)
  über einen BEFORE-UPDATE-Trigger abfängt. Löschrechte werden also durchgesetzt.
- **`tire_storage` hat gar keine Löschrichtlinie.** Auch Absicht: eine Einlagerung wird nie
  gelöscht, Auslagern ist ein Schreibvorgang. Ohne Richtlinie verweigert die RLS jedes
  DELETE – genau das ist gewollt.
- **`module_permissions`** ist seit Migration 16 nur für Superadmin schreibbar. Ein Admin
  kann sich keine Rechte selbst erteilen.

---

## C. Aufräumen

### C1. Tote Spalten entfernen

**Erledigt 02.10.2026 (Migration 63, v102):** `articles.braucht_lagerplatz` ist entfernt.

| Spalte | Status |
|---|---|
| `articles.braucht_lagerplatz` | Seit Migration 46 ohne Wirkung, im Code nirgends mehr gelesen. Kann fallen. |

### C2. Toter Code

**Erledigt 02.10.2026 (v102):** `rechtSchluessel()` baut jetzt die Zellenschlüssel der Rechtematrix
(Gegenstück `regelZerlegen()` für `canView`), `GEO_GENAUIGKEIT_LABEL` ist entfernt, das Prop
`pflicht` samt totem Zweig ist weg, `QrBild` liegt einmal in `components/lager/QrBild.tsx`.

- `rechtSchluessel()` in `lib/constants.ts` wird von niemandem aufgerufen. Entweder überall
  verwenden (dann auch in `canView()` und in `PermissionMatrix`, die den Schlüssel je
  einzeln zusammenbauen) oder entfernen.
- `GEO_GENAUIGKEIT_LABEL` in `lib/constants.ts` wird nirgends verwendet – entweder in der
  Oberfläche einsetzen oder entfernen.
- Das Prop `pflicht` in `components/auftraege/EinlagerungBlock.tsx` wird an beiden
  Einbindungsstellen fest auf `false` gesetzt; der zugehörige Zweig ist tot.
- `QrBild` existiert fast wortgleich zweimal (`LagerplatzAufkleber.tsx`,
  `ReifensatzEtikett.tsx`).

### C3. Kommentare, die etwas anderes sagen als der Code

**Erledigt 02.10.2026 (v102):** Die Kommentare in `AuftraegePanel.tsx`/`EinsatzplanungPanel.tsx`
waren bereits bereinigt. Migration 37 wird als ausgeführte Datei nicht mehr angefasst (CLAUDE.md
Abschnitt 2) – die Richtigstellung steht in `supabase/migrations/README.md` bei Migration 37.

- Migration 37 behauptet, die Standarddauer sei „auch im Code 60 Minuten" – in
  `lib/constants.ts` stehen 30, und maßgeblich ist ohnehin `betrieb.termin_intervall_min`.
- `AuftraegePanel.tsx` und `EinsatzplanungPanel.tsx` tragen noch Kommentare aus der Zeit
  vor Migration 41 („Techniker darf keine Leistungen ändern") – das stimmt nicht mehr.

### C5. Große Dateien

**Erledigt 02.10.2026 (v106), soweit hier vorgeschlagen:** `TireAssignModal.tsx` eigene Datei
(LagerPanel ~850 Zeilen), `lib/helpers.ts` in neun Themendateien geteilt (~500 Zeilen, reicht sie
weiter), zentrale Fehlermeldung als `components/FehlerHinweis.tsx`. `app/page.tsx` bleibt groß
(~3.800 Zeilen) – der nächste Schnitt wären die Lade- und Schreibfunktionen je Modul.

`app/page.tsx` ist wieder auf rund 3.550 Zeilen gewachsen (nach der Sanierung waren es
1.290). `components/auftraege/AuftragModal.tsx` liegt bei knapp 1.200, `components/lager/
LagerPanel.tsx` bei rund 950, `lib/helpers.ts` bei rund 1.110 Zeilen (Stand 02.10.2026).

Das ist kein akutes Problem, aber jedes neue Modul hat bisher Zustand und Ladefunktionen in
`HomePage` dazugelegt, ohne dass Älteres kleiner wurde. Sinnvoller nächster Schnitt:
`TireAssignModal` aus `LagerPanel` herauslösen, `helpers.ts` thematisch teilen.
Aufwand: mittel, jederzeit aufschiebbar.

### C6. Keine Tests für Komponenten

**Erledigt 02.10.2026 (v106):** Testing Library + jsdom, `tests/*.test.tsx`: zentrale
Fehlermeldung mit einer echten Trigger-Meldung (Migration 44), Fotos & Unterschrift, Papierkorb.
Weitere Komponententests kommen mit den Komponenten, die sie betreffen.

Vitest deckt ausschließlich reine Rechenfunktionen ab. Dass ein Trigger-Fehler (etwa die
Vollständigkeitsprüfung der Rechnungsdaten) in der Oberfläche als lesbare Meldung ankommt,
prüft niemand automatisch. Aufwand: mittel, dauerhafter Nutzen.

### C7. Rollback-Skripte für die Migrationen 01–14 fehlen

Sie fehlen bewusst – diese Migrationen legen das Grundschema an, ihre Rücknahme wäre das
Leeren der Datenbank. Kein Handlungsbedarf, nur hier festgehalten, damit die Lücke nicht
für ein Versehen gehalten wird.

---

## D. Verbesserungen am Bestehenden

**D1–D19 erledigt** (zuletzt am 02.10.2026 mit v100/v102). Neue Punkte kommen hier als Tabelle
`| # | Was | Warum | Aufwand |` dazu.

| # | Was | Warum | Aufwand |
|---|---|---|---|
| D19 | **Erledigt 02.10.2026 (v106, `lib/sprungMerker.ts`).** Aufruf über einen QR-Code (`?lagerplatz=`, `?satz=`, `?reifen=`) übersteht das erste Neuladen nicht | Gefunden beim Prüfen von v103: Öffnet ein Gerät die App zum ersten Mal (noch kein Service Worker), übernimmt der neue Worker und `PwaBereit` lädt die Seite neu – die Adresszeile ist zu dem Zeitpunkt schon bereinigt, der Sprung geht verloren. Mit installierter App tritt es nicht auf. Abhilfe: den Sprung kurz in `sessionStorage` merken und nach dem Neuladen einlösen | klein |

---

## E. Neue Funktionen – was dem Betrieb wirklich hilft

Nach Nutzen sortiert, nicht nach Aufwand.

### E1. Dublettenprüfung bei der Kundenanlage

**Erledigt 02.10.2026 (Migration 64, v103):** „Gibt es schon?" mit Telefonnummer, E-Mail, Name + PLZ
(Rückfrage bei starkem Grund), Admin → „Dubletten" mit Zusammenführen und „keine Dublette".
Siehe `kunden-und-karte.md`.
**Teilweise vorhanden:** Seit 26.09.2026 zeigt „Neuer Kunde" ab vier Zeichen Kunden mit gleichem
Namensanfang („Gibt es schon?"), seit v93 verhindert die App doppelte Kennzeichen beim Kunden.
Offen ist der Abgleich über die Telefonnummer und das Zusammenführen.

Vorher wurde beim Anlegen nichts geprüft. Bei 424 Bestandskunden und telefonischer Neuanlage
entstehen Karteileichen zwangsläufig; die Dokumentation nennt „Dublette" bereits als Grund
für eine Deaktivierung, ohne dass es ein Werkzeug dagegen gäbe. Ein nicht blockierender
Hinweis („ähnlicher Kunde vorhanden: … – trotzdem anlegen?") auf Basis von Name + PLZ und
normalisierter Telefonnummer, dazu eine Admin-Ansicht mit Zusammenführen-Knopf.
*Aufwand: mittel. Setzt D10 voraus.*

### E2. Kommissionierliste „Was muss heute mit"

**Erledigt am 02.10.2026 (v100):** Karte „Packliste" im Dashboard (heute/morgen) und derselbe
Block im Mitnehmen-Fenster – Leistungen in Summe, Reifengrößen der Autos, Hinweis auf Aufträge
ohne bekannte Größe (`lib/packliste.ts`, `PacklisteBlock.tsx`).

**Teilweise vorhanden seit 23.09.2026:** Die eingelagerten Sätze, die mitmüssen, zeigt die
Mitnehmen-Liste hinter dem Abendhinweis (`lib/mitnehmen.ts`,
`components/auftraege/MitnehmenFenster.tsx`). Was fehlt, sind die Leistungen und Reifengrößen –
E2 baut auf dieser Liste auf, statt eine zweite zu beginnen.

Aus allen Terminen eines Tages die zugeordneten Leistungen und die Reifengrößen der
betroffenen Fahrzeuge zusammenziehen, als eine Liste für die Beladung des Transporters am
Morgen. Nutzt ausschließlich Daten, die schon da sind.
*Aufwand: klein bis mittel. Sehr hoher Alltagsnutzen.*

### E3. Foto und Unterschrift beim Abschließen

**Erledigt 02.10.2026 (Migration 65, v105):** Auftragsfenster → Karte „Fotos & Unterschrift": Fotos
vorher/nachher/Schaden (verkleinert auf 1600 px), Unterschrift des Kunden mit dem Finger; privater
Speicherbereich `auftrag-belege`, Tabelle `auftrag_belege`. Hinweis im Fuß, kein Zwang. Siehe `auftraege.md`.
Zustand der Reifen vorher/nachher fotografieren und den Kunden auf dem Handy quittieren
lassen. Bei Reklamationen ist das der Unterschied zwischen Aussage gegen Aussage und einem
Beleg. Das Datenmodell war dafür von Anfang an mitgedacht.
*Aufwand: mittel bis groß (Dateiablage nötig).*

### E5. Tagesroute nach Fahrstrecke sortieren

**Erledigt 02.10.2026 (v104, keine Migration):** Einsatzplanung → „Route ›" je Mitarbeiter (Monat) bzw.
„Route des Tages" (Tag): kürzeste Reihenfolge ab der Firmenadresse und zurück, Vergleich mit der
Uhrzeit-Reihenfolge, Link nach Google Maps. Luftlinie × 1,3, ohne Routendienst; Uhrzeiten bleiben.
Siehe `auftraege.md`.
Die Tagesliste sortiert nach Uhrzeit. Für einen mobilen Dienst mit mehreren Stopps wäre
eine Reihenfolge nach kürzestem Weg unmittelbar Zeit- und Spritersparnis. Die Koordinaten
liegen für die Navigation ohnehin vor.
*Aufwand: mittel.*

### E6. Auftragsvorlagen für wiederkehrende Leistungspakete

**Erledigt 02.10.2026 (Migration 63, v102):** Vorlagen unter der Artikelliste, im Auftrag „+ Vorlage".
Siehe `artikelstammdaten.md`.
„Saisonwechsel mobil", „Wechsel + Wuchten" als ein Klick statt jeder Position einzeln.
*Aufwand: klein bis mittel.*

### E7. Stapel-Auslagern für den Saisonwechsel

**Erledigt 02.10.2026 (v104, keine Migration):** Mitnehmen-Fenster bzw. Lager → „⋯" → „Saisonwechsel:
der Reihe nach auslagern" – die Sätze eines Tages in der Reihenfolge des Regals, je Satz ein Tipp
mit Lagergebühr auf den Auftrag des Tages, „Platz scannen" als Gegenprobe. Siehe `lager.md`.
Beim eigentlichen Saisonwechsel muss heute jeder Satz einzeln über den Auslagern-Dialog.
Ein geführter Modus „einen nach dem anderen abarbeiten" wäre bei dreistelligen Stückzahlen
ein spürbarer Unterschied.
*Aufwand: groß.*

### E8. Reifengrößen-Abgleich beim Einlagern

**Erledigt 02.10.2026 (v102):** `groessenAbweichung()` (`lib/reifenverkauf.ts`) – im Lager unter
„Zu prüfen", im Auftragsfenster unter dem Radbild. Ein Hinweis, keine Sperre (Mischbereifung).
Am Fahrzeug steht eine Reifengröße, am eingelagerten Rad ebenfalls – verglichen wird nie.
Eine Warnung bei Abweichung findet falsch zugeordnete Sätze zum frühestmöglichen Zeitpunkt.
*Aufwand: mittel.*

### E9. Terminbestätigung an den Kunden

**Erledigt 02.10.2026 (v104, keine Migration):** Auftragsfenster → „Bestätigen": Bestätigung oder
Erinnerung als fertiger Text, verschickt vom eigenen Gerät per WhatsApp, SMS oder E-Mail (kein
Versanddienst, Entscheidung 02.10.2026). Siehe `auftraege.md`.
Heute erinnert die App das eigene Personal. Eine Bestätigung oder Erinnerung an den Kunden
(SMS oder E-Mail) senkt die Zahl der vergeblichen Anfahrten. Braucht einen externen
Dienst – vor dem Bau die Frage klären, ob das sein soll.
*Aufwand: mittel bis groß.*

### E10. Auskunftsauszug je Kunde

**Erledigt 02.10.2026 (Migration 64, v103):** Kundenfenster → „⋯" → „Auskunft (DSGVO)", nur Admin;
Drucken/als PDF sichern und als Datei (JSON). Siehe `kunden-und-karte.md`.
Ein Knopf im Kundenfenster (nur Admin), der alles zu diesem Kunden Gespeicherte als PDF
zusammenstellt. Deckt die DSGVO-Auskunft ab, die heute nur durch Durchklicken bedienbar
wäre. Passt zu B1/B2.
*Aufwand: mittel.*

### E11. Lagerauslastung im Blick

**Erledigt 02.10.2026 (v102):** ab 90 % (`LAGER_VOLL_AB`) roter Zähler am Lagerknopf, Satz darunter,
Nennung im Dashboard unter „Zu erledigen".
Hinweis, wenn ein Lager über 90 % belegt ist. Die Kennzahlen dafür werden bereits geladen.
*Aufwand: klein.*

### E12. Kapazitätsklasse am Lagerplatz

**Erledigt 02.10.2026 (Migration 64, v103):** `storage_slots.groesse` normal/groß, Hinweis und
Reihenfolge bei der Platzwahl ab 720 mm Durchmesser oder 265 mm Breite. Siehe `lager.md`.
„Normal" und „groß/SUV", damit die Auswahl freier Plätze keine 20-Zöller in zu kleine
Fächer schickt.
*Aufwand: mittel.*

### E16. Reifenverkauf: Steuer und Gewährleistung klären
Gebrauchte Reifen, die von Privatleuten ohne Umsatzsteuer angekauft wurden, können unter die
Differenzbesteuerung (§ 25a UStG) fallen – dann andere Rechnungsangaben und DATEV-Konten. Mit
dem Steuerberater klären; die zwei Artikel „Reifen neu"/„Reifen gebraucht" (Migration 61) sind
die Vorbereitung. Dazu ein Gewährleistungshinweis für gebrauchte Reifen an Privatkunden auf der
Rechnung (Verkürzung auf ein Jahr nur, wenn vereinbart).
*Aufwand: klein, sobald die Antwort da ist.*

### E17. Reifenverkauf: Übernahme aus der Einlagerung und Etikett

**Erledigt 02.10.2026 (Migration 64, v103):** „Kunde lässt sie da · zum Verkauf" im Platz-Blatt
(`satz_zum_verkauf()`), Etikett je Verkaufsreifen mit `?reifen=`. Siehe `lager.md`.
Ein Kunde lässt seine alten Reifen da oder verkauft sie an uns: aus dem eingelagerten Satz einen
Verkaufsposten machen, Größe/DOT/Profil kommen aus den Raddaten mit. Dazu ein Etikett mit
QR-Code je Posten (vorhandener Etikettendruck), Scan öffnet den Posten.
*Aufwand: mittel.*

### E18. Reifenverkauf in den Auswertungen

**Erledigt 02.10.2026 (v103, keine Migration):** Reiter „Reifen" in den Auswertungen – Umsatz neu/
gebraucht mit Vorjahr, Marge über die Stück mit Einkaufspreis, Lagerwert heute und im Verlauf
(zurückgerechnet, „ungefähr"), „liegt seit über sechs Monaten" (`VERKAUF_LANGE_LIEGEND_MONATE`).
Umsatz neu/gebraucht, Marge (wo der Einkaufspreis gepflegt ist), Lagerwert im Verlauf,
„liegt seit über sechs Monaten".
*Aufwand: klein bis mittel.*

---

## F. Aus der alten Planung übernommen

### F1. Offline schreiben (PWA Stufe 4)

**Runde 1 erledigt am 02.10.2026 (v101)** – Ausgangskorb, Anzeige, Konfliktabfrage; offline gehen
Titel/Beschreibung/Termin/„Rechnung benötigt"/Notiz, Leistungen und die Radmessung. Siehe
`pwa-plan.md`, Stufe 4. **Offen (Runde 2):** Fahrzeug am Auftrag und Kilometerstand (braucht
zuerst offline lesbare Fahrzeuge am Auftrag), neues Fahrzeug beim Kunden, Test im Betrieb mit
abgeschaltetem Telefon. Der Text unten ist die ursprüngliche Beschreibung.
Lesen funktioniert offline (Stufen 1–3 sind gebaut). Schreiben nicht: es fehlt eine
Warteschlange und eine Konfliktbehandlung.

**Entschieden am 23.09.2026: der GROSSE Zuschnitt, als eigene Runde** – alles am Auftrag außer
Abschließen (Notiz, Uhrzeit, Titel/Beschreibung, Leistungen, Endpreis,
Fahrzeug und Kilometerstand, Radmessung), mit Konfliktabfrage bei gleichem Feld. Nicht offline:
Abschließen, Ein- und Auslagern, Auftrag anlegen/stornieren, Kunden, Stammdaten. Die Bauvorgabe
je Handlung steht im Projektkonzept „Offline schreiben" (Tabellen „Was offline gehen SOLL");
dort ist nur die Zeile „Rechnung erstellt abhaken" überholt – seit Migration 48/49 entsteht die
Rechnung in PinPoints, und Ausstellen bleibt netzgebunden. Siehe auch `pwa-plan.md`.
*Aufwand: zwei bis drei Runden plus Test mit absichtlich abgeschaltetem Telefon.*

### F3. Welche Geräte sind eigentlich im Einsatz?
Aus dem PWA-Plan unbeantwortet: welche iOS-Fassungen, ob der QR-Scanner in der
installierten Web-App auf den älteren davon funktioniert. Reine Bestandsaufnahme.

### F4. Erledigt, aber noch als offen geführt gewesen
Zur Klarstellung, damit niemand doppelt anfängt: Rechnungsstellung (Phase 5), die
Push-Terminerinnerung (Phase 14) und das Offline-Lesen (PWA Stufe 3) sind **gebaut**. Die
alte `roadmap.md` führte alle drei noch als offen.

### F5. Hinfällig
**Entschieden am 23.09.2026, nicht benötigt:** die Übernahme der Kundennummern aus dem
Altsystem (die Nummern bleiben die von PinPoints vergebenen) und die E-Rechnung
(ZUGFeRD/XRechnung). Beides bitte nicht erneut vorschlagen, solange sich daran nichts ändert.

Der zentrale Warteschlangenlauf für die Geokodierung beim Massenimport war für die
Übernahme der Bestandskunden gedacht. Die ist über direktes SQL gelaufen, ohne diese
Route. Die technische Lücke bleibt (siehe B3), der ursprüngliche Anlass ist weg.

---

## G. Reihenfolge, wenn man einfach anfangen will

Runde 35 (23.09.2026, Migrationen 55/56, Service Worker v61) hat D1, D3, C4, D5, D6, D7, E4,
B1 und B2 erledigt. Ab hier:

1. **F1** – Offline schreiben im großen Zuschnitt, als eigenes Vorhaben (entschieden am
   23.09.2026). **Runde 1 erledigt 02.10.2026 (v101), Runde 2 offen (Fahrzeuge/Kilometer).** Erste Runde: Warteschlange, Anzeige „n Änderungen warten", Status/Notiz/Radmessung;
   zweite Runde: Leistungen, Uhrzeit, Fahrzeug, Konfliktabfrage.
2. ~~**D2**~~ – erledigt 02.10.2026 (v100).
3. **DATEV-Probeimport** – die erste Datei beim Steuerberater einlesen lassen (E13 ist gebaut).
4. ~~**E2**~~ – erledigt 02.10.2026 (v100).
5. ~~**D17, D4, B3**~~ – erledigt 02.10.2026 (v100).

## Offen aus den Runden seit dem 29.09.2026

Kleine Punkte, die bei Vitali oder im Betrieb liegen oder auf eine Rückmeldung warten:

- **Doppelte Fahrzeuge** beim Kunden (vor v93 entstanden) im Kundenfenster löschen.
- **Noch offen aus der Liste vom 04.10.2026:** Offline schreiben Runde 2 (F1) und `app/page.tsx`
  weiter teilen (C5) – als eigene Runden nach v109.
- **Brother QL-820NWBc:** Druck über PDF im Betrieb bestätigt (02.10.2026), Format 58 × 58 seit v96
  fest, 60 × 86 seit v99 wieder wählbar. Offen: Regalaufkleber auf dem Brother testen (seit v99),
  die Folienrolle DK-22212 auf einem gereinigten Reifen einige Wochen beobachten, sonst Etikett auf
  Reifensack/Anhänger.
- ~~**Etikettenformate im Admin einstellbar**~~ – entfällt (02.10.2026): Es gibt nur noch das eine
  Format 58 × 58 mm.

*Lexware entfällt (Entscheidung 02.10.2026): PinPoints schreibt die Rechnungen, eine Übergabe an
Lexware ist nicht geplant. Bitte nicht erneut vorschlagen.*
