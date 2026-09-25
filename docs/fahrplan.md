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

* **26.09.2026 – Versionsanzeige, „Was gibt es Neues" und Testkunden (Service Worker v78,
  Migration 60).** Die Fassung steht in den Einstellungen (`APP_VERSION` in `lib/version.ts`,
  gleichlaufend mit `public/sw.js`); Admin und Superadmin sehen „Was gibt es Neues" (Blatt mit
  allen Fassungen, ungelesene markiert, Hinweis im Dashboard; gemerkt je Person in
  `user_settings.neuigkeiten_gesehen`). Testkunden: nur der Superadmin, beim Anlegen oder im Menü
  „⋯" solange kein Auftrag besteht; Aufträge T1…, Rechnungen T-RE1…, keine Kundennummer – die
  echten Kreise zählen nicht weiter; überall TEST markiert, aus Auswertungen, DATEV und
  Wochenumsatz ausgenommen; „Testkunde restlos löschen" (`testkunde_loeschen()`) entfernt alles
  samt Rechnungen und Protokoll. Lexware: offen, welches Produkt im Einsatz ist (siehe unten).

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

`app/api/geocode/route.ts` und `app/api/adresse-suchen/route.ts` bremsen über eine
Modulvariable. Bei mehreren gleichzeitigen Vercel-Instanzen greift das nicht, und ein
angemeldeter Nutzer kann die Route in einer Schleife aufrufen. Im Ernstfall sperrt der
kostenlose Dienst die Firma aus.

*Behebung:* einfache Zählung je Nutzer und Zeitfenster in einer Tabelle. Aufwand: klein
bis mittel.

### B4. CSP erlaubt weiterhin `unsafe-inline`

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

| Spalte | Status |
|---|---|
| `articles.braucht_lagerplatz` | Seit Migration 46 ohne Wirkung, im Code nirgends mehr gelesen. Kann fallen. |

### C2. Toter Code

- `rechtSchluessel()` in `lib/constants.ts` wird von niemandem aufgerufen. Entweder überall
  verwenden (dann auch in `canView()` und in `PermissionMatrix`, die den Schlüssel je
  einzeln zusammenbauen) oder entfernen.
- `GEO_GENAUIGKEIT_LABEL` in `lib/constants.ts` wird nirgends verwendet – entweder in der
  Oberfläche einsetzen (siehe E7) oder entfernen.
- Das Prop `pflicht` in `components/auftraege/EinlagerungBlock.tsx` wird an beiden
  Einbindungsstellen fest auf `false` gesetzt; der zugehörige Zweig ist tot.
- `QrBild` existiert fast wortgleich zweimal (`LagerplatzAufkleber.tsx`,
  `ReifensatzEtikett.tsx`).

### C3. Kommentare, die etwas anderes sagen als der Code

- Migration 37 behauptet, die Standarddauer sei „auch im Code 60 Minuten" – in
  `lib/constants.ts` stehen 30, und maßgeblich ist ohnehin `betrieb.termin_intervall_min`.
- `AuftraegePanel.tsx` und `EinsatzplanungPanel.tsx` tragen noch Kommentare aus der Zeit
  vor Migration 41 („Techniker darf keine Leistungen ändern") – das stimmt nicht mehr.

### C5. Große Dateien

`app/page.tsx` ist wieder auf rund 3.100 Zeilen gewachsen (nach der Sanierung waren es
1.290). `components/auftraege/AuftragModal.tsx` liegt bei gut 1.000, `components/lager/
LagerPanel.tsx` bei knapp 900, `lib/helpers.ts` bei rund 970 Zeilen.

Das ist kein akutes Problem, aber jedes neue Modul hat bisher Zustand und Ladefunktionen in
`HomePage` dazugelegt, ohne dass Älteres kleiner wurde. Sinnvoller nächster Schnitt:
`TireAssignModal` aus `LagerPanel` herauslösen, `helpers.ts` thematisch teilen.
Aufwand: mittel, jederzeit aufschiebbar.

### C6. Keine Tests für Komponenten

Vitest deckt ausschließlich reine Rechenfunktionen ab. Dass ein Trigger-Fehler (etwa die
Vollständigkeitsprüfung der Rechnungsdaten) in der Oberfläche als lesbare Meldung ankommt,
prüft niemand automatisch. Aufwand: mittel, dauerhafter Nutzen.

### C7. Rollback-Skripte für die Migrationen 01–14 fehlen

Sie fehlen bewusst – diese Migrationen legen das Grundschema an, ihre Rücknahme wäre das
Leeren der Datenbank. Kein Handlungsbedarf, nur hier festgehalten, damit die Lücke nicht
für ein Versehen gehalten wird.

---

## D. Verbesserungen am Bestehenden

Nach Nutzen sortiert.

| # | Was | Warum | Aufwand |
|---|---|---|---|
| D2 | **Löschen eines Auftrags absichern**, wenn eine Rechnung dazu existiert oder der Auftrag erledigt/storniert ist | Heute lässt sich ein abgerechneter Auftrag ohne Warnung aus allen Listen entfernen. Die Rechnung bleibt als Beleg bestehen, ist aber nicht mehr auffindbar. | klein |
| D4 | **Zweites Sortierkriterium** bei allen Auftragsabfragen (`order_date`, dann Auftragsnummer) | Ohne zweites Kriterium ist die Reihenfolge bei gleichem Datum nicht festgelegt; zusammen mit der seitenweisen Abfrage können Zeilen doppelt oder gar nicht erscheinen. | klein |
| D8 | **`mit_steuer` nicht mehr raten.** `RechnungDokument` fällt bei alten Belegen ohne dieses Feld auf `steuer !== 0` zurück – bei einer Rechnung über lauter steuerfreie Positionen ist das falsch. Für Altbestände einmalig setzen statt schätzen. | klein |
| D9 | **Einheitliche Löschbestätigung mit Auftragsnummer** – es gibt vier Stellen mit drei verschiedenen Texten, einer davon ohne jede Kennung | Bei lauter Aufträgen namens „Termin" ist der Titel keine brauchbare Rückfrage. | klein |
| D10 | **Telefonnummern kanonisch speichern** (zusätzliche Vergleichsform) | Voraussetzung für zuverlässige Suche und für die Dublettenerkennung (E1). Heute sind „0911 12345", „0911/12345" und „+49 911 12345" drei verschiedene Nummern. | mittel |
| D11 | **Filter „Storniert" in der Einsatzplanung** ergänzen – die Auftragsliste dort hat vier Filter, die Auftragsliste im Auftragsreiter fünf | klein |
| D12 | **Wiedereröffnen eines stornierten Auftrags** vom normalen Wiedereröffnen unterscheiden und den Stornogrund dabei zeigen | Fachlich sind „Arbeit war fertig" und „kam gar nicht zustande" zwei verschiedene Situationen. | klein |
| D13 | **Rückfrage beim Abschließen ohne Leistungen** („keine Leistung zugeordnet – trotzdem abschließen?") | klein |
| D14 | **Freie Plätze nach Lager gruppieren** in der Lagerplatz-Auswahl (`optgroup`) | Am Handy muss man sonst je Zeile den angehängten Lagernamen mitlesen. | klein |
| D15 | **Größere Schritte bei der Profiltiefe-Messung** (zusätzlich ±1 mm neben ±0,1 mm) | 6,0 → 2,0 mm sind heute vierzig Tipper, mit Handschuhen im Lager. | klein |
| D16 | **`canView()` robuster machen** – es teilt den Schlüssel am ersten Punkt, ein zweistufiger Bereich wie `lager.regale` würde still falsch ausgewertet. Heute wird es nirgends so aufgerufen, die Falle steht aber offen. | klein |
| D17 | **IBAN in den Betriebsdaten prüfen** (Länge und Prüfsumme) | Ein Tippfehler fällt sonst erst beim Kunden auf – oder der Girocode fehlt kommentarlos. | klein |
| D18 | **Aufkleberdruck für sehr große Lager stückeln** | Mehrere hundert QR-Bilder auf einmal lassen Safari am iPhone hängen. | mittel |

---

## E. Neue Funktionen – was dem Betrieb wirklich hilft

Nach Nutzen sortiert, nicht nach Aufwand.

### E1. Dublettenprüfung bei der Kundenanlage
Beim Anlegen wird heute nichts geprüft. Bei 424 Bestandskunden und telefonischer Neuanlage
entstehen Karteileichen zwangsläufig; die Dokumentation nennt „Dublette" bereits als Grund
für eine Deaktivierung, ohne dass es ein Werkzeug dagegen gäbe. Ein nicht blockierender
Hinweis („ähnlicher Kunde vorhanden: … – trotzdem anlegen?") auf Basis von Name + PLZ und
normalisierter Telefonnummer, dazu eine Admin-Ansicht mit Zusammenführen-Knopf.
*Aufwand: mittel. Setzt D10 voraus.*

### E2. Kommissionierliste „Was muss heute mit"

**Teilweise vorhanden seit 23.09.2026:** Die eingelagerten Sätze, die mitmüssen, zeigt die
Mitnehmen-Liste hinter dem Abendhinweis (`lib/mitnehmen.ts`,
`components/auftraege/MitnehmenFenster.tsx`). Was fehlt, sind die Leistungen und Reifengrößen –
E2 baut auf dieser Liste auf, statt eine zweite zu beginnen.

Aus allen Terminen eines Tages die zugeordneten Leistungen und die Reifengrößen der
betroffenen Fahrzeuge zusammenziehen, als eine Liste für die Beladung des Transporters am
Morgen. Nutzt ausschließlich Daten, die schon da sind.
*Aufwand: klein bis mittel. Sehr hoher Alltagsnutzen.*

### E3. Foto und Unterschrift beim Abschließen
Zustand der Reifen vorher/nachher fotografieren und den Kunden auf dem Handy quittieren
lassen. Bei Reklamationen ist das der Unterschied zwischen Aussage gegen Aussage und einem
Beleg. Das Datenmodell war dafür von Anfang an mitgedacht.
*Aufwand: mittel bis groß (Dateiablage nötig).*

### E5. Tagesroute nach Fahrstrecke sortieren
Die Tagesliste sortiert nach Uhrzeit. Für einen mobilen Dienst mit mehreren Stopps wäre
eine Reihenfolge nach kürzestem Weg unmittelbar Zeit- und Spritersparnis. Die Koordinaten
liegen für die Navigation ohnehin vor.
*Aufwand: mittel.*

### E6. Auftragsvorlagen für wiederkehrende Leistungspakete
„Saisonwechsel mobil", „Wechsel + Wuchten" als ein Klick statt jeder Position einzeln.
*Aufwand: klein bis mittel.*

### E7. Stapel-Auslagern für den Saisonwechsel
Beim eigentlichen Saisonwechsel muss heute jeder Satz einzeln über den Auslagern-Dialog.
Ein geführter Modus „einen nach dem anderen abarbeiten" wäre bei dreistelligen Stückzahlen
ein spürbarer Unterschied.
*Aufwand: groß.*

### E8. Reifengrößen-Abgleich beim Einlagern
Am Fahrzeug steht eine Reifengröße, am eingelagerten Rad ebenfalls – verglichen wird nie.
Eine Warnung bei Abweichung findet falsch zugeordnete Sätze zum frühestmöglichen Zeitpunkt.
*Aufwand: mittel.*

### E9. Terminbestätigung an den Kunden
Heute erinnert die App das eigene Personal. Eine Bestätigung oder Erinnerung an den Kunden
(SMS oder E-Mail) senkt die Zahl der vergeblichen Anfahrten. Braucht einen externen
Dienst – vor dem Bau die Frage klären, ob das sein soll.
*Aufwand: mittel bis groß.*

### E10. Auskunftsauszug je Kunde
Ein Knopf im Kundenfenster (nur Admin), der alles zu diesem Kunden Gespeicherte als PDF
zusammenstellt. Deckt die DSGVO-Auskunft ab, die heute nur durch Durchklicken bedienbar
wäre. Passt zu B1/B2.
*Aufwand: mittel.*

### E11. Lagerauslastung im Blick
Hinweis, wenn ein Lager über 90 % belegt ist. Die Kennzahlen dafür werden bereits geladen.
*Aufwand: klein.*

### E12. Kapazitätsklasse am Lagerplatz
„Normal" und „groß/SUV", damit die Auswahl freier Plätze keine 20-Zöller in zu kleine
Fächer schickt.
*Aufwand: mittel.*

---

## F. Aus der alten Planung übernommen

### F1. Offline schreiben (PWA Stufe 4)
Lesen funktioniert offline (Stufen 1–3 sind gebaut). Schreiben nicht: es fehlt eine
Warteschlange und eine Konfliktbehandlung.

**Entschieden am 23.09.2026: der GROSSE Zuschnitt, als eigene Runde** – alles am Auftrag außer
Abschließen (Status „in Arbeit", Notiz, Uhrzeit, Titel/Beschreibung, Leistungen, Endpreis,
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
   23.09.2026). Erste Runde: Warteschlange, Anzeige „n Änderungen warten", Status/Notiz/Radmessung;
   zweite Runde: Leistungen, Uhrzeit, Fahrzeug, Konfliktabfrage.
2. **D2** – Löschen eines Auftrags mit Rechnung absichern (klein, schützt Belege).
3. **DATEV-Probeimport** – die erste Datei beim Steuerberater einlesen lassen (E13 ist gebaut).
4. **E2** – Kommissionierliste, auf der Mitnehmen-Liste aufbauend.
5. **D17, D4, B3** – Kleinkram, der in einem Zug mitgeht.

## Offen: Lexware (Stand 26.09.2026)

Entschieden: PinPoints schreibt weiter die Rechnungen. Offen ist, ob und wie Lexware die Belege
bekommt – das hängt am Produkt: **Lexware Office** (Cloud, früher lexoffice) hat eine Public API
(ab Tarif XL, ohne Aufpreis) für Kontakte, Rechnungen und das Hochladen von Belegen; einen
Datei-Import für Rechnungen oder Buchungen hat es nicht. **Lexware Desktop** (faktura+auftrag)
importiert per CSV nur Kunden und Artikel. Nächster Schritt: Vitali klärt das Produkt.
