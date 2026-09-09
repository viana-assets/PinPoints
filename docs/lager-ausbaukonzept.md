# Lager und Bestand – Ausbaukonzept

Stand 07.09.2026. Vorschläge, nichts davon ist gebaut. Zweck: eine Entscheidungsgrundlage,
was das Lager-Modul werden soll – und in welcher Reihenfolge.

## Zuerst: drei Lücken im heutigen Modell

Das Lager funktioniert, aber es beschreibt weniger, als der Betrieb wissen muss. Drei Punkte
werden früher oder später weh tun, und zwei davon werden mit jedem eingelagerten Satz teurer
zu reparieren.

**1. Eine Einlagerung hat keinen Inhalt.** `tire_storage` speichert einen Kunden, ein
DOT-Datum und *eine* Profiltiefe. Tatsächlich liegen dort vier Räder – oft mit
unterschiedlichem Profil (Vorderachse fährt sich schneller ab), teils mit Felgen, teils ohne,
mit oder ohne Luftdrucksensoren. „Profiltiefe: 5,5 mm" für einen ganzen Satz ist eine
Mittelung, die genau die Information wegwirft, aus der ein Verkaufsgespräch entsteht.

**2. Die Einlagerung hängt am Kunden, nicht am Fahrzeug.** Ein Kunde mit zwei Autos hat zwei
Sätze. Heute steht an beiden derselbe Name, und welcher Satz auf A-12 liegt, weiß nur, wer
dabei war. Es gibt zwar `vehicles.stored_tire_storage_id`, aber das ist der Rückweg und
optional – die Verknüpfung kann fehlen, ohne dass etwas auffällt. **Das ist der Punkt, den
ich als erstes anfassen würde**: je mehr Sätze eingelagert sind, desto aufwendiger wird das
Nachtragen.

**3. Es gibt keine Saison.** Ein Reifenhotel atmet im Halbjahrestakt: im Frühjahr kommen die
Winterreifen rein, im Herbst raus. Die Anwendung kennt diesen Rhythmus nicht. Damit fehlt die
wichtigste Frage, die dieses Geschäft stellt: *Welche Kunden haben bei uns Sommerreifen
liegen, die sie in vier Wochen brauchen?* Das ist keine Lagerfrage, das ist die
Terminplanung und die Umsatzplanung für ein halbes Jahr.

Nebenbei: `vehicles` trägt `tire_size`, `tire_dot_date`, `tire_profile_mm` – unklar bleibt,
ob das die *montierten* oder die *eingelagerten* Reifen beschreibt. Solange beides dasselbe
Feld benutzt, ist jede Auswertung darauf eine Vermutung.

## Der Leitgedanke: ein Lagerort ist nicht nur ein Regal

Die größte Vereinfachung für alles Weitere ist eine begriffliche: **Ort ist Ort.** Reifen und
Handelsware liegen an genau drei Arten von Orten:

1. **im Regal** – der heutige Lagerplatz, feste Adresse, ein Satz pro Platz
2. **im Transporter** – rollendes Lager, wechselnder Inhalt, gehört zu einem Fahrzeug
3. **beim Kunden** – montiert oder abgeliefert, damit aus dem Bestand raus

Damit beantworten sich zwei deiner Fragen mit derselben Struktur: Handelsware braucht keine
zweite Lagerwelt, sondern einen zweiten Ort-Typ. Und der Transporter, den du ohnehin einem
Einsatz zuordnen willst, ist gleichzeitig genau der Lagerort, an dem im Alltag am meisten
Ware verschwindet.

---

## Block A – Die Einlagerung vertiefen

**A1 – Der Satz und seine vier Räder.** Neue Tabelle `eingelagerte_raeder`: je Rad Position
(VL/VR/HL/HR), Reifengröße, DOT, Profiltiefe, Felge (Stahl/Alu/keine), Sensor ja/nein,
Bemerkung. `tire_storage` bleibt der Satz, die Räder hängen daran.

Der Gewinn ist nicht die Vollständigkeit, sondern was daraus folgt: „Kunde Müller, HL 3,1 mm"
ist ein konkreter Verkaufsanlass, „Satz ca. 5 mm" ist keiner.

**A2 – Der Satz gehört zu einem Fahrzeug.** `tire_storage.vehicle_id` als Pflichtfeld für
neue Einlagerungen, Kunde bleibt zusätzlich gespeichert (ein Fahrzeug kann den Halter
wechseln). Der bestehende Rückweg `vehicles.stored_tire_storage_id` entfällt.

**A3 – Saison und Typ.** `tire_storage.saison` (Sommer/Winter/Ganzjahr). Ein Feld, aus dem
später Block D lebt.

**A4 – Zustand beim Einlagern festhalten.** Foto des Satzes beim Annehmen, optional eine
Bemerkung („Felge VR Bordsteinschaden"). Zwei Minuten Aufwand, die genau einmal im Jahr eine
unangenehme Diskussion beenden. Braucht Supabase Storage – neue Technik im Projekt, aber
geradlinig.

**A5 – Etikett am Reifensatz, nicht nur am Regal.** Heute trägt das Regal einen QR-Code. Der
Satz selbst trägt keinen. Ein zweites, kleines Etikett am Reifen mit Kunde, Fahrzeug,
Kennzeichen und Saison beantwortet die Frage, die im Lager wirklich gestellt wird: *Wem
gehört dieser Satz, der hier falsch steht?*

---

## Block B – Handelsware und Bestand

Das ist eine andere Art von Lager: nicht „ein Satz auf einem Platz", sondern „38 Stück von
Artikel X an Ort Y". Die Struktur dafür sind drei Dinge:

**B1 – Handelsartikel.** Die vorhandene `articles`-Tabelle bekommt ein Kennzeichen
`ist_handelsware` (wie schon `braucht_lagerplatz`). Dazu Einkaufspreis, Lieferant,
Mindestbestand, EAN. Dienstleistungen und Waren bleiben damit in einer Liste – im Auftrag
stehen sie ohnehin nebeneinander.

**B2 – Bestand je Ort.** `bestand` (artikel_id, ort_id, menge). Ein Ort ist ein Lager, ein
Lagerplatz oder ein Firmenfahrzeug.

**B3 – Bewegungen statt Bestandskorrekturen.** `lagerbewegung` als fortlaufendes Journal:
Zugang (Lieferung), Abgang (verbaut/verkauft), Umlagerung (Regal → Transporter), Korrektur
(Inventur), jeweils mit Menge, Grund, Auftrag, Person, Zeitpunkt. Der Bestand ist die Summe
der Bewegungen, nicht ein Feld, das jemand überschreibt.

Das klingt nach mehr Aufwand und ist weniger: eine Bestandszahl, die man direkt ändern kann,
lässt sich nicht erklären. Ein Journal beantwortet „wo sind die vier Reifen hin?" von selbst.
Es ist dieselbe Entscheidung, die im Projekt schon bei `contact_history` und beim `audit_log`
getroffen wurde.

**B4 – Verbrauch am Auftrag.** Steht eine Handelsware im Auftrag, entsteht beim Abschluss
automatisch der Abgang – aus dem Lagerort des ausführenden Fahrzeugs. Kein zweiter
Arbeitsschritt, keine vergessene Buchung.

**B5 – Mindestbestand und Nachbestellung.** Eine Liste „unter Mindestbestand", gruppiert nach
Lieferant, als Grundlage der Bestellung. Kein Bestellwesen mit Bestellungen und Wareneingängen
– dafür ist die Firma zu klein und dafür gibt es das ERP.

---

## Block C – Der Transporter

**C1 – Firmenfahrzeuge als eigene Stammdaten.** `firmenfahrzeuge` (Kennzeichen, Bezeichnung,
Notiz, aktiv). Nicht in `vehicles` mit hineinmischen – das sind Kundenfahrzeuge, und eine
Tabelle mit zwei Bedeutungen ist der Anfang von zwei Bedeutungen an fünfzig Stellen.

**C2 – Fahrzeug am Auftrag.** `orders.firmenfahrzeug_id`, in der Einsatzplanung sichtbar und
filterbar wie heute die Mitarbeiter. Damit beantwortet sich „welcher Wagen ist wann wo" und,
mit B2, auch „was ist drin".

**C3 – Der Transporter als Lagerort.** Morgens Umlagerung Regal → Fahrzeug, abends der Rest
zurück. Am Ende des Tages ist die Differenz zwischen erwartetem und tatsächlichem Inhalt
sichtbar, statt drei Monate später bei der Inventur.

**C4 – Konflikte erkennen.** Zwei Aufträge, dieselbe Zeit, dasselbe Fahrzeug: ein Hinweis in
der Einsatzplanung. Dieselbe Logik ließe sich auf Mitarbeiter anwenden, wo sie heute auch
fehlt.

---

## Block D – Aus dem Lager wird Umsatz

Hier liegt der eigentliche Wert, und er kostet vergleichsweise wenig, sobald A2 und A3 stehen.

**D1 – Die Saisonliste.** „312 Kunden haben Winterreifen bei uns liegen." Filterbar nach
Postleitzahl, mit einem Knopf, der daraus Wiedervorlagen macht – die Anrufliste für sechs
Wochen, auf einen Klick, mit derselben Kartenansicht und denselben Farben, die es schon gibt.
**Das ist aus meiner Sicht die wertvollste einzelne Funktion in diesem ganzen Dokument.**

**D2 – Profiltiefe wird zum Angebot.** Ein Satz mit einem Rad unter 4 mm bekommt beim
Einlagern eine Markierung. Beim nächsten Saisonwechsel steht im Auftrag: „Beim letzten
Wechsel: HL 3,1 mm – Neureifen anbieten." Damit greift Block B: aus dem Lagerbestand wird
ein Verkauf, aus dem Verkauf ein Abgang.

**D3 – DOT-Alter.** Reifen über sechs Jahre bekommen einen Hinweis, über zehn eine deutliche
Warnung. Das ist zugleich Sicherheitsthema und Verkaufsanlass – und es steht sauber da, falls
je jemand fragt, ob darauf hingewiesen wurde.

**D4 – Einlagerungsgebühr abrechnen.** Ein Sammellauf, der für jede aktive Einlagerung einen
Auftrag mit der Jahresgebühr anlegt. Passt in Phase 5 (Rechnungsstellung) und ist dort ein
kleiner Zusatz statt eines eigenen Vorhabens.

**D5 – Liegengebliebenes.** Sätze, die seit über zwei Jahren nicht bewegt wurden, deren Kunde
inaktiv ist oder nicht zahlt. Eine eigene Liste mit Alter, letzter Bewegung und Kontaktstand.
In jedem Reifenhotel steht Gerümpel auf bezahltem Regalmeter – die Frage ist nur, ob man
weiß, welches.

---

## Block E – Ordnung im Betrieb

**E1 – Inventur per Scan.** Ein Modus „Inventur": Regal für Regal jeden Aufkleber scannen,
die Anwendung hakt ab. Am Ende drei Listen – gefunden, fehlt, unerwartet gefunden. Bei
Handelsware zusätzlich die Zählmenge; die Differenz wird als Korrekturbewegung gebucht, mit
Grund.

**E2 – Wo liegt …?** Eine Suche über alles: Kunde, Kennzeichen, Lagerplatz-Code, Artikel. Ein
Feld, das die Frage beantwortet, die im Lager tatsächlich gestellt wird.

**E3 – Auslastung sichtbar machen.** Belegung pro Lager im Zeitverlauf und der Blick voraus
auf die Saisonspitze: *Reichen die Plätze im Oktober?* Heute gibt es einen Auslastungsbalken
für den Moment, nicht für den Monat, in dem es eng wird.

**E4 – Umlagern statt löschen und neu anlegen.** Ein Satz zieht von A-12 nach B-03: heute
zwei Schritte, die zwischendurch einen Zustand erzeugen, in dem der Satz nirgends liegt. Als
eine Handlung mit Historie.

**E5 – Mehrere Sätze auf einem Platz.** Heute gilt: ein Platz, ein Satz (Migration 15). Für
ein Regalfach mit drei Sätzen übereinander bräuchte es entweder feinere Plätze (A-12-1 bis
A-12-3, geht heute schon) oder eine Kapazität am Platz. **Empfehlung: bei feineren Plätzen
bleiben** – die Regel „ein Platz, ein Satz" ist der Grund, warum das Modell heute eindeutig
ist.

---

## Was ich nicht bauen würde

* **Kein vollwertiges Lagerverwaltungssystem.** Chargen, Seriennummern, Kommissionierwege,
  Mehrlagerstrategien – das ist eine andere Betriebsgröße.
* **Keine Bestandsbewertung, keine Einkaufsrechnungen, keine Steuerlogik.** Das gehört in die
  Buchhaltung. PinPoints liefert Mengen und Bewegungen, die Bewertung macht das ERP. Die
  Grenze früh zu ziehen erspart später eine Rückabwicklung.
* **Kein automatischer Nachbestellvorschlag mit Prognose.** Bei zwei Fahrzeugen entscheidet
  das ein Mensch in zwei Minuten besser als ein Modell.
* **Kein zweites Lager für Handelsware neben dem Reifenlager.** Ein Ortsbegriff, zwei
  Inhaltsarten.

---

## Reihenfolge – was ich zuerst machen würde

| Schritt | Warum zuerst | Aufwand |
|---|---|---|
| **1. A2 – Satz gehört zum Fahrzeug** | Wird mit jedem Tag teurer nachzutragen. Reine Datenmodell-Korrektur, sofort sichtbar in der Auftragsmaske. | klein |
| **2. A3 + D1 – Saison und Saisonliste** | Ein Feld, und daraus entsteht die halbjährliche Anrufliste. Das beste Verhältnis von Aufwand zu Ertrag im ganzen Dokument. | klein–mittel |
| **3. C1 + C2 – Firmenfahrzeuge am Auftrag** | Unabhängig vom Rest, klar umrissen, du brauchst es ohnehin. | klein |
| **4. A1 – Räder einzeln** | Voraussetzung für D2 und D3, aber erst sinnvoll, wenn 1–3 stehen. | mittel |
| **5. B1–B4 – Handelsware und Bewegungen** | Das größte Stück. Erst angehen, wenn klar ist, wie viele Artikel es wirklich sind und wer den Bestand pflegt. | groß |
| **6. E1 – Inventur per Scan** | Ergibt erst Sinn, wenn es Bestände gibt, die auseinanderlaufen können. | mittel |

Die Blöcke D3 (DOT-Alter), D5 (Liegengebliebenes) und E2 (Suche) sind kleine Zugaben, die
sich jederzeit dazwischenschieben lassen.

## Die Fragen, die ich dir dazu stellen würde

1. Wie viele Sätze liegen heute im Lager, und wie viele Plätze gibt es? Davon hängt ab, ob
   Nachtragen (A2) eine Stunde oder eine Woche ist.
2. Wie viele verschiedene Handelsartikel wären es realistisch – zehn oder zweihundert? Bei
   zehn reicht eine schlichte Bestandsliste, bei zweihundert braucht es Block B ganz.
3. Wer pflegt den Bestand, und wann? Ein Bestandssystem, das niemand füttert, ist schlechter
   als keines, weil man ihm glaubt.
4. Sollen Kunden je selbst sehen, was von ihnen eingelagert ist? Das wäre ein eigenes,
   öffentlich erreichbares Stück Anwendung – eine ganz andere Sicherheitsfrage.
5. Läuft die Rechnungsstellung künftig in PinPoints oder im ERP? Davon hängt ab, wie weit D4
   gehen soll.

---

# Brainstorming-Stand 07.09.2026

Zwischenstand des Gesprächs. Noch keine Umsetzungsentscheidung – aber die Punkte, die
inzwischen geklärt sind, stehen hier, damit sie nicht wieder verhandelt werden müssen.

## Geklärt

| Punkt | Stand |
|---|---|
| A2 Satz gehört zum Fahrzeug | **Ja.** Gemeint ist das **Kundenfahrzeug** (`vehicles`), nicht der Transporter. |
| A3 + D1 Saison und Saisonliste | **Ja.** |
| C1 + C2 Firmenfahrzeuge am Auftrag | **Ja.** Eigene Tabelle, getrennt von Kundenfahrzeugen. |
| A1 Räder einzeln | **Ja, aber mit Sammelwert als Normalfall** – siehe unten. |
| B Handelsware | Vorerst klein. Menge überschaubar, genauer Umfang noch offen. |
| E1 Inventur | Später. |

Die Namensverwirrung ist übrigens genau der Grund für zwei getrennte Tabellen: „Fahrzeug" heißt
im Kundenkontext das Auto des Kunden und im Einsatzkontext der eigene Transporter. Eine Tabelle
mit zwei Bedeutungen wird an fünfzig Stellen zu zwei Bedeutungen.

## A1 überarbeitet: Sammelwert ist der Normalfall

Es sind zwei verschiedene Aussagen, nicht eine ungenaue und eine genaue:

* **Sammelmessung**: „Der Satz hat etwa 4 mm." Eine Zahl, zehn Sekunden.
* **Einzelmessung**: „VL 5,2 · VR 5,0 · HL 3,1 · HR 3,4." Vier Zahlen, eine Minute – und die
  Grundlage für einen konkreten Verkaufsanlass.

Deshalb **beides speichern, aber nie gleichzeitig**. `tire_storage.erfassungsart` sagt, welche
Aussage gilt: bei `sammel` steht der Wert am Satz und es gibt keine Radzeilen, bei `einzeln`
gelten die Radzeilen und der Satzwert wird nur zur Anzeige daraus berechnet (das Minimum, denn
das schwächste Rad entscheidet). Eine Prüfregel in der Datenbank hält das auseinander – sonst
stehen irgendwann zwei Wahrheiten da und niemand weiß, welche stimmt.

**Nicht immer vier Räder.** `tire_storage.anzahl_raeder` (Standard 4, erlaubt 1–8). Der Fall
„zwei weggeworfen, zwei eingelagert" ist real und darf kein Sonderfall im Kopf des Technikers
bleiben. Bei Einzelerfassung ist die Position (VL/VR/HL/HR) optional – bei zwei Rädern weiß man
sie oft, bei einem losen Ersatzrad nicht.

## Die These „alles läuft über die App, dann pflegt sich das System selbst"

Der Gedanke ist richtig und ist im Kern schon die Architektur: der Auftrag ist der
Sammelpunkt, Leistungen, Einlagerung, Fahrzeug und Mitarbeiter hängen daran. Wenn jeder
Auftrag dort entsteht und dort abgeschlossen wird, entsteht der Datenbestand als Nebenprodukt
der Arbeit. Genau so soll es sein.

Was allein durch **Verpflichtung** aber nicht entsteht, ist *Qualität*. Ein Pflichtfeld
erzeugt zuverlässig einen Eintrag, nicht zuverlässig einen richtigen. Wer unter Zeitdruck vor
einer Einfahrt steht und nicht weiter kommt, trägt „0" ein oder „xxx" – und dann ist die Lage
schlechter als vorher, weil die Zahl jetzt echt aussieht. Drei Dinge wirken statt dessen:

**1. Die App muss schneller sein als der Zettel.** Das ist die eigentliche Durchsetzung. Der
QR-Aufkleber am Regal ist dafür das Vorbild: scannen ist schneller als in einer Liste mit
hundert Plätzen zu suchen, deshalb wird gescannt. Jede Pflicht, die langsamer ist als die
Umgehung, wird umgangen.

**2. Harte Regeln nur dort, wo falsche Daten teuer sind – und erst beim Abschluss.** Es gibt
schon genau eine solche Regel: ein Auftrag mit einer Einlagerungsleistung lässt sich nicht
abschließen, solange kein Lagerplatz belegt ist, und das erzwingt die Datenbank, nicht die
Oberfläche. Dieses Muster trägt: wenige, scharfe Regeln, jeweils im Moment des Abschließens.
Nicht zwanzig Pflichtfelder beim Öffnen.

**3. Lücken sichtbar machen statt blockieren.** Eine Liste „Nachtrag nötig" – abgeschlossene
Aufträge mit fehlenden Angaben, je Techniker, mit Anzahl. Fünf Minuten am Abend im Warmen sind
besser als zwei Minuten in der Einfahrt bei Regen. Und eine Zahl, die jede Woche
schrumpft, wirkt stärker als jede Pflicht.

**Zwei Voraussetzungen, ohne die die These kippt:**

*Offline.* Wenn der Techniker in einer Tiefgarage steht und die App nichts annimmt, greift er
zum Zettel – und ab da ist der Anspruch „alles über die App" tot, auch für die Fälle mit Netz.
**Die Verpflichtung zur App setzt Stufe 3 und 4 des PWA-Ausbaus voraus** (siehe
`pwa-plan.md`); vorher ist sie ein Versprechen, das die Technik nicht hält.

*Ein sauberer Weg für den Abbruch.* „Kunde nicht da", „falsche Reifengröße dabei", „Auto
zugeparkt". Gibt es dafür keinen ehrlichen Weg im System, lernen die Techniker, das System
anzulügen – irgendein Status muss ja gesetzt werden. Ein Abbruchgrund am Auftrag ist billig
und hält die Daten sauber. Teile davon gibt es schon (`cancel_reason`).

## Grafisch arbeiten: der Regalplan als Gegenstück zur Karte

Die Karte ist die grafische Sicht auf die Kunden. Dem Lager fehlt sein Gegenstück – heute ist
es ein Kachelgitter ohne Bezug zur Wirklichkeit im Raum.

**Der Regalplan.** Ein Plan, der das Regal abbildet: Reihen untereinander, Plätze
nebeneinander. Das Schöne daran: **die Daten dafür sind schon da.** Die Plätze heißen `A-01`
… `A-20`, `B-01` … – Präfix ist die Reihe, Zahl die Position. Daraus lässt sich der Plan
erzeugen, ohne dass irgendjemand etwas zusätzlich pflegen muss. Wer später ein Regal wirklich
zeichnen will (Reihe, Spalte, Ebene als Felder), kann das nachrüsten; anfangen kann man ohne.

**Zur Farbgebung – Vorsicht.** Grün/Orange/Rot bedeuten in dieser Anwendung bereits einen
Kundenzustand. Dieselben Farben im Lager mit anderer Bedeutung wären ein zweites Vokabular für
dieselben Farben. Vorschlag, im Einklang mit der Regel aus dem Designsystem („die Form trägt
die Aussage, die Farbe bestätigt sie"):

* **frei** – helle Kachel, gestrichelter Rand
* **belegt** – gefüllte Kachel mit Kunde/Kennzeichen, ruhige Farbe
* **Handlungsbedarf** – ein kleiner oranger Punkt an der Ecke (Profil unter Grenzwert,
  DOT zu alt, Liegezeit überschritten), nicht die ganze Kachel umfärben
* **gerade gesucht/gescannt** – kurz hervorgehoben

Die Ampel also für *Zustand*, nicht für *Belegung*. Belegung ist voll oder leer, das ist eine
Form, keine Farbe.

**Weniger Auswahllisten, mehr Antippen.** Konkret dort, wo es heute weh tut:

* **Radbild statt Formular**: bei der Einzelerfassung ein Auto von oben, vier antippbare
  Räder. Rad antippen → große Zahleneingabe mit Plus/Minus in 0,1-Schritten. Farbe des Rades
  zeigt sofort, wo es eng wird.
* **Segmentierte Knöpfe statt Auswahlliste** bei kurzen, festen Listen: Saison
  (Sommer/Winter/Ganzjahr), Felge (Stahl/Alu/keine), Anzahl Räder. Dieselbe Optik wie die
  Filterchips über der Kundenliste – ein Vokabular, nicht zwei.
* **Lagerplatz wählen** heißt künftig: scannen, oder im Regalplan antippen. Die Auswahlliste
  bleibt als dritter Weg, nicht als erster.
* **Umlagern** als eine Handlung: Satz antippen → „verschieben" → Zielplatz scannen oder im
  Plan antippen. Kein Löschen-und-neu-Anlegen mit einem Zwischenzustand, in dem der Satz
  nirgends liegt.
* **Werkstattmodus**: größere Schaltflächen und weniger Elemente je Bild, weil mit Handschuhen
  bedient wird. Die 16px-Regel für Eingabefelder war der erste Schritt in diese Richtung.

**Wo Grafik sonst noch trägt:**

* **Einsatzplanung als Tagesband** statt Tabelle: je Techniker oder Fahrzeug eine Zeitleiste,
  Termine als Balken. Überschneidungen sieht man dann, statt sie zu berechnen.
* **Tagesroute auf der Karte**: die Termine des Tages nummeriert und verbunden – die Karte
  gibt es schon, die Reihenfolge auch.
* **Saisontrichter im Dashboard**: eingelagert → kontaktiert → Termin → erledigt. Ein Bild,
  das im September die Frage beantwortet, wie weit man ist.
* **Ladeliste des Fahrzeugs** als abhakbare Liste statt Bestandstabelle.

**Eine Warnung zum Auftragsfenster**: Der Wunsch nach „grafisch und wenig Klicks" führt schnell
zu einem Assistenten mit Schritt 1 von 5. Das war schon einmal die falsche Antwort – gewünscht
war ausdrücklich *ein* vollständiges Fenster. Die Verbesserung liegt also nicht darin, das
Fenster in Schritte zu zerlegen, sondern darin, seine Abschnitte klarer zu trennen und die
Eingaben in jedem Abschnitt tippbar statt tippbar-und-scrollbar zu machen.

## Noch offen

1. Wie viele Sätze liegen aktuell im Lager? (Entscheidet den Aufwand für A2.)
2. Wie viele Handelsartikel realistisch – zehn oder zweihundert?
3. Soll die Einzelerfassung der Räder bei bestimmten Leistungen Pflicht sein, oder immer
   freiwillig?
4. Gibt es Regale, die sich sinnvoll als Plan zeichnen lassen (Reihen/Ebenen), oder ist die
   Wirklichkeit unregelmäßiger, als die Codes vermuten lassen?
5. Ab wann gilt ein Satz als „liegengeblieben" – zwei Jahre? Eine Saison ohne Kontakt?
