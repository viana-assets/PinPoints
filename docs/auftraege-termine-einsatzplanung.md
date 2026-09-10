# Aufträge, Termine, Einsatzplanung

## Termine und Aufträge sind ein Modul

Migration 07: ein "Termin" ist technisch ein Auftrag (`orders`) mit gesetzter Uhrzeit
(`time`). Ein Auftrag kann auch ganz ohne Uhrzeit angelegt werden – dann ist er ein Termin,
dessen Uhrzeit noch offen ist. Helfer dafür: `formatOrderDateTime`/`isOrderPast`/
`nextOrder`/`orderDateTime` in `lib/helpers.ts`. Die alte Tabelle `appointments` ist mit
Migration 21 endgültig verschwunden.

### Warum es trotzdem zwei Reiter gibt (Stand 29.08.2026)

Beide zeigen **dieselben** Aufträge – bewusst, es gibt keine zweite Datenquelle und damit keine
zweite Wahrheit. Sie unterscheiden sich in der Tiefe:

| Reiter | Frage, die er beantwortet | Zeigt |
|---|---|---|
| **Termine** | *Wann bin ich wo, bei wem, mit wem?* | chronologische Liste: Datum/Uhrzeit, Kunde mit Adresse, Zustandskennzeichen, Titel, Mitarbeiter – dazu Navigation, Anrufen, Sprung ins Kundenfenster |
| **Aufträge** | *Was ist zu tun, was kostet es, ist es fertig?* | volle Tabelle mit Filtern über Zustand, Mitarbeiter und Kunde, plus Zeitfenster-Schalter |

**Beide führen in dasselbe Auftragsfenster.** Ein Klick auf eine Terminzeile öffnet den Auftrag,
nicht mehr den Kunden – vorher gab es aus dem Reiter, der nach dem Termin heißt, überhaupt keinen
Weg zum dazugehörigen Auftrag. Das war die Hauptursache für den Eindruck, Termin und Auftrag
seien nicht verknüpft (`termine-kontakt-auftrag-analyse.md`). Der Kunde bleibt über die
Personen-Schaltfläche am rechten Rand der Zeile erreichbar.

Ein Kennzeichen `ist_termin` gibt es bewusst nicht: die Unterscheidung „Termin oder Auftrag" ist
keine Eigenschaft der Daten, sondern eine Frage der Betrachtung, und gehört deshalb in die
Oberfläche statt in die Tabelle.

## Geladener Zeitraum (Roadmap Phase 10)

Anders als die Kunden (feste Menge) wachsen Aufträge mit jedem Betriebsjahr weiter. Deshalb
lädt die App nicht mehr die ganze Tabelle, sondern ein **Zeitfenster**, das über dem Aufträge-
Tab und der Einsatzplanung umschaltbar ist (`FensterSchalter` in `app/page.tsx`, Logik in
`lib/api/orders.ts`):

| Auswahl | Was geladen wird |
|---|---|
| **Aktuell** (Standard) | erledigte Aufträge der letzten 30 Tage – **plus alle offenen, egal wie alt** |
| **Dieses Jahr** | alles ab dem 1. Januar des laufenden Jahres, plus alle offenen |
| **Alle** | ohne Begrenzung |

Der wichtige Teil ist die Ausnahme: **offene Aufträge kommen immer mit**. Was noch zu tun ist,
kann nie aus dem Blick geraten – ausgeblendet werden nur alte, bereits erledigte Aufträge.

Zwei Stellen sind bewusst vom Fenster ausgenommen: das **Kundendetail** zeigt die vollständige
Auftragshistorie dieses einen Kunden (eigene Abfrage, je Kunde kleine Zeilenzahl), und die
Mitarbeiter-/Leistungszuordnungen kommen verschachtelt mit den Aufträgen, können also gar nicht
zum geladenen Fenster in Widerspruch geraten.

## Zustände und das Auftragsfenster

Wie ein Auftrag seine Zustände durchläuft, was „abschließen" bedeutet und warum der Status
kein Auswahlfeld mehr ist, steht vollständig in **`auftragsablauf.md`**. Kurz: Zustände werden
nicht ausgewählt, sondern durch benannte Handlungen erreicht, ein Abschluss friert die
Positionen ein, und ein Klick auf eine Auftragszeile öffnet überall dasselbe Auftragsfenster
(`components/auftraege/AuftragModal.tsx`).

## Aufträge-Modul

„Aufträge & Termine", eigener Hauptnav-Tab `tab === "auftraege"` (`AuftraegePanel`): volle
Breite, Status-Filterleiste (Alle/Offen/In Arbeit/Erledigt/Storniert) plus Mitarbeiter- und
Kundenfilter, Kundenzuordnung über `CustomerPicker` beim Anlegen, Uhrzeit optional (= Termin).
Die Tabelle ist eine **Übersicht**: Auftragsnummer, Termin, Kunde, Titel, Mitarbeiter,
Leistungssumme, Status als farbiges Kennzeichen. Gehandelt wird im Auftragsfenster, das ein
Klick auf die Zeile öffnet. Der Kundenname ist weiterhin gesondert klickbar und öffnet die
Kundendetails (`DetailModal`).

Die Mitarbeiter-Zuordnung bleibt zusätzlich als Popover direkt in der Zeile – beim Einteilen
mehrerer Aufträge hintereinander ist das schneller, als jedes Mal ein Fenster zu öffnen. Das
frühere **Leistungen-Popover ist ersatzlos entfallen**: für die Positionserfassung war es zu
klein, genau daran hat sich der Umbau entzündet.

**Titel von Terminen** werden mit „Termin – ‹Kundenname›" vorbelegt (`terminTitel()` in
`lib/helpers.ts`). Vorher hießen alle Termine schlicht „Termin", was in einer Liste nichts
unterscheidet. Die Vorbelegung greift im Aufträge-Modal, im Kundendetail und beim Anlegen aus
dem Karten-Popup heraus; bleibt der Titel trotzdem leer, setzt `addOrder()` ihn zentral.

## Mehrere Mitarbeiter je Auftrag

Migration 11, Tabelle `order_employees` (`order_id` + `employee_id`, viele-zu-viele): ein
Auftrag kann mehreren Mitarbeitern zugeordnet sein, z. B. wenn er so umfangreich ist, dass
mehrere Techniker gemeinsam eingeteilt werden müssen. Die alte Spalte
`orders.assigned_employee_id` (nur ein Mitarbeiter) bleibt in der Datenbank als Altlast
bestehen, wird von der App aber nicht mehr gelesen/geschrieben.

In `app/page.tsx`: State `orderEmployees` (Auftrag-ID → Liste von Mitarbeiter-IDs),
`refreshOrderEmployees()`/`setOrderEmployees(orderId, employeeIds)` (löscht + fügt neu ein),
Helfer `employeeNamesFor(orderId)` (kommagetrennte Namen für Tabellenzellen) und
`openEmpMenu(e, orderId)` (öffnet ein kleines Checkbox-Menü zum Zuordnen, jeder Klick
speichert sofort). Wiederverwendbare Komponente `EmployeeCheckboxList` (Chip-Mehrfachauswahl)
für die größeren Formulare. Die schnelle "Kunde ruft an, gleich Auftrag anlegen"-Maske in
`AddCustomerForm` (Neuer-Kunde-Tab) bleibt bewusst bei einem einzelnen Mitarbeiter.

## Einsatzplanung-Modul

Eigener Top-Level-Tab `tab === "einsatzplanung"`, `EinsatzplanungPanel`: Monats-Kalender
(Montag–Sonntag als Spalten, Kalenderwochen links, wie bei Google Kalender), mit
Monats-Navigation (‹ Monat ›, "Heute"). Jeder Tag zeigt kleine farbige Punkte für die an dem
Tag eingesetzten Mitarbeiter (Farbe pro Mitarbeiter über `EMP_COLORS`/`employeeColorFor`,
siehe `konstanten-register.md`) plus einen grauen Punkt, wenn an dem Tag noch nicht
zugeordnete Aufträge liegen. Ein Mitarbeiter-Filter (Chips oberhalb des Kalenders) blendet
die Punkte auf einen einzelnen Mitarbeiter ein. Klick auf einen Tag zeigt darunter die
Aufträge dieses Tages, gruppiert nach Mitarbeiter (inkl. Gruppe "Nicht zugeordnet"),
Kundenname klickbar (öffnet `DetailModal`). Darunter zusätzlich eine vollständige, vom
ausgewählten Tag unabhängige Auftragsliste mit Status-/Mitarbeiter-Filter, Kunden-Textfilter
und klickbaren Spaltenüberschriften zum Sortieren (Termin/Kunde/Status, auf/absteigend) –
Mitarbeiter-/Leistungen-Zuordnung und Löschen direkt in der Zeile.

Kalender-Hilfsfunktionen (`startOfWeekMonday`, `addDays`, `toDateStr`, `isoWeekNumber`) sind
eigenständige Funktionen in `app/page.tsx`, wiederverwendbar für ähnliche Kalenderansichten.

Siehe auch `artikelstammdaten.md` für die "Leistungen"-Spalte/das Artikel-Popover, das in
beiden Auftragslisten (Aufträge-Tab und Einsatzplanung) auf demselben Muster wie die
Mitarbeiter-Zuordnung aufsetzt.

## Uhrzeit ist Pflicht, und die Termine-Karte zeigt nur Termine (09.09.2026)

**Die Uhrzeit war „(optional)" – und wurde entsprechend oft weggelassen.** Die Folge im
Alltag: Der Kunde muss ein zweites Mal angerufen werden, um die Zeit abzustimmen. Seit dem
09.09.2026 verlangt das Auftragsfenster eine Uhrzeit, bevor gespeichert werden kann.

Zwei bewusste Einschränkungen dieser Regel:

*Nicht in der Datenbank erzwungen.* Ein Auftrag entsteht mit einem Klick auf der Karte und ist
in dieser Sekunde noch ohne Uhrzeit – eine NOT-NULL-Bedingung würde genau diesen Weg verbauen.
Die Regel greift dort, wo die Angabe hingehört: beim Speichern des Fensters.

*Nicht für Techniker.* Sie dürfen nur ihre Notiz schreiben. Sie wegen einer fehlenden Uhrzeit
auszusperren, die sie gar nicht setzen dürfen, wäre eine Sackgasse.

**Der Reiter „Termine" hat jetzt einen Zeitraum statt eines Häkchens** – Heute / Morgen /
7 Tage / Anstehend / Alle, jeweils mit Trefferzahl. „Nur anstehende Termine zeigen"
beantwortete die eigentliche Frage nicht; die lautet „wo bin ich heute" oder „wie liegen die
Termine dieser Woche".

**Und die Karte folgt dieser Auswahl.** Solange der Reiter „Termine" offen ist, zeigt sie nur
noch Kunden mit einem Termin im gewählten Zeitraum. Vorher standen dort weiterhin alle
Kunden – die Frage „wie verteilen sich meine Termine morgen" war auf der Karte nicht zu
beantworten, obwohl die Karte genau dafür da ist. Technisch: `terminKundenIds` (abgeleitet aus
den gefilterten Terminzeilen) liegt in einer Ref, weil `syncMarkers()` außerhalb des
React-Renderzyklus läuft; `null` heißt „keine Einschränkung".

Hinweis zum Lesen der Liste: Termine in der VERGANGENHEIT erscheinen nur unter „Alle". Wer
einen Termin nachträglich auf ein vergangenes Datum pflegt, findet ihn folgerichtig nicht
unter „Anstehend" – das ist kein Fehler, sondern die Antwort auf eine andere Frage.

### Termin-Spalte: drei Zeilen statt einer

Datum, Uhrzeit und der Hinweis „vergangen" stehen untereinander. Nebeneinander erzwangen sie
über `white-space:nowrap` eine Spaltenbreite, die auf dem Handy die halbe Liste auffraß –
und die Zeile brach trotzdem irgendwo um. Formatierung über `.date-zeit` und
`.date-vergangen` im Stilblatt, nicht über `style`-Attribute.

## Unser Fahrzeug am Auftrag (Migration 32)

Im Auftragsfenster gibt es zwei Blöcke, die beide „Fahrzeug" heißen könnten – deshalb heißen
sie es nicht beide: **Fahrzeug** ist das Auto des Kunden (was wird gemacht), **Unser Fahrzeug**
der eigene Transporter (wer fährt hin, und was ist geladen). Zwei getrennte Tabellen, zwei
getrennte Blöcke; eine Tabelle mit zwei Bedeutungen wird an fünfzig Stellen zu zwei
Bedeutungen.

Die Einteilung macht das Büro: Techniker sehen sie, ändern dürfen sie sie nicht – das erzwingt
der Spaltenschutz aus Migration 20/22, der über eine Positivliste änderbarer Spalten
funktioniert und eine neue Spalte damit automatisch sperrt.

In der **Einsatzplanung** gibt es eine zweite Filterleiste unter der der Mitarbeiter, mit
derselben Bedienung: alle Fahrzeuge, je Kennzeichen, und **„Nicht eingeteilt"** als eigener
Knopf – das ist die Lücke, die man vor dem Tag schließen will. In der Tagesliste steht das
Kennzeichen als eigene Spalte.

Ein ausgemustertes Fahrzeug bleibt an seinen alten Aufträgen sichtbar und im Auswahlfeld
wählbar, solange es dort hängt – sonst verschwände die Angabe beim nächsten Speichern
stillschweigend.
