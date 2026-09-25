# Aufträge, Termine, Einsatzplanung (Stand 21.09.2026)

Ersetzt `auftragsablauf.md` (Stand 04.09.2026) und `auftraege-termine-einsatzplanung.md`
(Stand 10.09.2026), die beide gelöscht werden. Dieses Blatt beschreibt nur den **Ist-Zustand**
gegen den Code von heute – keine Roadmap, keine Wunschliste. Wo die beiden alten Dokumente
inzwischen falsch lagen, steht hier der aktuelle Stand, nicht die alte Aussage.

## 1. Zweck und Abgrenzung

Ein „Termin" ist technisch ein Auftrag (`orders`) mit gesetzter Uhrzeit (`time`) – seit
Migration 07. Ein Auftrag kann auch ganz ohne Uhrzeit angelegt werden; dann ist er ein Termin,
dessen Uhrzeit noch offen ist. Die alte Tabelle `appointments` existiert nur noch als
Altbestand, ist seit Migration 16 für die App gesperrt und wird nirgends mehr gelesen.

Drei Ansichten auf **dieselben** Aufträge, keine zweite Datenquelle:

| Tab/Modul | Frage, die er beantwortet | Komponente |
|---|---|---|
| **Termine** | Wann bin ich wo, bei wem? Chronologische Schnellsicht mit Zeitraum-Filter. | Inline in `app/page.tsx` |
| **Aufträge** | Was ist zu tun, was kostet es, ist es fertig? Volle Tabelle, Status-/Mitarbeiter-/Kundenfilter. | `components/auftraege/AuftraegePanel.tsx` |
| **Einsatzplanung** | Wer ist wann wo? Kalender (Monat/Woche/Tag) plus dieselbe volle Liste. | `components/einsatzplanung/EinsatzplanungPanel.tsx` |

Ein Klick auf eine Auftragszeile öffnet **überall** dasselbe Auftragsfenster
(`components/auftraege/AuftragModal.tsx`). Ein Kennzeichen `ist_termin` gibt es bewusst nicht:
die Unterscheidung „Termin oder Auftrag" ist eine Frage der Betrachtung, keine Eigenschaft der
Daten.

## 2. Datenmodell

**`orders`** (Auszug, `lib/types.ts`):

| Feld | Bedeutung |
|---|---|
| `order_number` | Fortlaufende, lesbare Nummer (Migration 20). Getrennt von `id` (UUID). |
| `customer_id` | Pflicht – ein Auftrag ohne Kunden existiert nicht. |
| `title`, `description` | Bürotext. Titel wird beim Anlegen mit `terminTitel(kundenName)` vorbelegt ("Termin – ‹Kunde›"), bleibt überschreibbar. |
| `status` | `offen` \| `in_arbeit` \| `erledigt` \| `storniert`. Kein Auswahlfeld, wird nur über Trigger-geprüfte Übergänge erreicht. |
| `order_date`, `time`, `end_time` | Datum, Anfang, Ende (Migration 37, Abschnitt 4). |
| `techniker_notiz` | Freitext, ausschließlich von der zugeordneten Techniker-Rolle gepflegt. |
| `firmenfahrzeug_id` | Welcher eigene Transporter fährt (Migration 32) – Büro-Sache, siehe Abschnitt 3. |
| `completed_at/by`, `cancelled_at/by`, `cancel_reason`, `reopen_reason` | Von der Datenbank gesetzt, nie vom Client (Migration 20/46). |
| `rechnung_noetig` | Schalter am Auftrag: kommt auf den Nettobetrag die Steuer (Migration 38)? |
| `rechnung_erstellt_am/von`, `rechnung_nummer` | Seit Migration 49 von einem Trigger gesetzt, sobald eine Rechnung zum Auftrag entsteht (Abschnitt 8e) – kein manueller Haken mehr. |
| `deleted_at` | Soft-Delete (Migration 19). |

**`order_employees`** (Migration 11): reine `order_id`/`employee_id`-Zuordnungstabelle,
viele-zu-viele. Die alte Spalte `orders.assigned_employee_id` (ein Mitarbeiter) besteht in der
Datenbank als Altlast fort, wird von der App nicht mehr gelesen oder geschrieben.

**`order_articles`** (die „Leistungen"): `order_id`, `article_id`, `quantity`, `net_price`,
`vat_rate` (Preis-Schnappschuss vom Zuordnungszeitpunkt, Migration 12), `endpreis_netto`
(Sonderpreis je Position, Migration 38 – **kein** Prozentrabatt mehr, wie es die frühere
Fassung dieses Dokuments noch mit „Menge/Rabatt/Einzel/Summe" beschrieb; im Gespräch läuft es
als „das kostet 50, wir machen 40", der Endpreis ist die Aussage, der Rabatt wird nur daneben
ausgerechnet), `note` (Rechnungstext – bei einem Freitext-Artikel, `articles.freitext`,
Migration 50, die Bezeichnung selbst; sonst eine Zusatzzeile darunter), `deleted_at`
(Soft-Delete). Eingefroren wird die ganze Tabelle je Auftrag durch einen Datenbank-Trigger
(Migration 20), sobald `orders.status` `erledigt` oder `storniert` ist – siehe Abschnitt 8b.

**`auftrag_fahrzeuge`** (Migration 44, `id`, `order_id`, `vehicle_id`, `kilometerstand`,
`created/updated_at/by`, `unique(order_id, vehicle_id)`): welche Fahrzeuge ein Auftrag betrifft,
mit Kilometerstand je Fahrzeug und Auftrag – seit Migration 51 die **einzige** Quelle dafür,
nicht mehr nur eine von zweien. Ausführlich in Abschnitt 9.

**`contact_history`** (`id`, `customer_id`, `date`, `note`): die Kontakt-Historie eines Kunden.
Seit Migration 47 bekommt sie auch beim Abschließen eines Auftrags eine Zeile – Abschnitt 7.

## 3. Der Lebenszyklus eines Auftrags

**Zustände** (unverändert seit Migration 20, `ABGESCHLOSSENE_ZUSTAENDE` in `lib/constants.ts`):

| Zustand | Bedeutung |
|---|---|
| **Offen** | Angelegt, ggf. terminiert und Mitarbeitern zugeordnet. Alles änderbar. |
| **In Arbeit** | Der Einsatz läuft. Alles änderbar. |
| **Erledigt** | Vor Ort fertig. Positionen eingefroren. |
| **Storniert** | Kommt nicht zustande. Positionen eingefroren, Grund hinterlegt. |

**Übergänge**, wie sie `enforce_order_status_transition()` heute durchsetzt (die Funktion wurde
in Migration 46 vollständig neu geschrieben, um den in Abschnitt 8d beschriebenen
Einlagerungs-Zwang zu entfernen – alles Übrige daran ist gegenüber Migration 20 unverändert):

```
offen ──▶ in_arbeit ──▶ erledigt          offen ──▶ storniert
offen ──▶ erledigt      in_arbeit ──▶ offen      in_arbeit ──▶ storniert
```

Aus `erledigt` **und** aus `storniert` heraus lässt die Datenbank eine Wiedereröffnung nach
`offen` oder `in_arbeit` zu – nicht nur aus `erledigt`, wie es die vorige Fassung dieses
Dokuments beschrieb. In der Oberfläche gibt es dafür aber nur einen Knopf, „Wiedereröffnen",
und er setzt immer `in_arbeit`; er erscheint, sobald der Auftrag gesperrt ist (`erledigt` oder
`storniert`), verlangt **Admin oder Superadmin** (`isAdmin` in `app/page.tsx`,
`darfWiedereroeffnen={isAdmin}`) und eine Begründung (`reopen_reason`, Pflichtfeld laut
Trigger). Storno verlangt ebenso einen Grund (`cancel_reason`). `completed_at/by` bzw.
`cancelled_at/by` setzt und räumt der Trigger selbst.

„Abschließen" heißt drei Dinge: die Positionen frieren ein (Abschnitt 8b), Zeitpunkt und Person
stehen fest, und der Auftrag verlässt die Arbeitsliste – bleibt aber über das Zeitfenster
(Abschnitt 6) erreichbar.

### Wer was darf

Bis zum 16.09.2026 (Migration 41) durfte eine der Techniker-Rolle zugeordnete Person an ihrem
eigenen Auftrag **nur** `status` und `techniker_notiz` ändern (Positivliste in einem
Spaltenschutz-Trigger) und die Leistungen nur lesen – das ist, was die alten Dokumente noch
beschreiben und was heute **nicht mehr stimmt**.

Migration 41 hat das Prinzip umgedreht: seither gilt eine **Negativliste**
(`restrict_techniker_order_update()`). Ein Techniker darf an einem ihm über `order_employees`
zugeordneten Auftrag **alles ändern außer**: `id`, `order_number`, `customer_id`, `created_at`,
`created_by`, `cancelled_at`, `cancelled_by`, `cancel_reason`, `deleted_at`, `reopen_reason`.
Das heißt konkret: Titel, Termin, Beschreibung, das Kundenfahrzeug, „Unser Fahrzeug" und die
Leistungen (`order_articles` – anlegen, ändern, entfernen, RLS-Policy aus Migration 41/42) darf
er jetzt selbst pflegen; verwehrt bleiben ihm Stornieren, Löschen und Wiedereröffnen. Der Grund
laut Migration: jede Änderung steht seit Migration 18/36 ohnehin mit Person und Zeitpunkt im
Protokoll (sichtbar unten im Auftragsfenster, `AuftragProtokoll.tsx`) – Nachvollziehbarkeit
statt Verbot. Der Einfrier-Trigger aus Migration 20 gilt für ihn unverändert weiter: an einem
bereits abgeschlossenen Auftrag ändert auch der Techniker nichts mehr.

**Unverändert Büro-Sache** bleiben zwei Dinge, beide über Migration 42 (Rechte als
Lesen/Schreiben/Löschen je Bereich statt eines einzelnen Hakens):

- **Einen Auftrag anlegen** – `auftraege.auftrag.schreiben` (INSERT) ist für die Rolle
  Techniker per RLS explizit ausgeschlossen. Wer sich selbst Aufträge zuteilen könnte, teilt
  sich auch fremde zu.
- **Die Mitarbeiter-Einteilung** (`order_employees`) – `auftraege.einteilung.schreiben` enthält
  Techniker nicht, unabhängig davon, was `auftraege.auftrag` erlaubt.

Praktisch heißt das: In den Tabellenzeilen von `AuftraegePanel.tsx` und
`EinsatzplanungPanel.tsx` sieht ein Techniker keinen „+ Auftrag"-Knopf, keinen Löschen-Knopf
und kann die Mitarbeiter-Spalte nicht anklicken (nur Text statt Knopf). **Im Auftragsfenster
selbst** (sein eigener Auftrag) darf er dagegen seit Migration 41 fast alles bearbeiten – nur
die Mitarbeiter-Zuordnung bleibt auch dort reine Anzeige. Beide Panels tragen im Quelltext
noch einen Kommentar aus der Zeit vor Migration 41 („… darf zusätzlich keine
Mitarbeiter-/Leistungen-Zuordnung ändern – nur Status und die eigene Techniker-Notiz"), der für
die Leistungen nicht mehr zutrifft und beim nächsten Anfassen dieser Dateien korrigiert gehört.

### Wie ein Auftrag entsteht

Unverändert gegenüber dem 04.09.2026-Nachtrag der alten Fassung: **vier Wege, davon einer mit
Zwischenschritt**, alle vier legen sofort die Zeile an und öffnen direkt das vollständige
Auftragsfenster (kein separates Formular mehr, das Fahrzeug/Leistungen nicht kennt):

| Von wo | Kunde | Zwischenschritt |
|---|---|---|
| Reiter „Aufträge" → „+ Auftrag" | wird ausgewählt | `OrderModal` – nur Kundenauswahl (`CustomerPicker`) |
| Karten-Popup → „+ Auftrag anlegen" | steht fest | keiner |
| Kundenfenster (`DetailModal`) | steht fest | keiner |
| Neuer Kunde, Ankreuzfeld „gleich einen Auftrag anlegen" | wird gerade angelegt | keiner |
| Kontaktdialog, Ergebnis „Auftrag vereinbart" | steht fest | keiner (führt über denselben Weg wie das Karten-Popup) |
| Einsatzplanung → Klick in eine freie Stelle des Stundenrasters | wird ausgewählt | `OrderModal` – Kundenauswahl, Termin steht schon fest |

`AddOrderInline` ist bestätigt ersatzlos entfallen (`OrderModal.tsx` verweist im Kommentar
selbst darauf). Ein neu angelegter Auftrag ist immer `offen`, mit heutigem Datum, Titel
„Termin – ‹Kunde›" und ohne Uhrzeit; das Auftragsfenster zeigt einen Hinweis, was jetzt zu tun
ist, und „Verwerfen" statt einer Löschen-Rückfrage.

**Der Kalender-Weg im Einzelnen (22.09.2026).** Ein Klick in eine freie Stelle einer Tagesspalte
öffnet dasselbe `OrderModal` wie der Aufträge-Reiter – nur mit dem angeklickten Zeitpunkt in
einer Zeile darüber. Das ist bewusst **kein fünftes Formular**: Datum und Uhrzeit sind das
Einzige, was der Klick weiß, und alles Weitere wird dort erfasst, wo es hingehört.

* Die Uhrzeit entsteht in `terminAusKlick()` (`lib/calendar.ts`) aus der Höhe des Klicks, **auf
  15 Minuten abgerundet**. Das feste Viertelstundenraster ist nicht das Terminraster des
  Betriebs: Letzteres sagt, wie LANG ein Termin dauert (und liefert hier das Ende), das
  Viertelstundenraster, wie genau man zielen kann. Ein 90-Minuten-Raster ergäbe Startzeiten
  wie 10:30, 12:00, 13:30 – eine Reihe, die niemand erwartet.
* **Abgerundet, nie zum nächsten Wert:** Wer auf die Linie „10:00" tippt, landet bei 10:00 und
  nicht bei 09:45. Menschen zielen auf die Linie, nicht zwischen zwei Linien.
* Gemessen wird gegen die **Tagesspalte** (`getBoundingClientRect`), nicht über
  `nativeEvent.offsetY`: Getroffen wird fast immer eine der Stundenlinien, und deren offsetY
  wäre höchstens eine Stunde groß – ein Fehler, der in der obersten Stunde nicht auffällt.
* Bestehende Terminblöcke rufen `stopPropagation`, sonst öffnete ein Klick auf einen Termin
  zusätzlich das Fenster „Neuer Auftrag".
* Die Leiste **„ohne Uhrzeit"** steht seit diesem Umbau immer da, auch wenn sie leer ist: Sie
  ist jetzt auch eine Fläche zum Anlegen (Tag ja, Uhrzeit nein), und eine Fläche, die nur
  erscheint, wenn schon etwas darin liegt, kann man nicht benutzen, um das erste hineinzulegen.
* Nach einer **Zwei-Finger-Zoomgeste** wird genau ein `click` geschluckt (`klickSchlucken` in
  `Stundenraster.tsx`). Ohne das legte ein Zoomvorgang am Handy einen Auftrag an.
* **Kunde noch nicht angelegt:** „Kunde ist noch nicht angelegt" führt in das Kundenformular;
  der Termin wartet solange in `terminFuerNeuenKunden` (app/page.tsx), das Ankreuzfeld „gleich
  einen Auftrag anlegen" ist dort von vornherein gesetzt und **nennt den Termin**. Verlässt man
  den Reiter, wird der gemerkte Termin verworfen – ein Kunde, der Wochen später angelegt wird,
  soll nicht die Uhrzeit von damals erben.
* Ein Techniker bekommt die Klickfläche nicht (`onSlot` bleibt undefiniert) – dieselbe Grenze
  wie beim „+ Auftrag"-Knopf im Aufträge-Reiter.

## 4. Termin und Zeitraum (Migration 37)

Ein Termin hat seit Migration 37 **von und bis** statt einer Uhrzeit mit angenommener Dauer:
`orders.time`/`orders.end_time`, beide `text` im Format `HH:MM` (aus demselben Grund wie
`time` seit Migration 07 – Textvergleich funktioniert nur bei zweistelliger Stunde
zuverlässig). Die Datenbank erzwingt: `end_time` nur zusammen mit `time`, im Format `HH:MM`,
und `end_time > time` (Constraint `orders_end_time_sinnvoll`). Ein Index
`orders(order_date, time)` trägt die Tages-/Wochenabfragen der Einsatzplanung.

Beim Umstellen bekam der Bestand eine angenommene Dauer von 60 Minuten, und zu diesem Zeitpunkt
stand dieselbe Zahl auch als `STANDARD_DAUER_MIN` im Code. Das ist inzwischen nicht mehr so:
**`STANDARD_DAUER_MIN` in `lib/constants.ts` ist heute 30**, nicht 60. Grund ist Migration 38:
die tatsächlich geltende Dauer steht seither einstellbar in `betrieb.termin_intervall_min` und
wird beim Laden in den State `terminIntervall` von `app/page.tsx` geladen; `STANDARD_DAUER_MIN`
ist nur noch der Rückfallwert für den kurzen Moment, bevor diese Einstellung geladen ist, und
muss mit ihrer Werkseinstellung übereinstimmen. Dieselbe Zahl geht als `terminIntervallMin` an
`AuftragModal` und als `standardDauerMin` an `EinsatzplanungPanel`/`Stundenraster` – eine Zahl,
nicht drei.

Im Auftragsfenster schlägt das Ändern von „Von" automatisch ein „Bis" = Von + Intervall vor,
solange „Bis" nicht von Hand angefasst wurde (`endeVorgeschlagen`-Flag); eine manuelle Eingabe
beendet den Vorschlag. Ein Ende vor dem Anfang sperrt den Speichern-Knopf **im Browser** – der
einzige Fall im Auftragsfenster, in dem das so gemacht wird, weil der Browser diesen einen Fall
sicher erkennen kann (anders als die Rechnungsdaten-Vollständigkeit in Abschnitt 8c, die nur
die Datenbank vollständig kennt).

Seit dem 09.09.2026 ist die Uhrzeit beim **Speichern im Auftragsfenster** Pflicht – nicht in
der Datenbank erzwungen (ein Auftrag entsteht per Karten-Klick eine Sekunde lang ohne Uhrzeit,
eine NOT-NULL-Regel würde genau diesen Weg verbauen) und nicht für Techniker (die dürfen
ohnehin nur ihre Notiz schreiben).

## 5. Einsatzplanung: Monats-, Wochen- und Tagesansicht

Die Einsatzplanung hat seit Migration 37 (Block B) **drei** Ansichten, nicht nur die
Monatsübersicht, die in der vorigen Fassung dieses Dokuments beschrieben war:

- **Monat**: Kalendergrid Montag–Sonntag mit Kalenderwochen links (`startOfWeekMonday`,
  `addDays`, `toDateStr`, `isoWeekNumber`, jetzt in `lib/calendar.ts` statt lose in
  `app/page.tsx`). Jeder Tag zeigt farbige Punkte je eingesetztem Mitarbeiter
  (`EMP_COLORS`/`employeeColorFor`) plus einen grauen Punkt für noch nicht zugeordnete
  Aufträge. Die KW-Spalte ist anklickbar und öffnet die Wochenansicht auf diesem Montag. **Klick
  auf einen Tag zoomt in diesen Tag hinein** – die Tagesansicht (Stundenraster) öffnet sich
  (seit 24.09.2026; vorher erschien nur eine Tabelle darunter). Die Tabelle „Aufträge am …",
  gruppiert nach Mitarbeiter, steht in der Monatsansicht weiter für den ausgewählten Tag.
- **Woche** und **Tag**: ein Stundenraster (`Stundenraster.tsx`, Rechenlogik in
  `lib/calendar.ts`), dieselbe Komponente für beide – der Unterschied ist nur die Länge der
  Tage-Liste. Grundfenster 7–19 Uhr (`KALENDER_VON_STUNDE`/`KALENDER_BIS_STUNDE`), dehnt sich
  aus, sobald ein Termin darüber hinausgeht. **Farbe = Mitarbeiter** (erster zugeordneter,
  dieselbe Farbe wie im Monatskalender), **Form = Zustand** (▶ in Arbeit, ✓ erledigt, ✕
  storniert schraffiert/durchgestrichen, gestrichelte Unterkante = Ende nur geschätzt, weil
  `end_time` fehlt). Überlappende Termine bekommen per Gruppen-Algorithmus
  (`layoutSpalten`) eigene, gleich breite Spalten. Termine ohne Uhrzeit erscheinen in einer
  eigenen Leiste „ohne Uhrzeit" statt verloren zu gehen oder eine erfundene Zeit zu bekommen.
  Zoom per Strg+Mausrad, Zwei-Finger-Geste oder ±-Knöpfen zwischen 14 und 120 px je Stunde;
  beim Herauszoomen öffnet sich gleichzeitig das Zeitfenster gleitend gegen 0–24 Uhr.

**Termine ziehen** (seit 25.09.2026): Im Stundenraster (Woche und Tag) lässt sich ein offener
oder laufender Termin mit der Maus verschieben – auch auf einen anderen Tag der Woche – und an
der Unterkante länger oder kürzer ziehen. Am Handy: **lange drücken** (400 ms, kurzes Brummen),
dann ziehen; normales Wischen scrollt weiter, kurzes Tippen öffnet den Auftrag. Raster
15 Minuten, gerundet (`gezogenerTermin()` in `lib/calendar.ts`). Gespeichert wird sofort und
nur Tag/Beginn/Ende (`updateOrderTermin()`); unten erscheint 8 Sekunden lang ein Hinweis mit
**Rückgängig** und – falls der Mitarbeiter oder Transporter dann doppelt belegt ist – einer
Warnung (`terminUeberschneidungen()`, Hinweis statt Sperre wie im Auftragsfenster). Erledigte
und stornierte Termine bleiben fest. Wer ziehen darf, entscheidet `auftraege.auftrag · schreiben`
(auch Techniker, Migration 41). War das Ende nur angenommen, bleibt es beim reinen Verschieben
angenommen. Am Rand rollt die Seite (und in der Woche am Handy das Raster seitlich) mit. Die
Listener hängen nativ und einmalig am Raster, Bewegung/Loslassen beim Finger am berührten
Element – sonst bricht der Zug ab, sobald React den Block in einer anderen Tagesspalte neu baut.

**Bedienleiste bleibt stehen** (seit 24.09.2026, `.planung-leiste`): Monatsnavigation,
Mitarbeiter, Fahrzeuge und Monat/Woche/Tag kleben beim Scrollen oben; am Handy sind die
Chipreihen dafür einzeilig und seitlich wischbar. In der Wochenansicht am Handy bleibt beim
seitlichen Wischen die **Uhrzeitspalte links stehen** (`.rk-spalte-zeit` sticky).

Zwei Filterleisten gelten für Raster **und** die volle Liste darunter gleichermaßen:
Mitarbeiter (Chips) und, seit Migration 32, Firmenfahrzeuge (Chips je Kennzeichen plus „Nicht
eingeteilt", nur sichtbar wenn aktive Firmenfahrzeuge existieren). Die Liste unter dem
Kalender heißt seit dem 24.09.2026 **„Offene Aufträge"** und zeigt nur offene und in Arbeit
befindliche Aufträge – erledigte und stornierte stehen im Aufträge-Tab, im Raster bleiben sie
als ✓/✕ sichtbar. Sie ist unabhängig vom ausgewählten Tag, mit eigenen Status-/Mitarbeiter-/
Fahrzeug-/Kunden-Filtern und sortierbaren Spalten (Termin/Kunde/Status). Titel- und Notiz-Spalten sind
dort seit dem 18.09.2026 entfallen (Titel dupliziert meist „Termin – Kunde", die Notiz sprengt
eine Tabellenspalte); beides steht im Auftragsfenster.

Mitarbeiter-/Leistungs-Zuordnung bleibt Popover direkt in der Zeile (Büro); ein Techniker sieht
dort nur Text, keinen Bearbeiten-Knopf.

### Doppelbuchungen (Fahrplan D1, 23.09.2026)

Beim Einteilen im Auftragsfenster prüft `terminUeberschneidungen()` (`lib/ueberschneidung.ts`),
ob der gewählte Mitarbeiter oder Transporter zur selben Zeit schon an einem anderen Auftrag
hängt, und zeigt es bernsteinfarben direkt unter der Auswahl: „Max ist 10:00–11:00 schon bei
Auftrag 214 · Müller". Geprüft wird gegen den ENTWURF im Fenster – der Hinweis kommt beim
Anhaken, nicht erst nach dem Speichern.

- **Ein Hinweis, keine Sperre.** Zwei Aufträge beim selben Kunden, ein Zeitfenster „zwischen 10
  und 12", eine geschätzte Endzeit – es gibt gute Gründe für eine Überschneidung.
- Stornierte und gelöschte Aufträge zählen nicht, Aufträge ohne Uhrzeit auch nicht, und
  Berührung ist keine Überschneidung (10–11 und 11–12 passen hintereinander).
- Ohne Endzeit gilt das Terminraster (`betrieb.termin_intervall_min`), wie im Stundenraster –
  dann steht „Ende geschätzt" dabei.
- Geprüft wird gegen die **geladenen** Aufträge, also das Zeitfenster aus Abschnitt 6. Das
  reicht, weil offene Aufträge immer mitkommen. Techniker sehen den Hinweis nicht: Sie ändern
  die Einteilung nicht und sehen fremde Aufträge ohnehin nicht (RLS).

### Das Auftragsfenster beginnt bei jedem Auftrag von vorn (Fahrplan D6, 23.09.2026)

`app/page.tsx` gibt dem Auftragsfenster `key={offenerAuftrag.id}`. Wechselt ein anderer Auftrag
hinein – etwa aus einer angetippten Meldung heraus, während schon einer offen ist –, entsteht ein
neues Fenster mit frischem Entwurf. Bis dahin setzte ein Effekt sieben Felder von Hand zurück und
vergaß „Bis", „Rechnung benötigt", die Altreifen-Rückfrage, den Einlagerungsblock und die
Storno-/Wiedereröffnen-Blöcke. Das Neuladen nach dem Speichern trifft denselben Auftrag und damit
denselben Schlüssel; eine laufende Eingabe bleibt dabei stehen.

## 6. Das geladene Zeitfenster

Aufträge wachsen anders als der Kundenstamm unbegrenzt mit jedem Betriebsjahr. Deshalb lädt die
App kein Vollabbild, sondern ein Zeitfenster (`fetchOrders(fenster)` in `lib/api/orders.ts`),
umschaltbar über `FensterSchalter` in `app/page.tsx`, gemeinsam für den Aufträge-Tab und die
Einsatzplanung (ein State `auftragsFenster`):

| Auswahl | Was geladen wird |
|---|---|
| **Aktuell** (Standard) | erledigte und stornierte Aufträge der letzten 30 Tage – **plus alle offenen und begonnenen, egal wie alt** |
| **Dieses Jahr** | alles ab dem 1. Januar des laufenden Jahres, plus alle offenen und begonnenen |
| **Alle** | ohne Begrenzung |

Der wichtige Teil ist die Ausnahme, unverändert seit Einführung: **was noch offen oder in
Arbeit ist, kommt immer mit**, unabhängig vom Datum – ausgeblendet werden alte, bereits
abgeschlossene Aufträge. Umgesetzt über eine Supabase-`.or()`-Bedingung
(`order_date.gte.<Stichtag>,status.in.(offen,in_arbeit)`).

Bis zum 23.09.2026 lautete sie `status.neq.erledigt` – damit kamen auch ALLE alten stornierten
Aufträge bei jedem Laden mit, egal wie alt (Fahrplan D5). Ein Storno ist abgeschlossen wie ein
Abschluss; wer ältere sucht, schaltet auf „Dieses Jahr" oder „Alle".

Zwei Stellen bleiben bewusst vom Fenster ausgenommen: das **Kundendetail**
(`fetchOrdersFuerKunde`) zeigt die vollständige Auftragshistorie dieses einen Kunden ohne
Begrenzung, und die eingebetteten Mitarbeiter-/Leistungs-Zuordnungen (`order_employees`,
`order_articles`) kommen in derselben Abfrage wie die Aufträge selbst mit und können deshalb
nicht zum geladenen Fenster in Widerspruch geraten.

## 7. Kontakthistorie, Wiedervorlage, Kontakt beim Abschließen (Migration 47)

Seit dem 18.09.2026 gilt: **Ein abgeschlossener Auftrag ist selbst ein Kontakt.** Das ist neu
gegenüber beiden alten Dokumenten, die vor Migration 47 geschrieben wurden.

Ein Trigger (`kontakt_aus_abschluss()`, `AFTER UPDATE OF status ON orders`, `security definer`)
greift genau beim Übergang **nach** `erledigt` (nicht beim bloßen Ändern eines bereits
erledigten Auftrags) und setzt am zugehörigen Kunden:

- `status = 'kontaktiert'`, `kontakt_ergebnis = 'auftrag'`, `wiedervorlage_am = null` (eine
  offene Wiedervorlage gilt als erledigt – der Grund für den nächsten Anruf war dieser
  Auftrag),
- `last_contact` auf das größere aus altem Wert und Abschlussdatum (**nie zurück** – wird ein
  alter Auftrag nachträglich abgeschlossen, bleibt ein neueres `last_contact` stehen),
- und eine `contact_history`-Zeile („Auftrag ‹Nr.› abgeschlossen").

`security definer` ist nötig, weil ein Techniker seit Migration 42/45 kein Schreibrecht auf
`customers` hat – ein normaler `update` aus dem Browser würde bei ihm still an RLS scheitern
(0 Zeilen geändert, kein Fehler), obwohl genau er es ist, der beim Kunden in der Einfahrt
steht.

Ausdrücklich **nicht** ausgelöst: beim Anlegen eines Auftrags (sonst wäre ein Kunde drei Monate
„grün", auch wenn der Termin später storniert wird – dass ein Termin ansteht, leitet die
Oberfläche stattdessen live aus den offenen Aufträgen ab) und beim Wiedereröffnen (der Besuch
hat stattgefunden, das zurückzunehmen wäre Geschichtsfälschung).

Der Kontaktdialog selbst (Migration 23, unabhängig von Aufträgen, siehe `kunden-und-karte.md`)
bleibt bestehen und schreibt dieselben Kundenfelder direkt; sein Ergebnis „Auftrag vereinbart"
öffnet zusätzlich sofort ein neues Auftragsfenster, zählt aber – anders als vor dem
29.08.2026 – nicht mehr automatisch selbst als Kontakt, wenn dort nichts weiter passiert.

## 8. Was beim Abschließen geprüft wird

Fünf getrennte Prüfungen, in dieser Reihenfolge (Trigger auf `orders` feuern alphabetisch nach
Namen):

> **Ausnahme Laufkundschaft (Migration 53).** Trägt der Kunde das Kennzeichen
> `customers.laufkundschaft`, überspringt `pruefe_rechnungsdaten()` die Empfänger- und
> Fahrzeugprüfung vollständig. Grundlage ist § 33 UStDV: Eine Kleinbetragsrechnung bis 250 €
> brutto braucht weder Namen noch Anschrift des Empfängers. Der Haken „Rechnung benötigt"
> bleibt dabei ausdrücklich gesetzt – nur so wird die Umsatzsteuer gerechnet; ohne ihn behandelt
> `orderArticleTotals()` die Positionen als reines Netto, und die Steuer auf die Bareinnahme
> stünde nirgends. Die 250-Euro-Grenze prüft die Datenbank bewusst NICHT (eine Zahl im Code,
> die bei der nächsten Gesetzesänderung still falsch wird); das Auftragsfenster weist darauf hin.
>
> Dieselbe Ausnahme steht ein zweites Mal in `rechnungsdatenMaengel()` (lib/helpers.ts), weil die
> Oberfläche die Abhakliste vor dem Abschließen zeigt. **Wer eine der beiden Stellen ändert,
> muss beide ändern** – die Oberfläche darf die Datenbank nicht widerlegen, ersetzt sie aber
> auch nicht.

**(a) Der Übergang selbst** – `enforce_order_status_transition()` (Abschnitt 3): erlaubte
Statuswechsel, Pflichtgrund bei Storno und Wiedereröffnung, Admin/Superadmin-Pflicht bei
Wiedereröffnung, setzt/räumt Zeitstempel und Personen.

**(b) Die Positionen einfrieren** – ein Trigger auf `order_articles` (Migration 20) lehnt jedes
Anlegen, Ändern und Entfernen ab, solange der zugehörige Auftrag `erledigt` oder `storniert`
ist. Gilt seit Migration 41 unverändert auch für den Techniker am eigenen Auftrag. Eine
Ausnahme: ändert sich ausschließlich `deleted_at`, lässt der Trigger es durch – sonst ließe
sich ein bereits abgeschlossener Auftrag nie mehr löschen (Soft-Delete, Migration 19).

**(c) Vollständige Rechnungsdaten** – `pruefe_rechnungsdaten()` (Migration 44), läuft **nach**
dem Statuswechsel-Trigger (Funktionsname beginnt mit `trg_p`, extra so gewählt, damit er nach
`trg_enforce_…` läuft). Greift nur, wenn `rechnung_noetig = true` **und** der Übergang nach
`erledigt` führt. Verlangt: Kundenname, -anschrift, -E-Mail, mindestens ein Fahrzeug in
`auftrag_fahrzeuge`, und an jedem davon ein Kennzeichen (am verknüpften `vehicles`-Datensatz)
sowie einen Kilometerstand. Die Fehlermeldung nennt **alle** fehlenden Punkte auf einmal, nicht
nur den ersten. Beim Stornieren wird nichts verlangt. Im Auftragsfenster spiegelt
`RechnungsdatenBlock.tsx`/`rechnungsdatenMaengel()` (`lib/helpers.ts`) dieselbe Regel als
Abhakliste – sie sperrt nichts, die Datenbank ist die durchsetzende Instanz.

**(d) Einlagerung/Altreifen – KEIN Zwang mehr.** Die frühere Fassung dieses Dokuments
beschrieb hier noch eine Pflicht aus Migration 22: enthält der Auftrag eine Leistung mit
`articles.braucht_lagerplatz`, müsse beim Abschließen ein Lagerplatz belegt sein, durchgesetzt
in `enforce_order_status_transition()`. **Das stimmt seit Migration 46 (17.09.2026) nicht
mehr** – der Zwang wurde beim Neuschreiben der Funktion ersatzlos entfernt. Grund: die
Lagergebühr wird seit Migration 46 beim **Auslagern** fällig, nicht beim Einlagern, und der
Gebührenartikel steht seither auf dem Auslagerungs-Auftrag – dort wird gerade ein Platz frei,
nicht belegt, und der alte Zwang hätte dort das Gegenteil von dem verlangt, was passiert. An
seine Stelle tritt im Auftragsfenster eine reine **Rückfrage** („Auf diesem Auftrag steht eine
Leistung, bei der alte Reifen anfallen … Nimmt der Kunde die alten Reifen mit?"), gesteuert
über `articles.fragt_einlagerung`, höchstens einmal gestellt und ohne den Abschluss zu
blockieren.

Bestehen bleibt eine andere, im Auftragsfenster clientseitig geprüfte Vorschau (Migration 30,
nicht Teil von Migration 22): jede an diesem Auftrag hängende Einlagerung sollte Fahrzeug und
Saison tragen; fehlt eines, steht „Fehlt noch: Fahrzeug/Saison" am Abschließen-Knopf – der
bleibt aber anklickbar, weil diese eine Zeile keine vollständige Kenntnis der
Datenbank-Bedingungen behauptet.

**(e) Die Rechnung selbst (Migration 48/49).** Seit dem 18.09.2026 stellt PinPoints die
Rechnung selbst aus, statt nur einen Haken „im ERP erstellt" zu führen (Migration 40 – die
Funktion `setzeRechnungErstellt()` in `lib/api/orders.ts` wurde genau an diesem Tag entfernt).
Legt jemand eine Zeile in `rechnungen` zu diesem Auftrag an, setzt ein Trigger
(`rechnung_am_auftrag`) automatisch `orders.rechnung_erstellt_am` und `rechnung_nummer`. Dieser
Haken lässt sich seither **nicht mehr von Hand zurücknehmen** (`stempel_rechnung()` lehnt das
ab) – nur eine Stornorechnung nimmt ihn zurück, und die hebt gleichzeitig die ursprüngliche
Rechnung auf. „Rechnung offen" ist dabei keine fünfte Status-Ausprägung, sondern eine eigene
Arbeitsliste (`rechnungOffen()` in `lib/helpers.ts`: `rechnung_noetig` gesetzt,
`rechnung_erstellt_am` leer, Status `erledigt`), mit eigenem Zähler-Chip im Aufträge-Tab.

## 9. Fahrzeuge am Auftrag (Migration 44/51)

`auftrag_fahrzeuge` (`id`, `order_id`, `vehicle_id`, `kilometerstand`, `created/updated_at/by`,
`unique(order_id, vehicle_id)`, Kilometerstand `0..10 000 000` oder `null`) ist seit Migration 51
die **einzige** Quelle dafür, welche Fahrzeuge ein Auftrag betrifft und mit welchem
Kilometerstand. Der Kilometerstand steht an dieser Verbindungstabelle und nicht am Fahrzeug,
weil er eine Messung an einem Tag ist, keine Eigenschaft des Autos – dieselbe Lehre wie
DOT-Datum und Profiltiefe am Reifensatz statt am Fahrzeug (Migration 34). `null` heißt „noch
nicht abgelesen" und ist etwas anderes als `0` (ein fabrikneuer Wagen hat 0 km). Rechte folgen
dem Auftrag, kein eigener Berechtigungsbereich: wer den Auftrag lesen/schreiben darf, darf auch
hier lesen/schreiben, ein Techniker weiterhin nur an eigenen Aufträgen (`is_own_order()`).

Im Auftragsfenster gibt es dafür genau einen Block, **„Fahrzeug"** (`FahrzeugeBlock.tsx`), und
er ist **immer sichtbar** – nicht mehr, anders als bis zum 21.09.2026, nur hinter dem Haken
„Rechnung benötigt" versteckt. Welches Auto bearbeitet wird, ist keine Frage der Abrechnung. Der
Block trägt beliebig viele Fahrzeuge je Auftrag mit je eigenem Kilometerstand – etwa wenn zwei
Autos desselben Kunden am selben Termin bereift werden –, bietet die übrigen Fahrzeuge des
Kunden zur Auswahl an und legt ein neu eingetipptes Kennzeichen als Fahrzeug beim Kunden an.
`RechnungsdatenBlock.tsx` zeigt die Fahrzeuge seither nur noch **zum Prüfen**, als zwei
Abhakzeilen „Fahrzeug" und „Kilometerstand" – geändert werden sie ausschließlich oben im Block
„Fahrzeug".

Die Spalte `orders.vehicle_id` (Migration 20), die vorher genau ein Fahrzeug je Auftrag trug,
ist mit Migration 51 entfernt. Vor dem `DROP COLUMN` hat die Migration Nachzügler übernommen:
alles, was zwischen dem 17. und dem 21.09.2026 noch über den seinerzeit weiterhin vorhandenen
alten Auswahlkasten eingetragen und noch nicht in `auftrag_fahrzeuge` gelandet war, kam vorher
in die Tabelle (siehe Abschnitt 10 zum Hergang). Beim ursprünglichen Anlegen von
`auftrag_fahrzeuge` durch Migration 44 war der damalige Bestand von `orders.vehicle_id` bereits
einmal so übernommen worden – ohne Kilometerstand, den gab es vorher nicht.

API: `lib/api/auftragFahrzeuge.ts` – `fetchAuftragFahrzeuge()` (blockweise in 200er-Paketen,
wie bei den Auswertungen), `addAuftragFahrzeug()`, `setKilometerstand()`,
`removeAuftragFahrzeug()` (echtes `DELETE`, kein Soft-Delete – anders als `orders` und
`order_articles`). `lib/api/orders.ts` kennt seither weder `updateOrderVehicle()` noch ein
`vehicleId`-Feld in `insertOrder()`/`updateOrderById()`.

Zwei weitere Stellen lasen bis zum 21.09.2026 `orders.vehicle_id` statt `auftrag_fahrzeuge` und
sind auf die neue, einzige Quelle umgestellt: der Vorgeschichte-Hinweis im Auftragsfenster
(`letzterSatzFuer()` in `lib/helpers.ts` nimmt seither eine **Liste** von Fahrzeug-Kennungen statt
eines einzelnen Feldes) und die Auswertung (`lib/auswertung.ts`/`lib/api/auswertung.ts`) – dort
wird die Menge bei mehreren Fahrzeugen an einem Auftrag gleichmäßig geteilt, während der Auftrag
selbst bei jedem beteiligten Fahrzeug voll zählt.

## 10. Fallstricke

- **Techniker-Spaltenschutz ist jetzt eine Negativliste** (Migration 41): eine neue Spalte an
  `orders` ist für die Techniker-Rolle automatisch änderbar, sofern sie nicht ausdrücklich in
  `restrict_techniker_order_update()`s `gesperrt`-Array steht. Wer eine sicherheitsrelevante
  Spalte ergänzt, muss aktiv daran denken – das Gegenteil des Verhaltens vor Migration 41.
- **Jedes im Auftragsfenster änderbare Feld muss in der `geaendert`-Prüfung von
  `AuftragModal.tsx` stehen**, sonst erscheint kein Speichern-Knopf und die Eingabe geht ohne
  jede Fehlermeldung verloren. Genau das ist am 16.09.2026 mit „Bis" und „Rechnung benötigt"
  passiert, als beide Felder dazukamen.
- **Trigger auf `orders` feuern alphabetisch nach Namen** – deshalb heißt der
  Rechnungsdaten-Check `trg_pruefe_rechnungsdaten` (mit „p", läuft nach `trg_enforce_…`), und
  der Freeze-Trigger auf `order_articles` läuft vor `trg_stamp_row`. Ein Umbenennen kann diese
  Reihenfolge unbeabsichtigt verschieben.
- **Soft-Delete durchbricht den Freeze absichtlich, aber nur ausschließlich**: der
  Einfrier-Trigger auf `order_articles` lässt eine Änderung durch, wenn sich **nur**
  `deleted_at` ändert – sonst ließe sich ein abgeschlossener Auftrag nie mehr löschen.
- **Bis zum 21.09.2026 gab es zwei Eingabestellen für dasselbe Fahrzeug** (Abschnitt 9): oben
  im Auftragsfenster ein immer sichtbarer Auswahlkasten, der `orders.vehicle_id` schrieb, und
  weiter unten – nur sichtbar hinter dem Haken „Rechnung benötigt" – die Liste, die
  `auftrag_fahrzeuge` schrieb. Migration 44 hatte bereits angekündigt, dass nur noch die neue
  Tabelle beschrieben werden soll; der alte Kasten blieb aber liegen. Beide Stellen wurden
  weiter gepflegt, ohne sich gegenseitig abzugleichen: Die Rechnung und die
  Vollständigkeitsprüfung lasen ausschließlich `auftrag_fahrzeuge`, der Vorgeschichte-Hinweis
  ausschließlich `orders.vehicle_id`. Bei einem Kunden mit zwei Autos konnten beide damit
  verschiedene Wagen meinen, und ein nur oben (hinter keinem Haken, aber eben nur dort)
  gesetztes Fahrzeug erschien auf keiner Rechnung. Die Lehre daraus, allgemein: Zwei Stellen,
  die dasselbe beantworten sollen, gleichen sich nicht von selbst ab – erst recht nicht, wenn
  eine davon hinter einem Haken versteckt ist und dadurch seltener auffällt. Migration 51 hat
  `orders.vehicle_id` entfernt; es gibt jetzt nur noch `auftrag_fahrzeuge`.
- **`STANDARD_DAUER_MIN`** ist nur der Rückfallwert vor dem Laden von
  `betrieb.termin_intervall_min` und muss mit dessen Werkseinstellung übereinstimmen, sonst
  weicht die Anzeige kurz nach dem Laden sichtbar ab.
- **`orderDateTime()`/`isOrderPast()`** nehmen bei fehlender Uhrzeit `23:59` an – ein Auftrag
  ohne Uhrzeit gilt also praktisch den ganzen Tag über noch nicht als „vergangen".
- **Rechnungsnummer und -datum lassen sich seit Migration 49 nicht mehr per Haken
  zurücknehmen** (nur per Stornorechnung) – eine Maske, die das anders anbietet, ist veraltet.
