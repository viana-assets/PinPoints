# Design-System: „Werkstatt Warm"

Alle Tokens sind in `app/globals.css` als ein einziges `:root`-Set definiert – **kein Dark
Mode** (wurde entfernt, weil es nicht zuverlässig funktionierte; nicht ohne explizite
erneute Anfrage wieder einführen).

- Hintergrund: `#F2EFE9` (warmes Papier-Beige) als Basis, weiße Karten (Statistik-Kacheln,
  Suchfeld, Kundenzeilen) schweben mit weichem Schatten darauf.
- Akzent: `#FF5A1F` (Sicherheits-Orange) – Buttons, aktive Zustände, Badges.
- Marke/Navy: `#1E3A5F` – tiefes Blau für Markenflächen. Die frühere Logo-Plakette mit
  Orange-Navy-Verlauf ist am 29.08.2026 entfallen, siehe „Bildmarke" weiter unten.
- Die Logofarben sind **nicht** Teil dieser Tokenliste: sie gehören dem Logo, nicht dem
  Designsystem, und stehen als Verläufe in `IconMarke` (`components/icons.tsx`). Wer die
  Oberfläche einfärbt, nimmt die Tokens oben – nicht das Logoblau.
- Rot/Grün: `#E24C3D` / `#1E9B6E` – Status "offen"/"kontaktiert".
- Schriften: **Outfit** (Marke/Überschriften, `--font-brand`), **Karla** (Fließtext,
  `--font-body`), beide über Google Fonts in `app/layout.tsx` geladen.
- Formsprache: durchgehend abgerundete Ecken (10–18px radius), weiche Schatten,
  Pill-Badges statt eckiger Labels.
- Nav-Icons sind saubere Linien-SVGs (`Icon*`-Komponenten in `components/icons.tsx`), keine
  Emoji – **Ausnahme**: der Navigations-Button (`IconNavPin`) in Auftrags-/Terminzeilen ist
  bewusst ein farbiger Standort-Pin statt eines dünnen einfarbigen Linien-Symbols (vorher ein
  Kompass-Emoji, das je nach Betriebssystem/Schriftart unterschiedlich aussah), weil er auch
  klein sofort als "Navigation/Karte" erkennbar bleiben soll, siehe
  `auftraege-termine-einsatzplanung.md`. Er steht **frei**, ohne runde Farbfläche darunter –
  so unterscheiden sich die beiden Zeilenaktionen auch in der Form: gefüllter Kreis = anrufen,
  freistehender Pin = navigieren.
- **Der Pin trägt die eigene Palette, nicht die von Google Maps.** Bis zur Korrektur am
  29.08.2026 verwendete er die vier Markenfarben von Google (`#EA4335`/`#4285F4`/`#FBBC05`/
  `#34A853`) in der Anordnung des Google-Maps-Zeichens. Das ist ein fremdes Bildzeichen und
  wäre hier auch inhaltlich falsch, weil der Button wahlweise Google Maps **oder** Apple Karten
  öffnet. Jetzt: eine einfarbige Fläche in `--accent`. Die Namen der beiden Kartendienste stehen
  weiterhin im Menü darunter – das ist zulässige Nennung, ein Logo wäre es nicht.
- **Und er kommt ohne interne SVG-Referenzen aus – das ist keine Stilfrage.** Dieses eine Icon
  war zweimal komplett unsichtbar, beide Male aus demselben Grund: eine Referenz innerhalb des
  SVG (`url(#…)`), einmal auf ein `clipPath`, einmal auf einen Farbverlauf. Die IDs stammten aus
  `useId()`, das in React 18 Werte mit Doppelpunkten liefert (`:r5:`) – solche Verweise lösen
  Browser nicht auf, und ein ungültiger Verweis führt in SVG dazu, dass das Element **gar nicht**
  gezeichnet wird. Besonders tückisch: der übrig gebliebene weiße Kreis in der Mitte fiel auf
  hellem Grund niemandem als Fehler auf, es sah einfach nach nichts aus.

  **Regel daraus für alle Icons hier**: feste Farben als Attribut, keine `<defs>`, keine IDs,
  keine `url(#…)`-Verweise. Wer doch einen Verlauf braucht, prüft im Browser, ob er ankommt –
  ein unsichtbares Icon meldet sich nicht von selbst.
- **Icons in Buttons dürfen nicht schrumpfen: `button svg{flex:0 0 auto}`.** Das war die
  eigentliche Ursache, warum der Navigations-Button auch nach der Farbkorrektur unsichtbar
  blieb. Buttons sind hier `display:inline-flex`, ein Icon darin ist also ein Flex-Element und
  darf von der Flexbox zusammengedrückt werden – und zwar **nur entlang der Hauptachse**, bei
  einer Zeile in der Breite. Reicht der Innenraum nicht (der Standard-Innenabstand eines
  `<button>` kommt noch dazu, deshalb zusätzlich `padding:0` am Button), wird das Icon auf
  0 Pixel Breite gestaucht, während die Höhe unberührt bleibt. Der Pfad wird weiterhin
  gezeichnet, ragt aber aus dem 0 Pixel breiten Kasten – und SVG schneidet Überstehendes ab.

  Das Tückische daran: im Dokument ist alles korrekt. Element vorhanden, `visibility: visible`,
  Deckkraft 1, Füllfarbe richtig, anklickbar. Nur eben null Pixel breit. Gefunden wurde es erst
  durch Messen im Browser (`getBoundingClientRect` lieferte `[0, 20]`) – aus dem Quelltext
  heraus war es nicht zu sehen, drei Reparaturversuche gingen vorher daneben. **Merke: wenn ein
  Element nachweislich da und trotzdem unsichtbar ist, zuerst die tatsächliche Größe messen,
  nicht die Farbe verdächtigen.**

Alle Komponenten ziehen ihre Farben ausschließlich über CSS-Custom-Properties
(`var(--accent)` etc.) – bei künftigen Anpassungen nur die Token-Werte ändern, nicht
einzelne Komponenten hart verdrahten.

## Status-Kennzeichen und anklickbare Zeilen

`.badge` in vier Farben, zentral zugeordnet über `ORDER_STATUS_FARBE` (`lib/constants.ts`):
rot = Offen, orange = In Arbeit, grün = Erledigt, grau = Storniert. Grau ist Absicht – ein
stornierter Auftrag ist abgehakt, aber nichts wurde geleistet, er soll nicht mit „fertig"
verwechselt werden.

Auftragszeilen tragen `tr.klickbar` (Zeiger-Cursor, Hover-Hintergrund). Dass eine Tabellenzeile
anklickbar ist, sieht man ihr sonst nicht an. Bedienelemente **innerhalb** solcher Zeilen –
Mitarbeiter-Popover, Notizfeld, Löschen, Navigation, Kundenname – müssen `stopPropagation()`
aufrufen, sonst öffnet jeder Klick darauf zusätzlich das Auftragsfenster.

## Auftragsfenster

`.modal-box.auftrag-modal` ist mit 720 px bewusst breiter als die übrigen Dialoge (440 px).
Der Grund steht in `auftragsablauf.md`: hier werden Positionen erfasst, und genau daran ist
das frühere Leistungen-Popover gescheitert. Aufbau: fester Kopf, scrollender Inhalt in
`.auftrag-block`-Abschnitten, fester Fuß mit den Handlungen – links das Zurückhaltende
(Stornieren, Löschen), rechts das, was man im Normalfall will (Abschließen).

Begründungen für Stornierung und Wiedereröffnung werden **nicht** über `prompt()` abgefragt,
sondern klappen im Fuß als `.auftrag-grund` auf. So sieht der Nutzer beim Eintippen weiterhin
den Auftrag, um den es geht.

## Fehlermeldung

`.fehler-hinweis` (in `globals.css`): eine nicht blockierende Einblendung unten rechts, rot
abgesetzt, blendet sich nach neun Sekunden selbst aus und lässt sich wegklicken. Bewusst kein
modaler Dialog – wenn ein Speichervorgang scheitert, steht die Eingabe des Nutzers noch im
Formular und er soll sie direkt korrigieren können. Auf dem Handy rutscht sie über die
Navigationsleiste. Gespeist wird sie zentral aus `app/page.tsx`, siehe `architektur.md`.

## Navigationsstruktur

Eine Struktur, zwei Layouts (`#iconNav` in `app/page.tsx` + `globals.css`):

- **Desktop**: `#iconNav` ist eine breite (232px), beschriftete Seitenleiste wie in einem
  ERP-System – Icon + Textlabel nebeneinander, alle Punkte direkt sichtbar (Dashboard,
  Kunden, Aufträge, Trenner, Termine/Lager/Einsatzplanung/Neuer Kunde/Inaktive,
  Abstandshalter, Admin/Einstellungen unten).
- **Mobil** (`@media max-width:700px`): schlanke 4-Punkte-Leiste
  (Dashboard/Kunden/Aufträge/Weitere) – alle übrigen Punkte tragen die Klasse
  `.nav-secondary` und werden dort per CSS ausgeblendet, `.nav-more-btn` wird eingeblendet
  und öffnet `tab === "more"`, eine flache Kartenübersicht mit allen übrigen Zielen.
  `SECONDARY_TABS` in `app/page.tsx` bestimmt, wann der "Weitere"-Button dort aktiv markiert
  ist.
- **Vollseiten-Module** (`tab === "lager"`, `"einsatzplanung"`, `"admin"`, `"auftraege"`,
  `"artikel"`): der Inhalt bekommt die Kartenbreite dazu. Gesteuert über **einen** Schalter,
  die Klasse `.vollseite` an `#app`, die nur die Rasterspalten umstellt.

## Das Grundlayout ist ein Raster – und warum das wichtig ist

`#app` ist ein CSS-Grid mit drei ausdrücklich festgelegten Spalten:

```
normal:      grid-template-columns: 232px 380px 1fr;   /* Nav | Seitenleiste | Karte */
.vollseite:  grid-template-columns: 232px 1fr    0;    /* Kartenspalte auf 0 */
```

Weder `#iconNav` noch `#sidebar` noch `#map` haben eine eigene Breitenangabe – sie füllen ihre
Spalte. Das ist bewusst so und behebt einen Fehler, der die Anwendung lange begleitet hat:

**Das alte Fehlerbild.** Nach einem Wechsel in ein Vollseiten-Modul und zurück stand die
Seitenleiste sichtbar abgeschnitten da, die Karte lag über ihr – aber Klicks landeten
weiterhin korrekt auf den Elementen darunter. Beim Öffnen der Entwicklerwerkzeuge wurde es
schlimmer statt besser.

**Was die Ursache war.** Vier Dinge, die zusammen einen Zustand erzeugten, aus dem der Browser
nicht mehr herausfand:

1. **Ein Zustand, zwei Schalter**: `#sidebar.full-page` und `#map.force-hidden` beschrieben
   dasselbe, wurden aber an zwei verschiedenen Elementen gesetzt.
2. **Widersprüchliche Breitenangaben**: `#sidebar.full-page` setzte `width:100%` (also 100 %
   von `#app`, obwohl daneben noch 232 px Navigation stehen) *und* `flex:1`. Dass es
   funktionierte, lag allein daran, dass `flex-basis:0` die `width` beim Sizing überstimmt.
   Genau gegen die Überbreite aus solchen Angaben stand oben ein `overflow-x:hidden` als
   Pflaster.
3. **Ein Leaflet-Container, der abwechselnd `display:none` bekam**, während sich im selben
   Durchgang die Breite des Nachbarn änderte und dieser Nachbar per `key` komplett neu
   aufgebaut wurde.
4. **`invalidateSize()` auf einem 30-ms-Timer** – eine geratene Wartezeit statt eines Signals.
   War das Layout langsamer als der Timer, maß Leaflet die falsche Breite und rechnete damit
   weiter.

**Was jetzt gilt.** Bei Grid stehen die Spaltenbreiten am Container und werden nicht zwischen
den Geschwistern ausgehandelt – der Zwischenzustand, in dem Seitenleiste und Karte
unterschiedlicher Meinung über ihre Breite sind, kann nicht mehr entstehen. Die Karte wird
nie mehr ausgeblendet, ihre Spalte wird nur auf 0 gesetzt; der Leaflet-Container bleibt also
durchgehend im Dokument. Und statt des Timers meldet ein **`ResizeObserver`** auf `#map` jede
echte Größenänderung an `invalidateSize()` – beim Tabwechsel, beim Verkleinern des Fensters,
beim Öffnen der Entwicklerwerkzeuge, beim Drehen des Handys.

**Ersatzlos entfallen** sind damit: `forceFullReflow()` (`#app` kurz auf `display:none` und
zurück, plus `window.scrollTo(0,0)`), die vier globalen Listener dazu (`resize`,
`visibilitychange`, `pageshow`, `focus`), die nie wieder abgemeldet wurden, der
`matchMedia`-Effekt, der `key` an `#sidebar` und das `invalidateSize()` auf Verdacht beim
mobilen Umschalten. `forceFullReflow()` hatte selbst einen Fehler: es merkte sich den
vorherigen Inline-`display`-Wert, und weil beim Öffnen der Entwicklerwerkzeuge `resize`,
`focus` und `visibilitychange` praktisch gleichzeitig feuern, konnten zwei verschachtelte
Aufrufe am Ende `display:none` stehen lassen.

**Für künftige Änderungen**: keine Breitenangaben an `#iconNav`/`#sidebar`/`#map` – wer die
Aufteilung ändern will, ändert die Spalten von `#app`. Und nichts, was den Leaflet-Container
aus dem Dokument nimmt oder ausblendet.

## Anrufen und Navigieren stehen überall, wo ein Kunde steht (05.09.2026)

Zwei Handlungen begleiten diese Anwendung im Außendienst durch jede Ansicht: **anrufen** und
**hinfahren**. Sie sind deshalb keine Funktion einzelner Bildschirme, sondern ein Paar
Schaltflächen, das überall dort auftaucht, wo ein Kunde mit Adresse angezeigt wird:

| Ort | Anrufen | Navigation |
|---|---|---|
| Karten-Popup | ✔ | ✔ |
| Kundenliste (Seitenleiste) | ✔ | ✔ |
| Kundenfenster (Kopfzeile) | ✔ | ✔ |
| Termine (Schnellsicht) | ✔ | ✔ |
| Aufträge | – | ✔ |
| Auftragsfenster | – | ✔ |
| Einsatzplanung (Tagesliste und Gesamtliste) | – | ✔ |

Beide Handlungen laufen über je eine Funktion in `app/page.tsx`: `anrufAusloesen()` und
`openNavMenu()`. Das Anrufen stand bis zum 05.09.2026 an drei Stellen fast gleich im Code – mit
drei verschiedenen Verhaltensweisen, unter anderem erschien das Menü im Kundenfenster immer an
derselben Bildschirmecke statt am Knopf. Wer eine weitere Stelle ergänzt, ruft diese Funktionen
auf und schreibt die Logik nicht ein viertes Mal ab.

Anrufen fragt nur nach, wenn es etwas zu fragen gibt: bei genau einer hinterlegten Nummer wird
sofort gewählt, bei mehreren erscheint erst die Auswahl.

Die Navigation öffnet **nicht** direkt eine Karten-App, sondern erst ein kleines Menü mit
*Google Maps* und *Apple Karten* – dieselbe Mechanik wie beim Anrufen mit mehreren Nummern
(`navMenuFor` / `openNavMenu` in `app/page.tsx`, Links aus `navigationUrls()` in
`lib/helpers.ts`, das die geokodierte Position bevorzugt und nur ersatzweise den Adresstext
nimmt). Grund: welche App jemand benutzt, ist Geschmackssache und je Gerät verschieden – eine
feste Wahl wäre für die Hälfte der Nutzer die falsche.

Der Pin erscheint nur, wenn `cust.address` gefüllt ist. Eine Schaltfläche, die eine leere
Adresse an eine Karten-App übergibt, führt dort zu einer sinnlosen Suche.

**Eine Quelle für die Pin-Form.** Das Karten-Popup baut Leaflet aus einer HTML-Zeichenkette,
nicht React – den Pin gibt es dort also als Text und in den Listen als React-Element. Damit
daraus nicht mit der Zeit zwei verschiedene Pins werden, stehen Pfad und Farbe einmal in
`components/icons.tsx` und speisen beide Fassungen (`IconNavPin` und `navPinSvgHtml()`).

## Vollseiten-Module scrollen am Handy als Ganzes (09.09.2026)

Aufträge und Einsatzplanung folgen am Desktop einem bewährten Muster: Kopf und Filter bleiben
stehen, die lange Tabelle darunter scrollt für sich. Dafür ist die Modulfläche genau so hoch
wie der sichtbare Bereich (`flex:1` plus `min-height:0`), damit die Tabelle den Rest bekommt.

Am Handy war das genau falsch herum. Die Fläche wurde auf Bildschirmhöhe zusammengepresst,
alles darüber – beim Einsatzplan der Monatskalender – abgeschnitten, und weil die Fläche nie
höher war als der Bildschirm, gab es auch nichts zu scrollen: der Kalender endete sichtbar
mitten in der dritten Woche und war nicht erreichbar.

Seit dem 09.09.2026 scrollt am Handy die **ganze Modulseite** (`.modul-flaeche` wird dort zu
`flex:0 0 auto`, `.modul-tabelle` gibt das eigene senkrechte Scrollen ab). Das seitliche
Scrollen breiter Tabellen bleibt erhalten.

**Der eigentliche Fehler war aber, wo die Werte standen**: als `style={{ flex: 1, minHeight: 0 }}`
direkt am Element. Damit sind sie für keine Medienabfrage erreichbar – dieselbe Ursache wie bei
den Eingabefeldern mit fester Schriftgröße ein paar Tage zuvor. **Regel: Layoutwerte gehören
ins Stilblatt, nicht ins `style`-Attribut.** Ausnahmen sind Einzelmaße ohne Systemcharakter
(eine Feldbreite von 140 px in einer Tabellenzelle).

## Der Offline-Zustand wird angesagt (09.09.2026)

Ohne Netz startet die App seit dem PWA-Ausbau zwar, bekommt aber keine Daten: die Kundenliste
ist leer, die Karte grau. Ohne Hinweis sieht das aus wie ein Fehler in der Anwendung – und
eine Anwendung, die nicht sagt, was los ist, wird für kaputt gehalten und dann nicht mehr
benutzt.

`components/OfflineHinweis.tsx` liefert beides: einen schmalen Balken unten am Rand und den
Zustand `useIstOffline()`, mit dem Leertexte ihre Aussage ändern („Offline – die Kundenliste
kann gerade nicht geladen werden." statt „Keine Kunden gefunden."). Auf der Karte erscheint
derselbe Hinweis als Kartenmeldung.

Was `navigator.onLine` wirklich sagt: es gibt eine Netzwerkverbindung – nicht, dass der Server
erreichbar ist. Für Flugmodus, Funkloch und Tiefgarage stimmt das zuverlässig, und mehr
behauptet der Hinweis auch nicht.

**Das ist eine Ansage, keine Lösung.** Damit ohne Netz tatsächlich Daten da sind, braucht es
Stufe 3 des PWA-Ausbaus (`pwa-plan.md`) – und die hängt an der Frage, ob Kundendaten dauerhaft
auf den Geräten liegen dürfen.

## Drei Handy-Fehler mit einer gemeinsamen Wurzel (05.09.2026)

Alle drei kamen aus derselben Ecke: eine Annahme über den Browser, die am Schreibtisch stimmt
und am iPhone nicht.

**1. Die Seite war beim Öffnen zu kurz.** `#app` war am Handy mit `height:100vh; height:100dvh`
bemessen. iOS Safari löst diese Einheiten beim ersten Layout gelegentlich zu klein auf –
typisch, wenn die Seite aus einer anderen App heraus geöffnet wird – und rechnet sie danach
nicht neu, weil kein `resize` kommt. Sichtbar als Navigationsleiste mitten im Bild mit Beige
darunter; ein App-Wechsel und zurück reparierte es, weil das die Neuberechnung erzwingt.
Behoben, indem die mobile Hülle **gar keine gemessene Höhe mehr** hat, sondern fest
positioniert ist (`position:fixed; top/right/bottom/left:0`) – dieselbe Technik, die `#map`
am Handy schon benutzte.

*Bewusst nicht gemacht*: eine JavaScript-Variable `--app-hoehe` obendrauf. Genau solche
gestapelten Reparaturen waren das alte `forceFullReflow()` (siehe Abschnitt oben).

**2. Im Karten-Popup war nichts anklickbar.** Leaflet schiebt die Karte beim Öffnen eines
Popups zurecht, damit es ins Bild passt – am Handy praktisch immer. Das löst `moveend` aus,
`moveend` ruft `syncMarkers`, und `syncMarkers` rief `setPopupContent()`: der Inhalt wurde neu
aufgebaut, die sichtbaren Schaltflächen waren danach andere DOM-Elemente als die, an denen die
Handler hingen. Am Desktop passt das Popup ohne Verschieben, dort fiel es nie auf.

Behoben an zwei Stellen: `setPopupContent()` in `syncMarkers` ist ersatzlos entfallen (die an
`bindPopup()` übergebene Funktion wird ohnehin bei jedem Öffnen neu ausgewertet), und die
Handler hängen jetzt an **einem** Zuhörer am Dokument, der über `data-popup-aktion` /
`data-kunde` zuordnet. Leaflets `disableClickPropagation` stoppt `mousedown`/`touchstart`/
`dblclick`/`contextmenu`, nicht `click` – Delegation funktioniert also.

*Für künftige Änderungen*: keine Klick-Handler direkt an Elemente hängen, die Leaflet
verwaltet. Der Inhalt eines Popups kann jederzeit neu gebaut werden.

**3. Die Seite blieb reingezoomt.** iOS Safari vergrößert automatisch, sobald ein Eingabefeld
mit einer Schrift unter 16px den Fokus bekommt – und zoomt nie von selbst zurück. Unsere
Felder standen auf 13px. Am Handy stehen alle Eingabefelder jetzt auf **16px**, notiert am
Ende von `globals.css` über eine Ausschlussliste:

```css
input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]):not([type=color]),
textarea, select{font-size:16px;}
```

Zwei Fallstricke, die dabei aufgefallen sind und beim nächsten Mal wieder auftreten würden:

* Eine **Aufzählung der Typen** (`input[type=text], …`) lässt die 16 Felder aus, die im
  Projekt ohne `type`-Angabe geschrieben sind – unter anderem die im Lager. Deshalb die
  Ausschlussliste statt einer Aufzählung.
* Eine **Schriftgröße direkt am Element** (`style={{fontSize:11.5}}`) schlägt jede Regel im
  Stilblatt. Sechs Felder hatten das, darunter die Techniker-Notiz in Aufträgen und
  Einsatzplanung – ausgerechnet Felder, die am Handy benutzt werden. Diese Größe liegt jetzt
  in der Klasse `.feld-kompakt`. **Regel: keine `fontSize` im `style`-Attribut an
  Formularfeldern.**

*Bewusst nicht gemacht*: `maximum-scale=1` / `user-scalable=no` im Viewport-Tag. Das nimmt das
Vergrößern auch dort weg, wo es jemand zum Lesen braucht – eine Barriere, keine Reparatur.

## Branding: eine Markenquelle, viewport-abhängig (behoben)

Früher existierten **zwei** "Viana PinPoints"-Markenelemente gleichzeitig sichtbar
(Desktop): `.nav-brand` oben in `#iconNav` UND `.app-brand` als Kopfzeile in `#sidebar`
direkt daneben – Redundanz, kein bewusstes Design.

**Behoben**: die Sidebar-Kopfzeile (`<header className="app-brand-header">` in
`app/page.tsx`) ist jetzt per CSS standardmäßig `display:none` und wird nur innerhalb der
Mobil-Media-Query (`@media max-width:700px`) wieder auf `display:block` gesetzt – also
genau dort, wo `.nav-brand` in `#iconNav` seinerseits ausgeblendet ist (die mobile
Bottom-Bar hat weder Platz noch Konvention für ein Logo). Ergebnis: auf Desktop/Tablet
zeigt einzig `.nav-brand` oben in `#iconNav` die Marke, auf dem Handy einzig die
Sidebar-Kopfzeile – nie beide gleichzeitig, aber auch nie gar keine.

**Beide zeigen Bildmarke UND Schriftzug** (seit 29.08.2026; vorher trug `.nav-brand` nur das
Zeichen). Der Schriftzug ist an jeder Stelle echter Text und nicht Teil des Bildes: er steht
damit in der Hausschrift Outfit, bleibt bei jeder Vergrößerung scharf, ist durchsuchbar und für
Vorleseprogramme lesbar – und er hat genau eine Pflegestelle statt einer im Bild und einer im
Text. Die Wortmarke aus der Logodatei bleibt für Druck und Signaturen, siehe nächster
Abschnitt.

## Bildmarke: das Firmenlogo (29.08.2026)

An allen Markenstellen stand bis dahin eine **Flagge** – ein Platzhalter aus der Anfangszeit,
der mit dem Unternehmen nichts zu tun hatte. Sie ist ersetzt durch die echte Bildmarke aus
`Logos/viana-pinpoints-logo-editable.svg`: das stilisierte blaue „V" mit rotem Startpunkt,
weißer Route und grünem Zielpunkt mit Haken.

Eine Komponente, `IconMarke` in `components/icons.tsx`, bedient alle Stellen:

| Stelle | Element | Größe |
|---|---|---|
| Seitenleiste (Desktop/Tablet) | `.nav-brand` in `#iconNav`, mit Schriftzug | 32 × 40 px |
| Kopfzeile (nur Handy) | `.app-brand` in `#sidebar`, mit Schriftzug | 30 × 38 px |
| Login | `.login-brand` | 51 × 64 px |
| Passwort setzen | `.login-brand` | 51 × 64 px |
| Browser-Tab (Favicon) | `MARKE_FAVICON`, eingebunden in `app/layout.tsx` | 16 px |

Vier Entscheidungen dahinter:

1. **Nur das Zeichen, nicht das komplette Logo mit Wortmarke.** „VIANA PINPOINTS" mit der Zeile
   „PLAN • TRACK • COMPLETE" ist für 1400 px Breite gezeichnet. In der 232 px schmalen
   Navigationsspalte wäre die Tagline keine 4 px hoch – unlesbarer Schmutz statt Marke. Der
   Schriftzug steht dort, wo Platz ist, ohnehin als echter Text daneben (`<h1>`): in der
   Hausschrift Outfit, suchbar, und ohne zweite Pflegestelle. Das vollständige Logo bleibt für
   Druck, Signaturen und Ähnliches in `Logos/`.
2. **Inline im Quelltext statt als Datei unter `public/`.** Das Projekt hat kein
   `public/`-Verzeichnis, und Dateien werden einzeln über die GitHub-Oberfläche hochgeladen –
   eine Binärdatei wäre ein zusätzlicher, leicht zu vergessender Schritt. Vor allem aber lässt
   sich aus einer inline stehenden Quelle über die `viewBox` jeder gewünschte Ausschnitt zeigen;
   mit einem `<img>` bräuchte es je Ausschnitt eine eigene Datei.
3. **Verläufe, `<defs>` und `url(#…)` sind hier erlaubt – als ausdrückliche Ausnahme.** Die
   Regel im `IconNavPin`-Abschnitt oben („feste Farben, keine internen Verweise") bleibt für
   *Icons* bestehen. Beim Logo geht sie nicht: die Verläufe SIND das Zeichen, eine einfarbige
   Nachbildung wäre ein anderes Logo. Und der damalige Fehlschlag lag nicht an Verweisen an
   sich, sondern an IDs aus `useId()`, die Doppelpunkte enthielten – `url(#:r5:)` löst kein
   Browser auf. Feste, selbst geschriebene Bezeichner funktionieren; sie tragen hier ein
   `vp`-Präfix. Steht die Marke zweimal gleichzeitig im Dokument, sind die Bezeichner doppelt
   vergeben; Browser nehmen dann den ersten, und da beide identisch sind, ändert das nichts.
4. **Die Plaketten mit Orange-Navy-Verlauf sind weg** (`.nav-brand`-Hintergrund,
   `.app-brand-badge`, `.login-brand .brand-badge` – die beiden letzten Klassen existieren nicht
   mehr). Das Logo bringt eigene Farben mit; die alte Flagge war nur deshalb weiß, weil sie
   diesen Untergrund brauchte.

**Größenangaben nicht wegkürzen**: an jeder Stelle stehen Breite **und** Höhe ausdrücklich im
CSS, dazu `flex:0 0 auto`. Dieselbe Falle wie beim Navigations-Button (siehe oben): ein SVG ohne
feste Breite wird in einem Flex-Container auf Breite 0 gequetscht und ist unsichtbar, ohne dass
irgendetwas einen Fehler meldet. Das Seitenverhältnis des Ausschnitts ist 314 : 396 – die Marke
ist **hochkant**, nicht quer; wer die Größen ändert, rechnet mit diesem Verhältnis.

**Favicon-Sonderfall**: im Browser-Tab steht nur ein grüner Zielpunkt mit Haken. Das „V" mit zwei
Pins darauf ergibt bei 16 px Matsch. Der `data:`-URI wird in `components/icons.tsx` als eigene,
einfache Form gebaut – ein `data:`-URI kann keine Verläufe aus einem React-Baum beziehen, und
bei 16 px sieht man ohnehin keinen.

## Druckansicht (Aufkleber)

Der Aufkleberbogen für Lagerplätze ist die erste Stelle mit einer echten Druckausgabe
(`@media print` in `globals.css`, siehe `lager.md`). Drei Dinge sind dort Absicht:

- **`visibility` statt `display`** zum Ausblenden aller anderen Elemente. `display:none` an
  einem Vorfahren nimmt den Bogen mit; `visibility` erhält den Seitenaufbau, und der Bogen kann
  sich mit `visibility:visible` wieder sichtbar machen.
- **`print-color-adjust:exact`**, sonst sparen manche Browser den schwarzen QR-Code beim Drucken
  weg und übrig bleibt ein leerer Rahmen.
- **`break-inside:avoid`** je Aufkleber, damit keiner über einen Seitenumbruch zerrissen wird.

Wer weitere Druckausgaben baut (Rechnungen, Roadmap Phase 5), setzt darauf auf, statt eine
zweite Druckmechanik daneben zu stellen.
