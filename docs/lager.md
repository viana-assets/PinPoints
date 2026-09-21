# Lager-Modul

Eigener Top-Level-Tab `tab === "lager"`: zweistufige Navigation wie ein eigenes Modul –
erst Kartenübersicht aller Lager mit Auslastungsbalken und Lageradresse (`LagerPanel`,
Ebene 1), dann nach Klick auf ein Lager (Breadcrumb "Lager › {Name}") die Lagerplätze als
Karten-Grid mit Belegt/Frei-Status (Ebene 2). Klick auf einen Lagerplatz öffnet
`TireAssignModal`: Kunde+Fahrzeug+Saison+DOT-Datum+Profiltiefe zuordnen/ändern/entfernen, plus **Historie**
des Lagerplatzes (frühere Einlagerungen, Migration 06 – Entfernen ist ein Soft-Delete über
`tire_storage.removed_at`, nicht `delete`).

**Lager-Einstellungen**: Beim Anlegen eines neuen Lagers können direkt Name, Lageradresse
(Migration 08, `warehouses.address`) und Notiz hinterlegt sowie die Lagerplätze über eine
Nummerierungslogik (Präfix + Von/Bis-Nummer + Stellenanzahl, z. B. `A` 1–20 zweistellig →
`A-01` … `A-20`, `buildSlotCodes()`/`SlotNumberingFields` in `app/page.tsx`) in einem Zug
erzeugt werden, statt hinterher einzeln. Ein bestehendes Lager lässt sich über
"Lager bearbeiten" (Ebene 2) nachträglich umbenennen/Adresse+Notiz ändern
(`updateWarehouse`), und über "+ Mehrere Lagerplätze nach Nummerierung anlegen" lassen sich
jederzeit weitere Plätze nach demselben Schema nachrüsten (`addStorageSlotsBulk`).

Berechtigungen für dieses Modul sind am feinsten granular geregelt, siehe
`berechtigungen-und-rollen.md` (`action.lager.*`-Schlüssel). Seit Migration 16 werden sie auch
in der Datenbank durchgesetzt und nicht mehr nur als ausgeblendeter Knopf – vorher konnte
jeder eingeloggte Account per direktem API-Aufruf Lager und Lagerplätze anlegen und löschen.

**Ein Lagerplatz hat höchstens eine aktive Belegung** (Migration 15, partieller Unique-Index
auf `tire_storage(storage_slot_id) where removed_at is null`). Vorher war das nur eine Annahme
der Oberfläche: zwei parallele Zuordnungen erzeugten zwei aktive Zeilen, und welche angezeigt
wurde, war Zufall. Seit Migration 18 muss außerdem ein Lagerplatz-Code innerhalb eines Lagers
eindeutig sein.

---

## QR-Aufkleber am Regal (Migration 22)

Jeder Lagerplatz kann einen Aufkleber bekommen, der genau auf ihn zeigt.

- **Einzeln**: der 🏷-Knopf auf der Lagerplatz-Karte, für den Nachdruck eines abgerissenen
  Aufklebers.
- **Alle auf einmal**: „Aufkleber für alle N Lagerplätze drucken" über dem Karten-Grid, für die
  Erstausstattung eines Lagers.

Beides öffnet denselben Druckbogen (`LagerplatzAufkleber`); der Unterschied ist allein die Länge
der übergebenen Liste. Gedruckt wird über die Druckfunktion des Browsers – kein PDF-Erzeuger im
Paketumfang: das Ergebnis wäre dasselbe Blatt Papier, nur mit einer weiteren Abhängigkeit und
ohne die Vorschau, in der man Ränder und Skalierung im Druckdialog noch geradeziehen kann. Die
Druckansicht steckt in `@media print` in `globals.css` und blendet über `visibility` alles außer
dem Bogen aus.

### Was im Code steht: ein Link, keine Zeichenkette

Auf dem Aufkleber steht `https://‹diese Umgebung›/?lagerplatz=‹storage_slots.id›`
(`lib/aufkleberCode.ts`). Der Unterschied zu einer bloßen Kennung ist im Alltag der ganze
Punkt: **der Aufkleber funktioniert auch mit der normalen Handy-Kamera** – draufhalten, auf die
Einblendung tippen, die App öffnet sich an diesem Lagerplatz. Stünde dort nur `a1b2c3…`, zeigte
die Kamera-App kryptischen Text und der Aufkleber wäre außerhalb dieser App wertlos.

Die Basisadresse kommt aus `window.location.origin`, nicht aus einer Konstante: aus einer
Testumgebung gedruckte Aufkleber zeigen dann auch dorthin, statt still auf die Produktivadresse
zu verweisen.

Als Kennung dient die vorhandene `storage_slots.id`. Bewusst **keine** zweite, kürzere Kennung –
die müsste erzeugt, auf Eindeutigkeit geprüft und mit der Id synchron gehalten werden: drei
Fehlerquellen für ein paar gesparte Zeichen im QR-Bild. Und es ist kein Geheimnis, das am Regal
klebt: wer den Link ohne Anmeldung öffnet, sieht nichts, dafür sorgt unverändert die
Row-Level-Security.

`lagerplatzIdAusCode()` liest die Kennung zurück und nimmt dabei bewusst mehr an als die eigene
Adresszeile (Link aus einer anderen Umgebung, abgetippte nackte Kennung), weist aber alles
andere ab – im Lager hängen auch Paketaufkleber und Reifenetiketten mit Codes herum. Die Fälle
stehen als Tests in `tests/aufkleberCode.test.ts`.

### Das zweite Etikett: am Satz, nicht am Regal (17.09.2026)

Der Regalaufkleber beantwortet „welcher Platz ist das". Beim Aufräumen mit mehreren Sätzen in
der Hand stellt sich die andere Frage: „wem gehört der hier". Dafür gibt es ein zweites
Etikett, das am Reifensatz selbst klebt und mit ihm wandert (`components/lager/
ReifensatzEtikett.tsx`, Knopf „Etikett drucken" im Einlagerungsblock des Auftragsfensters).

Der Code darauf zeigt auf die Einlagerung (`?satz=‹tire_storage.id›`, `satzUrl()`/
`satzIdAusCode()` in `lib/aufkleberCode.ts`), **nicht** auf den Lagerplatz: Wo der Satz liegt,
wird beim Scannen nachgeschlagen, nicht auf den Aufkleber gedruckt – ein Aufkleber mit
eingedrucktem Platz wäre in dem Moment falsch, in dem jemand umräumt, und genau dann wird er
gebraucht. Lagerplatz-Kennung und Satz-Kennung sind beides UUIDs und dürfen sich nicht
verwechseln lassen; `lagerplatzIdAusCode()` und `satzIdAusCode()` prüfen deshalb jeweils den
eigenen Parameternamen und lehnen den anderen mit einer Meldung ab, statt stillschweigend
nichts zu tun (siehe `EinlagerungBlock.tsx`, `gescannt()`).

Gedruckt wird, wie am Regal, über die Druckfunktion des Browsers, wahlweise auf A4-Bögen oder
im Format kleiner Etikettenrollen (`ETIKETT_FORMATE` in `ReifensatzEtikett.tsx`).

---

## Einlagerung am Auftrag (Migration 22)

Bis hierher kannte das Lager nur zwei Beteiligte: einen Lagerplatz und einen Kunden. **Warum**
die Reifen dort liegen, stand nirgends – damit ließ sich weder eine Einlagerung abrechnen noch
nachvollziehen, welcher Arbeitsgang sie ausgelöst hat, und der Techniker vor Ort hatte aus dem
Auftrag heraus keinen Weg ins Regal.

`tire_storage.order_id` schließt die Lücke. Im Auftragsfenster gibt es dafür einen eigenen Block
(`EinlagerungBlock`), direkt hinter den Leistungen:

| | |
|---|---|
| **Manuell** | Auswahlliste der freien Lagerplätze (Code · Lager) |
| **Per Scan** | „Lagerplatz scannen" öffnet die Kamera, der Aufkleber am Regal wird abgelesen |

Der Scan ist nicht Bequemlichkeit, sondern Fehlervermeidung: eine Liste mit hundert
Lagerplätzen auf einem Handy, während man mit Reifen in der Hand vor dem Regal steht, ist die
zuverlässigste Art, A-12 statt A-21 zu treffen.

Ein bereits belegter Platz erscheint nicht in der Auswahl, und ein Scan darauf wird mit Namen
abgelehnt („Lagerplatz A-12 ist bereits belegt."). Wird ein Auftrag einem anderen Platz
zugeordnet, zieht die vorhandene Einlagerung um, statt dass eine zweite entsteht – sonst blieben
zwei Plätze belegt, von denen einer niemandem gehört.

### Ein Lagerplatz ist keine Pflicht mehr – die Rückfrage ersetzt sie (Migration 46)

Migration 22 hatte dafür `articles.braucht_lagerplatz` eingeführt: ein Haken am Artikel, bei
dessen Vorhandensein im Auftrag die Datenbank den Abschluss verweigerte, solange kein
Lagerplatz belegt war. Migration 46 hat diesen Zwang **ersatzlos aus dem Statuswechsel-Trigger
entfernt** – die Spalte steht noch in der Datenbank, wird aber von keiner Stelle mehr gelesen.

Grund: Der Haken trug zwei Aussagen in einem Feld – „hier wird eingelagert" und „das kostet
etwas" – und die beiden fallen auseinander. Beim Einlagern weiß niemand, wie viele Monate der
Satz liegen wird; eine Gebühr lässt sich da nicht beziffern (siehe „Die Lagergebühr" unten).
Trug man den Gebührenartikel dafür stattdessen auf den Auslagerungs-Auftrag, verlangte
derselbe Trigger einen belegten Platz für einen Vorgang, der genau das Gegenteil tut – der
Auftrag ließ sich nicht abschließen.

An die Stelle des Zwangs tritt eine **Rückfrage in der Oberfläche**: Steht auf dem Auftrag eine
Leistung mit dem (an einem anderen Artikel gepflegten) Kennzeichen `articles.fragt_einlagerung`
– üblicherweise der Reifenwechsel, nicht die Einlagerung selbst – und wurde auf diesem Auftrag
nichts eingelagert, fragt das Auftragsfenster beim Klick auf „Auftrag abschließen" einmal nach:
„Nimmt der Kunde die alten Reifen mit?". Wer „Ja" antwortet, schließt im selben Klick ab; wer
„Nein – einlagern" wählt, bekommt den Einlagerungsblock aufgeklappt. Ein Zwang wäre hier falsch
gewesen: Genug Kunden nehmen ihre alten Reifen mit. Einmal beantwortet, kommt die Frage bei
diesem Auftrag nicht wieder – sonst würde aus der abgeschafften Hürde über die Erinnerung eine
neue.

Der Lagerplatz selbst bleibt trotzdem an keiner Stelle Pflicht zum Abschließen; erzwungen wird
seit Migration 30 nur, dass ein **bereits belegter** Platz Fahrzeug und Saison trägt (siehe
unten).

### Der Scanner

`components/QrScanner.tsx`, zwei Wege, weil es keinen gibt, der überall funktioniert:

1. `BarcodeDetector` – im Browser eingebaut (Android/Chrome, Chrome/Edge am Rechner). Nichts
   nachzuladen, sehr schnell.
2. `jsqr` – kleine Bibliothek, wertet ein einzelnes Kamerabild aus. Der Weg für iPhones: Safari
   kennt `BarcodeDetector` nicht.

Die Bibliothek wird **erst beim Scannen nachgeladen** (`await import`) und nur dort, wo der
eingebaute Weg fehlt. Wer nie scannt, lädt sie nie.

Beides braucht eine verschlüsselte Verbindung – Browser geben die Kamera über `http` nicht
frei. Auf Vercel ist das gegeben; lokal über `http` erscheint eine Meldung statt eines stummen
schwarzen Bildes. Kein Kamerazugriff, kein Gerät, abgelehnte Erlaubnis: jeder Fall hat seine
eigene Meldung, und der Lagerplatz lässt sich immer noch aus der Liste wählen.

### Aufruf über den Aufkleber

`?lagerplatz=‹Kennung›` wird in `app/page.tsx` einmal beim Start aus der Adresszeile gelesen,
danach wird die Adresszeile **sofort bereinigt** (`history.replaceState`) – sonst landet der
Parameter in Lesezeichen und im Verlauf, und ein Neuladen springt Wochen später wieder auf
denselben Lagerplatz. Das Lager-Modul schlägt daraufhin das richtige Lager auf und öffnet den
Platz (`springeZuLagerplatzId`).

Gelesen wird über `window.location` statt `useSearchParams()`: dieser Baum ist vollständig auf
dem Client zuhause, und `useSearchParams` verlangte in Next 14 eine Suspense-Grenze und machte
die Seite dynamisch – Aufwand ohne Gegenwert für einen einzelnen Parameter.

---

## Die Lagergebühr (Migration 46)

Sie wird **beim Auslagern** fällig, nicht beim Einlagern – dort steht die Zahl der Monate erst
fest. Zwei Felder tragen das:

* **`articles.abrechnungsart`** (`'normal'` oder `'lagergebuehr'`) am Artikel: Ein
  Lagergebühr-Artikel wird beim Einlagern nie verlangt und beim Auslagern vorgeschlagen, Menge =
  Monate. Gepflegt im Artikelstamm, siehe `artikelstammdaten.md`.
* **`tire_storage.entnahme_order_id`** hält fest, in welchem Auftrag der Satz herausgegeben
  wurde – also wo die Gebühr steht. `null` bedeutet: der Satz liegt noch, oder er wurde ohne
  Auftrag entnommen. Eine Prüfregel in der Datenbank verlangt, dass ein gesetztes
  `entnahme_order_id` immer ein gesetztes `removed_at` hat – eine Entnahme-Zuordnung ohne
  Entnahme wäre ein Widerspruch.

### Der Auslagern-Dialog

Wer eine Einlagerung entfernt – am Regal (Ebene 2) oder im Auftragsfenster über „Im Regal für
diesen Kunden" (siehe unten) – bekommt seit Migration 46 nicht mehr einen stillen
Datenbankschreibvorgang, sondern einen Dialog (`AuslagernDialog`, `lib/helpers.ts`:
`lagermonate()`, `istLanglieger()`):

* **Monate**: `lagermonate(eingelagert_am, heute)` – Kalendermonate, **ein angefangener Monat
  zählt voll**. 16.02. bis 17.09. sind damit 8 Monate, nicht 7; mindestens ein Monat wird immer
  berechnet, auch wenn derselbe Tag ein- und ausgelagert wird. Gerechnet wird über
  Kalenderfelder, nicht über Millisekunden – ein Monat hat keine feste Länge.
* Ist im Artikelstamm keine Leistung mit Abrechnungsart „Lagergebühr" hinterlegt, wird nur
  ausgelagert; der Dialog sagt das auch so.
* **„Ohne Gebühr auslagern"** ist eine gleichberechtigte Antwort, kein Sonderfall – genug Sätze
  werden kulanzhalber oder ohne Berechnung herausgegeben.
* Die vorgeschlagene Menge (= die berechneten Monate) bleibt änderbar; weicht sie ab, weist der
  Dialog nur darauf hin, lehnt aber nichts ab. Kulanz ist eine Geschäftsentscheidung, keine
  Rechenaufgabe der Anwendung.
* **Langlieger-Warnung**: `istLanglieger(monate, summeNetto)` schlägt an ab **18 Monaten**
  Liegezeit **oder** ab **150 € netto** Summe (`LANGLIEGER_MONATE`, `LANGLIEGER_EURO` in
  `lib/helpers.ts`) – zwei Schwellen für zwei verschiedene Anlässe: ein **vergessener** Satz
  (viele Monate) und eine **Summe**, die aus dem Rahmen fällt (kann auch bei wenigen Monaten
  entstehen, wenn der Monatspreis hoch ist). Die Anwendung entscheidet nicht, ob gekürzt wird –
  sie macht die Zahl nur sichtbar, bevor die Rechnung geschrieben ist.
* **Auf welchen Auftrag die Gebühr kommt**, wird im Dialog gewählt: vorgeschlagen der Auftrag,
  aus dem heraus ausgelagert wurde (falls er noch offen oder in Arbeit ist), sonst der neueste
  offene Auftrag des Kunden, sonst „Neuen Auftrag anlegen" – der wird mit dem heutigen Datum
  angelegt und danach automatisch geöffnet.

Getestet in `tests/lagerdauer.test.ts` – ein Fehler in der Monatsrechnung ist bares Geld, in
beide Richtungen, und der Kunde merkt es am Tresen.

### Im Auftragsfenster: zwei Hälften des Saisonwechsels

Der Normalfall im Frühjahr/Herbst ist derselbe Auftrag für beide Richtungen: Der alte Satz
kommt heraus (das ist die Gebühr), der neue kommt herein. Das Auftragsfenster zeigt deshalb,
solange auf dem Auftrag noch kein eigener Satz eingelagert ist, einen Block „Reifen
einlagern" mit einem eigenen Hinweis, wenn auf demselben Auftrag schon eine Lagergebühr steht
(„hier wurde also ausgelagert – kommt der andere Satz jetzt ins Regal, hier weitermachen").

Daneben, unter „Im Regal für diesen Kunden", stehen alle **anderen** aktiven Einlagerungen
desselben Kunden – auch die aus einem ganz anderen, längst vergangenen Auftrag. Ohne diese
Liste wäre der alte Satz aus dem aktuellen Auftrag heraus unsichtbar, weil der Einlagerungs-
Block sonst nur zeigt, was an *diesem* Auftrag hängt. Ein Klick auf „Auslagern" öffnet
denselben `AuslagernDialog`, mit diesem Auftrag als Vorschlag für das Gebühren-Ziel – die
Gebühr entsteht hier, deshalb steht der Knopf auch hier und nicht nur an der Regalwand.

**„Einlagerung entfernen" im Einlagerungsblock selbst öffnet keinen Dialog.** Das ist die
Korrektur eines Versehens im selben Arbeitsgang – wer einen Satz entfernt, den er im selben
Auftrag gerade erst angelegt hat, schuldet dafür nichts. Abgerechnet wird ausschließlich über
„Auslagern" (Regalwand oder „Im Regal für diesen Kunden").

---

## Der Satz gehört zum Fahrzeug und hat eine Saison (Migration 30)

Zwei Felder an `tire_storage`, aus denen der Rest des Lagerausbaus lebt:

**`vehicle_id` – das Kundenfahrzeug.** Vorher hing ein Satz nur am Kunden. Ein Kunde mit zwei
Autos hatte zwei Sätze, an beiden stand derselbe Name, und welcher auf A-12 liegt, wusste nur,
wer dabei war. Der Kunde bleibt zusätzlich gespeichert: ein Fahrzeug kann den Halter wechseln,
die Einlagerung gehört dann trotzdem noch der Person, die sie gebracht hat.

**`saison` – Sommer, Winter oder Ganzjahr.** Feste Werteliste, in der Datenbank per Prüfregel,
im Code als `SAISON_LABEL`/`SAISON_LISTE` in `lib/constants.ts`. Ein Feld, aus dem die
Saisonliste entsteht – die halbjährliche Anrufliste.

**Was entfallen ist:** `vehicles.stored_tire_storage_id`, der Rückweg vom Fahrzeug zum Satz.
Er war optional und von Hand zu pflegen – eine zweite Wahrheit neben der ersten. Jetzt zeigt
genau eine Richtung: Satz → Fahrzeug. Das Kundenfenster liest die Einlagerung darüber
(`tire_storage.vehicle_id === vehicle.id`) und zeigt sie nur noch an, statt sie pflegen zu
lassen.

**Zwei Regeln in der Datenbank, nicht in der Oberfläche:**

1. Das Fahrzeug muss dem Kunden der Einlagerung gehören. Die Auswahl bietet ohnehin nur die
   Fahrzeuge des gewählten Kunden an – aber die Regel gehört dorthin, wo sie nicht umgangen
   werden kann. Beim Kundenwechsel im Zuordnungsfenster wird das Fahrzeug deshalb auch im
   Formular zurückgesetzt.
2. Ein Auftrag mit aktiver Einlagerung lässt sich erst abschließen, wenn Fahrzeug **und**
   Saison stehen. Wenige, scharfe Regeln, jeweils im Moment des Abschließens – statt zwanzig
   Pflichtfelder beim Anlegen, die unter Zeitdruck mit „xxx" gefüllt werden. (Der Lagerplatz
   selbst gehörte bis Migration 46 zu diesen Regeln; seither ersetzt ihn dort eine Rückfrage
   statt eines Zwangs, siehe „Ein Lagerplatz ist keine Pflicht mehr" oben.)

**Wo es erfasst wird.** Im Auftragsfenster direkt unter dem Lagerplatz, sobald einer belegt
ist: Fahrzeug als Auswahl (nur die Autos dieses Kunden), Saison als drei Chips. Der Techniker
hat den Satz in der Hand und das Auto vor sich – fünf Minuten später weiß es niemand mehr.
Im Lager-Modul stehen dieselben zwei Felder im Zuordnungsfenster.

**Fehlende Angaben bei Altbeständen** waren beim Umstieg kein Thema (0 eingelagerte Sätze am
10.09.2026). Die Migration trägt trotzdem nach, was eindeutig ist: den alten Rückweg und – bei
Kunden mit genau einem Fahrzeug – dieses Fahrzeug. Bei zwei Fahrzeugen wird bewusst nicht
geraten; eine falsche Zuordnung ist schlechter als eine fehlende, weil sie niemand mehr prüft.

---

## Ein Wert für den Satz – oder vier Räder einzeln (Migration 33)

Der Normalfall bleibt der Sammelwert: *ein* Profil für den ganzen Satz, in zwei Sekunden
erfasst. Das deckt den Alltag ab. Der Ausnahmefall ist der wertvolle: Wenn vorne 3,1 mm und
hinten 6,8 mm liegen, ist das ein Gespräch im Frühjahr – und mit einem Mittelwert ist es
keins mehr.

Deshalb zwei Erfassungsarten an `tire_storage`, umschaltbar am einzelnen Satz:

* **`sammel`** – die Profiltiefe steht am Satz, es gibt keine Radzeilen.
* **`einzeln`** – die Profiltiefe steht an den Rädern, am Satz ist sie leer.

**Es gibt die Profiltiefe immer nur einmal.** Das ist die eigentliche Entscheidung hier,
und sie steht als Prüfregel in der Datenbank (`tire_storage_kein_doppelter_profilwert`).
Zwei Felder für dieselbe Zahl bedeuten unweigerlich, dass sie irgendwann verschieden sind –
und dann muss jede Auswertung raten, welche gilt. Wer umschaltet, gibt den anderen Wert
also auf; beim Weg zurück auf `sammel` fragt die Oberfläche vorher nach, und die Datenbank
lehnt ihn ab, solange noch Räder erfasst sind.

Gelesen wird beides über **eine** Funktion: `satzProfilMm()` in `lib/helpers.ts` liefert bei
`sammel` den Satzwert und bei `einzeln` das **schwächste** Rad – nicht den Durchschnitt. Der
Satz ist so gut wie sein schlechtestes Rad; ein Mittelwert würde genau den Fall verstecken,
für den es die Einzelerfassung gibt. Alles, was Profiltiefen anzeigt oder filtert, ruft diese
Funktion auf und muss die Erfassungsart nicht kennen (`tests/profiltiefe.test.ts`).

### Das Radbild

Bei Einzelerfassung steht kein Formular mit vier Zeilen „VL/VR/HL/HR", sondern ein Auto von
oben mit vier antippbaren Rädern (`components/lager/RadBild.tsx`). Die Zuordnung ist dann die
Position selbst – man tippt das Rad an, das man gerade in der Hand hat, statt sich das Auto
zur Abkürzung dazuzudenken. Die Farbe der vier Räder beantwortet die Frage „wo wird es eng?"
ohne Zahlenvergleich; sie meint ausdrücklich den **Zustand**, nicht die Belegung, und benutzt
damit dasselbe Vokabular wie der Kundenzustand (`design-system.md`).

Gemessen wird im Stehen, mit Handschuhen, das Handy in einer Hand. Deshalb ±0,1 mm als große
Schaltflächen statt eines Zahlenfelds mit Tastatur. Die Grenzwerte stehen als Konstanten in
`lib/constants.ts`: `PROFIL_GESETZLICH_MM` 1,6 (der gesetzliche Mindestwert), darüber
`PROFIL_KRITISCH_MM` 3 und `PROFIL_HINWEIS_MM` 4 – die Schwellen, ab denen ein Winterreifen
praktisch nichts mehr taugt bzw. die nächste Saison knapp wird.

**Position darf leer bleiben.** Das lose Ersatzrad, „zwei weggeworfen, zwei eingelagert" – es
gibt reale Sätze, die keine vier zugeordneten Räder haben. Solche Räder stehen unter dem Bild
und zählen mit. Umgekehrt begrenzt `anzahl_raeder` (1–8, Standard 4), wie viele es werden
dürfen; ein Motorrad hat zwei, ein Transporter-Zwilling mehr.

**Zwillingsbereifung, Reserverad, Radwechsel zwischen Achsen** sind damit nicht abgebildet.
Das ist Absicht: Der Fall, für den die Einzelerfassung gebaut ist, heißt „ein Rad ist
deutlich schlechter als die anderen" – und der ist abgedeckt.

### Wo die Zahl auftaucht

Eine Messung, die nur im Auftragsfenster steht, ist eine Messung, die niemand wiederfindet.
Die Profiltiefe erscheint deshalb überall dort, wo über den Satz entschieden wird – und immer
als dieselbe Marke (`components/lager/ProfilMarke.tsx`, Farben nach `profilLage()`):

* **Lagerregal**, auf jeder Platzkarte – wer am Regal steht, sieht den Zustand, ohne zu tippen.
* **Platz-Historie**, weil die Räder beim Auslagern erhalten bleiben: entfernt wird die
  Einlagerung, nicht ihre Messwerte.
* **Saisonliste**, als zweite Spalte. Sie steht bewusst nicht am Ende: Auf dem Handy scrollt
  die Tabelle waagerecht, und die hinterste Spalte ist genau die, die man nicht sieht.

Die Marke fragt immer `satzProfilMm()`; ob der Satz sammel oder einzeln erfasst ist, muss
keine der drei Stellen wissen. Ein Pfeil (↓) markiert, dass es der schwächste von mehreren
Werten ist, ein ⚠ den Wert unter dem gesetzlichen Minimum.

**Im Zuordnungsfenster des Lagers gibt es bei Einzelerfassung kein Eingabefeld** für die
Profiltiefe, sondern das Radbild in Ansicht. Ein Feld anzubieten, dessen Inhalt die Datenbank
beim Speichern zurückweist, wäre eine Falle; geändert wird dort, wo der Satz in der Hand
liegt – im Auftragsfenster.

### Der Zustand gehört zum Satz, nicht zum Auto (Migration 34)

Am Fahrzeug standen bis zum 11.09.2026 drei Felder: Reifengröße, DOT-Datum, Profiltiefe. Zwei
davon waren falsch platziert, und der Betrieb hat es gezeigt: *„Wofür lege ich am Fahrzeug die
Reifengröße, das DOT-Datum und Co. an? Wenn ich sowieso jedes Mal den Reifensatz wechsle, dann
würde die Information doch nicht stimmen, sobald ich den nächsten Satz anziehe."*

Genau so ist es. Ein Auto behält man zehn Jahre, ein Satz wechselt zweimal im Jahr. Nach dem
ersten Wechsel beschreibt der Wert am Fahrzeug einen Satz, der gerade woanders liegt – und er
sieht dabei aus wie eine frische Messung. Das ist schlimmer als ein leeres Feld: Ein leeres
Feld erzählt nichts, ein veraltetes erzählt etwas Falsches.

**`tire_dot_date` und `tire_profile_mm` sind deshalb entfallen.** Beides steht seit Migration
33 am eingelagerten Satz bzw. am einzelnen Rad.

**`tire_size` bleibt am Fahrzeug.** Welche Größe ein Dacia Duster fährt, ist eine Eigenschaft
des Autos: Sie hilft beim Bestellen und beim Prüfen, ob ein Satz überhaupt zu diesem Wagen
gehören kann. Das ist die Trennlinie – was am Auto bleibt, gilt über alle Sätze hinweg.

### Ein Fahrzeug anlegen, wo man gerade steht

Ein Satz braucht ein Fahrzeug, bevor der Auftrag abgeschlossen werden kann (Migration 30) –
angelegt werden konnte ein Fahrzeug aber nur im Kundenfenster. Der Techniker steht am Auto,
im Auftrag, und musste für ein Kennzeichen das Fenster wechseln und wieder zurückfinden.

Im Einlagerungs-Block steht deshalb jetzt „+ Fahrzeug dieses Kunden anlegen": Kennzeichen und
Modell, mehr nicht – das ist, was am Auto abzulesen ist, während man davorsteht. Das neue
Fahrzeug wird dem Satz **gleich zugeordnet**; andernfalls hätte man es angelegt und müsste es
anschließend in einer Auswahlliste suchen, in der genau ein Eintrag steht. Reifengröße und
Notiz lassen sich später im Kundenfenster nachtragen.

### Warum am Abschluss-Knopf steht, was fehlt

Die Regel aus Migration 30 (Fahrzeug und Saison, siehe oben) greift erst beim Abschließen, und
sie greift in der Datenbank. Am 11.09.2026 stellte sich heraus, dass die Ablehnung am Handy
**unsichtbar** war: Die Fehlermeldung lag auf CSS-Ebene 4000, das Auftragsfenster auf 10000.
Von außen sah es aus, als täte der Knopf nichts – der schlimmste Zustand, den eine Oberfläche
annehmen kann.

Zwei Korrekturen: Die Meldung liegt jetzt über dem Fenster (und am Handy oben statt unten, wo
sie sonst genau den Knopf verdeckt, dessen Ablehnung sie erklärt). Und am Knopf steht als
Vorschau, was noch fehlt – „Fehlt noch: Fahrzeug, Saison".

**Der Knopf bleibt trotzdem anklickbar.** Ihn zu sperren hieße zu behaupten, die Oberfläche
kenne alle Bedingungen; sie kennt nur die, die sie nachbildet. Die Wahrheit steht in der
Datenbank, und ihre Ablehnung muss ankommen – sichtbar, nicht hinter einem Fenster.

### Der Filter, der aus der Anrufliste eine Verkaufsliste macht

In der Saisonliste steht neben „Nur fällige" jetzt **„Nur mit schwachem Profil (unter
3,0 mm)"**, und über der Liste eine Zeile: *Bei 7 Sätzen liegt das schwächste Rad unter
3,0 mm.* Das ist die Antwort auf die Frage, die die Saisonliste bisher nicht beantworten
konnte – nicht „wer hat Reifen bei uns liegen", sondern „bei wem lohnt der Anruf".

**Ungemessene Sätze gelten nicht als schwach.** Über sie ist nichts bekannt; sie mitzuzählen
hieße, eine Messung zu behaupten, die es nicht gibt – und das Gespräch beim Kunden fiele
entsprechend aus. Sie bleiben in der Liste sichtbar, nur eben ohne Marke.

Filter und Kopfzeile benutzen dieselbe Regel, in `tests/profiltiefe.test.ts` festgehalten:
Sonst zeigt die Liste drei Zeilen, während die Überschrift fünf behauptet.

---

## Die Saisonliste (Migration 30/31, eigener Reiter)

Die Frage, die dieses Geschäft zweimal im Jahr stellt: *Welche Kunden haben Winterreifen bei
uns liegen, die sie in sechs Wochen brauchen?* Bisher war sie nur zu beantworten, indem jemand
das Regal abgeht. Die Liste ist **kein neuer Datenbestand**, sondern eine Sicht auf den
vorhandenen: aktive Einlagerungen + Saison + Kunde + Fahrzeug + Platz.

**Voreinstellung folgt dem Jahreslauf.** `naechsteSaison()` in `lib/helpers.ts`: ab August bis
Januar die Winterliste, sonst die Sommerliste. Wer die Liste öffnet, sieht meistens sofort die
richtige – umschalten geht jederzeit.

**Filter:** Saison, Postleitzahl (Präfix) und „nur fällige". Es gibt kein PLZ-Feld an den
Kunden; `plzAus()` liest sie aus der einzeiligen Adresse und lässt sich dabei von Hausnummern
nicht täuschen (`tests/saisonliste.test.ts`).

**Sätze ohne Saison verschwinden nicht** – sie erscheinen unter „Alle". Sie wegzufiltern hieße,
eine Lücke unsichtbar zu machen; die Liste behauptete dann eine Vollständigkeit, die sie nicht
hat.

**Die Karte zeigt in diesem Reiter nur die Kunden aus der Liste**, dieselbe Mechanik wie im
Termine-Reiter. Damit ist die Anrufliste zugleich eine Gebietskarte: wer in 90482 anruft, sieht
sofort, wer noch in der Nähe liegt.

**„Anrufliste erzeugen"** setzt bei allen Kunden der Liste die Wiedervorlage auf ein wählbares
Datum (Vorschlag: in sechs Wochen). Zwei Entscheidungen dabei:

* **Nur das Datum, nicht der Kontaktstatus.** Es wurde ja noch nicht angerufen. Wer den Status
  mitsetzte, hätte 300 Kunden als kontaktiert stehen, ohne dass jemand mit ihnen gesprochen
  hat – genau die Sorte Zahl, die eine Anwendung unglaubwürdig macht.
* **Je Kunde, nicht je Satz.** Ein Kunde mit zwei Autos hat zwei Sätze und steht trotzdem
  einmal auf der Liste.

Geschrieben wird in Blöcken von 200 Kennungen (`setWiedervorlageBulk`): eine `in`-Liste mit
mehreren hundert Einträgen landet in der Adresszeile und wird dort irgendwann abgeschnitten –
ohne Fehlermeldung, nur mit weniger getroffenen Zeilen.
