# Kunden und Karte

- **Kunden-Tab**: reine Liste/Suche/Filter (ohne Kennzahlen, die stehen im Dashboard),
  Karte, Status (offen/kontaktiert), Umkreis-/PLZ-Filter, A–Z-Buchstabenfilter.
- **Kundendetails** (`DetailModal`): Kontaktdaten, Fahrzeuge (mehrere pro Kunde, mit
  Kennzeichen, Marke/Modell, montierter Reifengröße, DOT-Datum, Profiltiefe, optionaler
  Verknüpfung zu einem im Lager eingelagerten Reifensatz), Kontakt erfassen, **Aufträge &
  Termine** dieses Kunden (siehe `auftraege-termine-einsatzplanung.md`), Kontakt-Historie.
- **Kundenliste**: alle Kunden werden einmal geladen und im Browser gefiltert – dadurch
  reagieren Suche, Buchstaben- und PLZ-Filter ohne Verzögerung. **Gezeichnet** werden jeweils
  200 Zeilen (`LISTEN_SCHRITT` in `app/page.tsx`), weitere per Knopf am Listenende; gefiltert
  und gezählt wird immer über den gesamten Bestand. Bei ~4500 Kunden alle Zeilen gleichzeitig
  ins Dokument zu stellen, hätte Scrollen und Tippen spürbar verzögert.
- **Karte**: Leaflet, Marker rot/grün je nach `effectiveColor()` (offen/kontaktiert +
  Wiedervorlage-Zeitraum aus den Settings). Gezeichnet werden nur Marker im sichtbaren
  Ausschnitt (plus Rand), höchstens `MAX_MARKER` gleichzeitig – liegen mehr Kunden im
  Ausschnitt, erscheint ein Hinweis auf der Karte statt stillschweigend etwas wegzulassen. Kartenstil-Schalter direkt auf der Karte
  (Google-Maps-artig, `MAP_STYLES` in `lib/mapStyles.ts`), Settings enthalten die
  Kartenstil-Auswahl bewusst nicht mehr doppelt.
- **Karten-Popup** (Marker anklicken): Kundendaten, Telefonnummern, nächster Termin – und
  darunter **zwei getrennte Handlungen**: „+ Auftrag anlegen" und „✔ Kontakt bestätigen". Bis
  zum 29.08.2026 war das eine einzige Schaltfläche mit einem Ankreuzfeld „Termin dabei
  vereinbart"; das legte im Hintergrund einen Auftrag ohne Fahrzeug, Mitarbeiter und Leistungen
  an und setzte gleichzeitig immer die Wiedervorlage-Uhr zurück, auch wenn kein Gespräch
  stattgefunden hatte. Warum das getrennt gehört: `termine-kontakt-auftrag-analyse.md`.
  „Auftrag anlegen" öffnet dieselbe Maske wie überall sonst, als Overlay über der Karte – der
  Reiter wechselt nicht, Kartenausschnitt und Zoom bleiben stehen. Das Feld „Kontaktiert am"
  ist mit **heute** vorbelegt (vorher mit dem letzten Kontakt, was Anrufe rückdatierte).
- **Geocoding**: `geocodeAddress()` in `lib/helpers.ts` ruft die eigene Serverroute
  `app/api/geocode/route.ts` auf, die ihrerseits Nominatim/OpenStreetMap befragt. Vorher ging
  die Anfrage direkt aus dem Browser jedes Nutzers hinaus – mit der vollständigen Kundenadresse
  an einen Dritten, ohne identifizierenden User-Agent und ohne die von Nominatim verlangte
  Drosselung auf eine Anfrage pro Sekunde (`architektur-review-2026-08.md`, Befund A9). In der
  Route sitzen jetzt Zugriffsschutz, Drosselung, User-Agent und ein Cache (`geocode_cache`,
  Migration 17), der jede Adresse nur einmal nach draußen gehen lässt – auch Nicht-Treffer.
  Adressen ohne erkennbaren Stadtnamen bekommen `DEFAULT_GEOCODE_REGION` angehängt; der
  Vergleich läuft umlautunabhängig und leitet den Stadtnamen aus der Konstante ab, statt ihn
  ein zweites Mal hinzuschreiben.
- **Navigations-Button** (`IconNavPin`, farbiger Standort-Pin statt Linien-SVG – vorher ein
  Kompass-Emoji, siehe `design-system.md`) in Auftrags-/Terminzeilen, wenn eine Adresse
  gepflegt ist: öffnet ein kleines Menü ("Google Maps"/"Apple Karten"), `navigationUrls()` in
  `lib/helpers.ts` baut die App-spezifischen Deeplinks (bevorzugt Koordinaten, sonst
  Adresstext).

---

## Was aus einem Kontakt wird (Migration 23)

Bis hierher hielt „Kontaktiert speichern" nur fest, **dass** telefoniert wurde. Ein Kunde mit
erteiltem Auftrag, ein Kunde, der im Frühjahr noch einmal angerufen werden will, und ein Kunde,
der abgesagt hat, sahen danach alle gleich aus: grün auf der Karte. Beim nächsten Blick wusste
niemand mehr, welcher welcher war.

Der grüne Knopf öffnet jetzt einen Dialog (`KontaktModal`) mit **drei Ausgängen** – den drei,
die ein Anruf im Alltag tatsächlich hat:

| Ausgang | Was passiert | Karte |
|---|---|---|
| **Auftrag anlegen** | Kontakt wird festgehalten, danach öffnet sich das Auftragsfenster | grün (kontaktiert) |
| **Wiedervorlage** | mit Datum, vorbelegt mit dem eingestellten Zeitraum ab heute | **orange**, ab dem Stichtag wieder rot |
| **Kein Interesse** | Kunde bleibt aktiv, wird aber sichtbar aussortiert | **weißer Punkt mit rotem Kreuz** |

Alle drei schreiben denselben Eintrag in die Kontakt-Historie; sie unterscheiden sich nur in
dem, was danach passiert. Das Kontaktdatum steht im Dialog und ist mit **heute** vorbelegt.

**Ein Dialog für beide Wege.** Er wird aus dem Karten-Popup wie aus dem Kundenfenster geöffnet
und liegt deshalb auf oberster Ebene in `app/page.tsx`, nicht in einem der beiden. Die
Kontaktmaske gab es hier schon einmal doppelt – einmal als Zeichenkette im Popup, einmal als
React-Komponente – und sie ist dabei auseinandergelaufen
(`termine-kontakt-auftrag-analyse.md`, Abschnitt 2.6).

### Warum die Wiedervorlage von selbst wieder auftaucht

`effectiveColor()` prüft in dieser Reihenfolge:

1. **Kein Interesse schlägt alles.** Wer abgesagt hat, gehört nicht auf die Anrufliste, egal wie
   lange der letzte Kontakt her ist.
2. **Wiedervorlage in der Zukunft → orange.** Eingeplant, aber noch nicht dran.
3. **Wiedervorlage erreicht oder überschritten → rot.** Genau das ist der Sinn einer
   Wiedervorlage: sie landet am Stichtag von selbst wieder auf der Liste. Bliebe sie dauerhaft
   orange, hübe sich ein fälliger Kunde nicht mehr von einem eingeplanten ab, und die Farbe
   verlöre ihre Aussage.
4. Sonst wie bisher der Wiedervorlage-Zeitraum aus den Einstellungen.

Die Stichtagsgrenze ist in `tests/kundenzustand.test.ts` festgehalten – auch der Fall „am
Stichtag selbst", wo ein `>` statt `>=` einen Tag zu spät auslösen würde.

### Warum „kein Interesse" NICHT automatisch deaktiviert

Das sind zwei verschiedene Aussagen:

- **Inaktiv** heißt: taucht in keiner Arbeitsliste mehr auf – weggezogen, Betrieb geschlossen,
  Dublette.
- **Kein Interesse** heißt: hat *dieses Mal* nein gesagt.

Bei Reifen ist das zweite meist ein saisonales Nein („hab die Winterreifen schon drauf").
Automatisch zu deaktivieren würde genau die Kunden aus dem Blick nehmen, die man in der
nächsten Saison anrufen will. Und Deaktivieren hat Folgen – der Kunde verschwindet aus Karte und
Liste; das als Nebenwirkung eines Anrufergebnisses passieren zu lassen, wäre eine irreversible
Aktion ohne bewusste Entscheidung.

Deshalb: der Kunde bleibt aktiv und bekommt ein Kreuz auf der Karte. Im Popup erscheint dann
zusätzlich ein Knopf **„Kunde deaktivieren"** – ein Klick, aber ein eigener.

### Warum das Kreuz keine vierte Farbe ist

Rot und Orange nebeneinander sind für einen Teil der Bevölkerung kaum zu unterscheiden, und auf
einer bunten Karte gehen Farbnuancen ohnehin unter. „Kein Interesse" ist deshalb eine andere
**Form**: ein weißer Punkt mit rotem Rand und Kreuz statt eines Tropfens. Die Form trägt die
Aussage, die Farbe bestätigt sie nur.

Die Markerfarben stehen als `MARKER_FARBE` in `app/page.tsx` und nicht als CSS-Variable: der
Marker entsteht als HTML-Zeichenkette in einem Leaflet-`divIcon`, dort greift kein Stylesheet
der App. Die Werte entsprechen den Tokens aus `globals.css` – wer sie dort ändert, ändert sie
hier mit.

Die Kundenliste hat passend dazu zwei neue Filter: **Wiedervorlage** und **Kein Interesse**.

---

## Firma, Ansprechpartner, E-Mail, Anrede (Migration 24)

Vier Felder am Kunden, alle optional:

| Feld | Bedeutung |
|---|---|
| `company` | Firmenname. Leer bei Privatpersonen. |
| `name` | Anzeigename – bei Firmen der **Ansprechpartner**. |
| `email` | gab es bis dahin überhaupt nicht. |
| `anrede` | „Herr" / „Frau", getrennt vom Namen. |

Anlass war der Import der Altkundenliste: dort stand „Firma Degen" im Namensfeld und „Sven
Heidenreich" in der E-Mail-Spalte. Gemeint war eine Firma mit Ansprechpartner – ein Fall, für
den es kein Feld gab, weshalb die Angabe in irgendeine freie Spalte gerutscht ist. Wo Felder
fehlen, erfinden Menschen welche.

In Liste und Karten-Popup ist bei Firmenkunden der **Firmenname** die Überschrift und der
Ansprechpartner steht darunter; bei Privatpersonen bleibt alles wie bisher. Die Suche greift
zusätzlich auf Firma und E-Mail zu – sonst fände man einen Geschäftskunden nur über den Namen
des Ansprechpartners, den im Alltag niemand parat hat.

**Warum die Anrede ein eigenes Feld ist:** in der Altliste stand sie bei 30 Kunden im
Namensfeld („Frau Graf"). Das verfälscht die alphabetische Sortierung – die Kundin landet unter
F statt unter G – und spätestens bei den Rechnungen aus Roadmap-Phase 5 braucht ein Anschreiben
die Anrede getrennt vom Namen.

**Warum keine eigene Firmen-Tabelle:** sie wäre die sauberere Modellierung, sobald mehrere
Ansprechpartner je Firma vorkommen. Das ist hier nicht der Fall (vier Firmen, je einer), und
eine Tabelle mit vier Zeilen plus einer Verknüpfung in jeder Abfrage kostet mehr, als sie
einbringt. Der Weg dorthin bleibt offen: `company` wird dann zum Fremdschlüssel.

## Sammellauf Geokodierung (Admin → Wartung)

Über SQL angelegte Kunden haben keine Koordinaten – die Geokodierung passiert im Browser, nicht
in der Datenbank. Nach dem Import lägen sonst alle 422 Kunden dauerhaft unter „Ohne Karte", und
der einzige Weg wäre, jeden einzeln zu öffnen und die Adresse erneut zu speichern.

Der Lauf (`components/admin/GeokodierLauf.tsx`) nimmt bewusst **denselben Weg wie jede andere
Adresse in dieser App**: die eigene Serverroute `/api/geocode` mit Drosselung auf eine Anfrage
pro Sekunde, erkennbarem User-Agent und Cache (Migration 17). Eine schnellere Abkürzung daran
vorbei hätte genau die Schutzmaßnahmen umgangen, für die die Route gebaut wurde – Nominatim
verlangt die Drosselung, und über die Route geht jede Adresse nur einmal nach draußen.

Eine Adresse pro Sekunde heißt gut sieben Minuten für 422 Kunden. Deshalb läuft es sichtbar,
mit Fortschritt und Abbruch, statt hinter einem stummen Wartekreis. Abbrechen verliert nichts:
ein erneuter Start nimmt sich die verbliebenen vor. Adressen ohne Treffer bleiben unter „Ohne
Karte" stehen – das ist kein Fehler, sondern der Hinweis, dass die Adresse unvollständig ist.

---

## Adressvorschläge (Migration 25)

Beim Import der Altkundenliste ließen sich rund 130 von 422 Adressen nicht verorten. Die
Ursachen sind harmlos und trotzdem unauffindbar: „Rehhostraße" statt „Rehhofstraße",
„Balthaser-Neumann" statt „Balthasar-Neumann", eine fehlende Hausnummer. Jede einzeln zu öffnen
und daneben eine Karte aufzumachen ist ein Abend Arbeit.

### Zwei Dienste, zwei Aufgaben

| Dienst | Wofür | Route |
|---|---|---|
| **Nominatim** (OSM) | „welche Koordinate hat GENAU diese Adresse" | `/api/geocode` |
| **Photon** (komoot) | „welche Adressen könnten gemeint sein" | `/api/adresse-suchen` |

Warum nicht Nominatim für beides:

1. **Die Nutzungsbedingungen von Nominatim untersagen Autovervollständigung ausdrücklich.**
   Jeder Tastendruck eine Anfrage ist genau die Last, gegen die sie sich wehren.
2. **Nominatim ist nicht tippfehlertolerant.** „Rehhostraße" liefert nichts.

Photon ist von komoot genau dafür gebaut – Elasticsearch über denselben OpenStreetMap-Daten,
kostenlos, fehlertolerant. Es ist damit **ein weiterer Dritter**, an den Adressbruchstücke
gehen; datenschutzrechtlich gehört es in dieselbe Betrachtung wie Nominatim.

Die Route schützt dasselbe wie die Geocode-Route: nur angemeldete Nutzer, Mindest- und
Höchstlänge, Drosselung, Zwischenspeicher (`adressvorschlag_cache`, Migration 25), keine
Weitergabe von Cookies oder Kundendaten – nur die Sucheingabe. Die Suche ist auf den
Kartenmittelpunkt gewichtet, damit bei „Hauptstraße" die Nürnberger zuerst kommt.

### Beim Tippen

`components/AdressFeld.tsx`, eingebaut im Kundenfenster und in „Neuer Kunde". Das Feld bleibt
ein **ganz normales Textfeld**: wer die Adresse kennt, tippt sie und drückt weiter. Die
Vorschläge sind ein Angebot, keine Pflicht – es gibt Neubaugebiete, und es gibt Kunden auf
Höfen ohne Straßennamen. Eine Adresse, die der Kartendienst nicht kennt, muss eintragbar
bleiben.

Wird ein Vorschlag angenommen, **kommt die Koordinate gleich mit**. Das erspart die zweite
Abfrage beim Speichern und – wichtiger – Adresstext und Kartenposition können nicht
auseinanderlaufen.

350 ms Tipppause vor der Abfrage, mindestens drei Zeichen. Fällt der Dienst aus, bleibt das
Feld stumm ein Textfeld: eine Fehlermeldung beim Tippen wäre lästiger als keine Vorschläge.

### Admin → Wartung → Adressen prüfen

Listet alle Kunden ohne Kartenposition mit ihrem besten Vorschlag und zwei Alternativen.
Übernehmen ist ein Klick und schreibt Adresse und Koordinate **in einem Vorgang** – getrennt zu
speichern hieße, für einen Moment eine neue Adresse mit der alten Position zu haben.

**Die App ändert nichts von selbst.** Auch wenn ein Vorschlag offensichtlich richtig aussieht,
bleibt die Übernahme ein Klick: eine stillschweigend geänderte Kundenadresse fällt niemandem
auf, und auf einem Lieferschein steht sie dann falsch, ohne dass jemand es entschieden hat.

Die Reihenfolge unter „Wartung" ist die Arbeitsreihenfolge: erst der Sammellauf, der alles
verortet, was ohne Zutun geht – danach die Korrekturliste für den Rest. Andersherum arbeitete
man Adressen von Hand durch, die der Sammellauf eine Minute später ohnehin gefunden hätte.

## „Neuer Kunde" und Kundenfenster haben dieselben Felder (04.09.2026)

Bis dahin fehlten im Formular „Neuer Kunde" die Felder **Firma, Anrede und E-Mail**, die es im
Kundenfenster seit Migration 24 gibt. Ein Geschäftskunde, den man dort anlegte, musste
anschließend erneut geöffnet werden, um einzutragen, was beim Anlegen längst bekannt war.

Beide Masken führen jetzt dieselben Felder in derselben Reihenfolge: Firma, Anrede, Name,
Adresse, Mobil, Festnetz, E-Mail, Notiz. Die Adresse ist an beiden Stellen das Feld mit
Vorschlägen; wird einer angenommen, wird die Koordinate direkt mitgeschrieben statt sie beim
Speichern noch einmal nachzuschlagen.

Der frühere Block „Gleich einen Auftrag anlegen" im Kundenformular ist einem Ankreuzfeld
gewichen: ist es gesetzt, öffnet sich nach dem Anlegen das vollständige Auftragsfenster – siehe
`auftragsablauf.md`, Nachtrag vom 04.09.2026.

## Trefferzahl an den Filtern (04.09.2026)

Jeder Filterknopf über der Kundenliste trägt seine Trefferzahl – an **jedem**, nicht nur am
aktiven. So sieht man, was ein Klick bringen würde, bevor man klickt, und dass unter „Ohne
Karte" noch 130 Kunden liegen, ohne erst dorthin zu wechseln.

Gerechnet wird auf `vorgefiltert`: alles, was Suche, Buchstabe und Postleitzahl übrig lassen,
aber **ohne** den Zustandsfilter selbst. Rechnete man ihn mit, stünde am aktiven Knopf seine
eigene Trefferzahl und an allen anderen eine Null. Alle sechs Zahlen entstehen in einem
einzigen Durchlauf – bei 4500 Kunden ist das der Unterschied zwischen einmal und sechsmal
Rechnen bei jedem Tastendruck im Suchfeld.

Die Knöpfe selbst kommen aus `KUNDEN_FILTER` in `lib/constants.ts`. Vorher standen sie als
sechs fast gleiche Zeilen im JSX; wer einen Zustand ergänzt, hätte ihn an drei Stellen
nachtragen müssen – Knopf, Filterbedingung und Zählung.

## Karten-Popup: ein Zuhörer statt Handler je Schaltfläche (05.09.2026)

Die Schaltflächen im Karten-Popup (`+ Auftrag anlegen`, `Kontakt bestätigen`, `Auf offen
setzen`, `Kunde deaktivieren`, `Kundendaten & Aufträge bearbeiten`, Telefon-Symbol) tragen
`data-popup-aktion` und `data-kunde`. Ein einziger, einmal angemeldeter Klick-Zuhörer am
Dokument wertet das aus; die Handlung selbst steht in `popupAktionRef`, das bei jedem Rendern
neu gesetzt wird – wie `liveRef`, damit nichts mit veralteten Zuständen arbeitet.

Grund: am Handy war im Popup nichts anklickbar. Die ausführliche Fehlerbeschreibung steht in
`docs/design-system.md`, Abschnitt „Drei Handy-Fehler mit einer gemeinsamen Wurzel".

Wer eine Schaltfläche ergänzt, gibt ihr die beiden `data`-Attribute und einen `case` in
`popupAktionRef.current` – kein `getElementById`, kein `onclick` am Element.

## Zustandsfilter auf der Karte (05.09.2026)

Oben rechts auf der Karte sitzt ein Schalter „Nadeln", der die vier Zustände einzeln ein- und
ausblendet, jeweils mit der Zahl der betroffenen Kunden. Anlass war das Handy: dort ist die
Karte bildschirmfüllend, die Kundenliste mit ihren Filter-Chips ist währenddessen nicht zu
sehen, und zwischen mehreren hundert grünen Nadeln findet man die roten nicht.

Bewusste Entscheidungen:

* **Sitzungszustand, keine Einstellung.** Nach einem Neuladen sind wieder alle Zustände
  sichtbar. Ein Filter, den man vor drei Tagen gesetzt und vergessen hat, darf keine Kunden
  dauerhaft verstecken.
* **Auch am Desktop sichtbar**, obwohl der Bedarf mobil entstanden ist. Sonst gäbe es eine
  Auswahl, die man am Handy trifft und am Rechner nicht mehr findet – die Nadeln wären dort
  ohne auffindbaren Grund weg.
* **Ein Zähler am Schalter**, wenn etwas ausgeblendet ist, und darunter „Alle einblenden".
  Beides beantwortet die Frage „warum fehlt hier eine Nadel?", bevor sie entsteht.
* **Ausgeblendete Zeilen bleiben blass sichtbar** statt zu verschwinden: man sieht, was man
  gerade nicht sieht.
* **Getrennt vom Filter der Kundenliste.** Die Chips über der Liste steuern weiterhin nur die
  Liste. Der Preis dafür sind zwei Filter, die sich nicht kennen – abgefedert durch den Zähler
  oben. Die Alternative (ein gemeinsamer Mehrfachfilter für Liste und Karte) wurde erwogen und
  verworfen, weil sie das Verhalten der Chips am Desktop geändert hätte.

Technisch: `sichtbareZustaende` liegt in `liveRef`, weil `syncMarkers()` aus Leaflet-Ereignissen
heraus läuft und dort keine React-Zustände sieht. Ausgeblendete Zustände fallen VOR der
Marker-Obergrenze (`MAX_MARKER`) heraus – sonst verbrauchten unsichtbare Nadeln das Kontingent
und der Hinweis „weitere Kunden in diesem Ausschnitt" zählte Kunden mit, die man gar nicht
sehen will. Das Bedienelement steht als Geschwister von `#map` und nicht darin, weil Leaflet
Zieh-Gesten am Kartencontainer abgreift und ein Kind darin beim Wischen die Karte mitziehen
würde.
