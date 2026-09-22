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
  klein sofort als "Navigation/Karte" erkennbar bleiben soll, siehe `auftraege.md`. Er steht
  **frei**, ohne runde Farbfläche darunter –
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
Der Grund steht in `auftraege.md`: hier werden Positionen erfasst, und genau daran ist
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
  `SEKUNDAERE_TABS` (`lib/module.ts`) bestimmt, wann der "Weitere"-Button dort aktiv markiert
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

**Das Muster trägt nur, solange über der Tabelle nichts wachsen kann.** „Kopf bleibt stehen,
die Tabelle scrollt für sich" steht und fällt mit `.modul-flaeche{flex:1; min-height:0}` – aber
in einer Flex-Spalte schrumpfen Kinder standardmäßig, wenn der Platz nicht reicht. Baut jemand
über `.modul-tabelle` etwas ein, das selbst wachsen will (ein Kalender, ein Stundenraster, eine
zweite Tabelle), nimmt sich dieses Element den Platz, den es beansprucht, und die Fläche
darunter wird zusammengedrückt statt zu scrollen. Dreimal unabhängig voneinander gefunden:
Stundenraster, Monatskalender, Tagestabellen der Einsatzplanung. Beim Stundenraster (`.raster`)
sichtbar als: Bei 760 px Fensterhöhe endete der Tag um 16:00, und es gab nichts zum Scrollen,
weil die Fläche nie höher war als der Bildschirm – die Stunden danach waren schlicht
abgeschnitten. **Regel: Ein Element über `.modul-tabelle`, dessen Höhe die eigentliche Aussage
ist (ein Kalender, ein Tagesraster), braucht selbst `flex:0 0 auto` – sonst wird die Seite
nicht enger und scrollbar, sondern nur enger.**

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
2. **Inline im Quelltext statt als Datei unter `public/`.** Zum Zeitpunkt dieser Entscheidung
   gab es noch kein `public/`-Verzeichnis (das kam erst mit dem PWA-Ausbau ab dem 07.09.2026
   dazu), und Dateien wurden einzeln über die GitHub-Oberfläche hochgeladen – eine Binärdatei
   wäre ein zusätzlicher, leicht zu vergessender Schritt gewesen. Vor allem aber lässt
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

Wer weitere Druckausgaben baut, setzt darauf auf, statt eine zweite Druckmechanik daneben zu
stellen. Die Rechnung (siehe nächster Abschnitt) tut das seit 18.09.2026.

## Grundsatz: Seitenränder beim Druck gehören ins `@page`, nicht ins Padding

Wer eine mehrseitige Druckausgabe baut, setzt die Ränder über die `@page`-Regel und **nicht**
als `padding` am Wurzelelement der Seite. Ein Innenabstand auf einem Element wirkt beim Drucken
nur auf **Seite 1**: Läuft der Inhalt über mehrere Blätter, sitzt der Text auf Seite 2 an der
Papierkante, weil kein Browser das Padding auf Folgeseiten wiederholt.

Das war kein theoretisches Risiko, sondern an einer 14-Positionen-Rechnung nachgestellt: Der
Girocode-Block, der eigentlich mit Rand unten auf der Seite steht, klebte auf Seite 2 oben am
Blattrand. Seitdem gilt für jede Druckausgabe hier:

- Die Seitengröße und die Ränder stehen in einer **`@page`-Regel**, nicht im `padding` des
  gedruckten Elements (Beispiel: `RECHNUNG_SEITE_CSS` in `lib/constants.ts`, siehe nächster
  Abschnitt).
- Eine `@page`-Regel gilt für das **ganze Dokument** und lässt sich nicht je Element
  umschalten. Zwei Druckausgaben mit unterschiedlichem Seitenformat (hier: der Etikettenbogen
  von der Rolle mit 50 × 30 mm und die Rechnung mit A4) dürfen ihre `@page`-Regel deshalb nicht
  beide fest in `globals.css` stehen haben – sie kämen sich in die Quere. Stattdessen hängt das
  jeweilige Fenster seine eigene `@page`-Regel per `<style>` ein, solange es offen ist, und
  nimmt sie beim Schließen wieder mit.
- Fällt das Padding beim Drucken weg, braucht das Element eine Ersatz-Mindesthöhe, damit eine
  kurze Ausgabe nicht in der Blattmitte endet, sondern die Fußzeile weiterhin am unteren
  Seitenrand steht (`min-height` = Papierhöhe minus der beiden `@page`-Ränder).

## Rechnung als Dokument (18.09.2026)

Die Rechnung ist nach dem Aufkleberbogen die zweite echte Druckausgabe und die erste mit
mehreren Seiten. `RechnungDokument` ist die **einzige** Komponente für Bildschirmvorschau und
Druck – es gibt keine zweite Fassung, die beim Ausdruck abweichen könnte.

**Das Layout ist in Millimetern gesetzt, nicht in Pixeln** (`.rechnungsseite` in
`globals.css`: `width:210mm; min-height:297mm; padding:15mm 20mm 10mm 25mm;`) – eine Rechnung
hat eine physische Größe, dieselbe Überlegung wie beim Etikett. Die Ränder folgen DIN 5008
(links 25 mm Lochrand, rechts 20 mm, oben 15 mm), das Anschriftenfeld (`.re-anschrift`, 85 ×
40 mm) sitzt im Sichtfenster eines DIN-lang-Umschlags.

In der Bildschirmvorschau wird die 210-mm-Seite über `transform:scale(var(--re-zoom))`
verkleinert dargestellt, gestaffelt nach Fensterbreite (82 % im breiten Rechnungsfenster,
62 % darunter) – **nie mit kleinerer Schrift**, sonst wären Vorschau und Ausdruck zwei
verschiedene Layouts, deren Unterschied man erst beim Kunden bemerkt.

**Die Seitenränder kommen aus `@page`, nicht aus dem Padding der Seite** – der Regelfall aus
dem Abschnitt oben, hier konkret: `RECHNUNG_SEITE_CSS` in `lib/constants.ts`
(`"@page { size: A4; margin: 15mm 20mm 10mm 25mm; }"`) wird von `RechnungModal` und
`RechnungenPanel` jeweils per `<style>` eingehängt, solange der Dialog offen ist – **nicht**
fest in `globals.css`, weil das dem 50 × 30-mm-Etikettendruck in die Quere käme. Beim Drucken
fällt `.rechnungsseite` deshalb auf `padding:0; min-height:272mm` zurück (297 − 15 − 10 mm),
damit die Fußzeile bei einer kurzen Rechnung am unteren Rand bleibt statt in der Blattmitte zu
landen.

**Die Fußzeile** (`.re-fuss`) steht in einer dreispaltigen Grid-Zeile am Ende des Dokuments;
`margin-top:auto` in der Flex-Spalte `.rechnungsseite` schiebt sie bei einer kurzen Rechnung
an den unteren Seitenrand und bei einer langen ans Ende des Textes – beides ist richtig, eine
Fußzeile mittig auf einer halbvollen Seite wäre es nicht.

**Der Girocode** (`.re-giro`, EPC-QR nach dem europäischen Verfahren, erzeugt über die
Bibliothek `qrcode`) steht wie jede Position `break-inside:avoid; page-break-inside:avoid`,
damit ihn kein Seitenumbruch zerreißt. Er wird nur gerendert, wenn die Rechnungsnummer bereits
feststeht (nicht im Entwurf) und eine IBAN hinterlegt ist – Details zur Berechnung stehen in
`rechnungen.md`, dieser Abschnitt hier beschreibt nur die Druck-/Layout-Seite.

`.re-tabelle tr{break-inside:avoid; page-break-inside:avoid;}` verhindert zusätzlich, dass eine
einzelne Position über den Seitenumbruch zerrissen wird – Bezeichnung auf Seite 1, Betrag auf
Seite 2 wäre genau die Zeile, über die ein Kunde anruft.

## Drucken aus einem Fenster (21.09.2026)

**Grundsatz: Gedruckt wird immer aus einem Fenster heraus, und ein Fenster ist
Bildschirm-Möblierung.** Die Rechnung, die Reifensatz- und Rad-Etiketten, der Aufkleberbogen –
in allen drei Fällen liegt der druckbare Inhalt in einem `.modal-overlay` mit
`position:fixed`, eigener Rollfläche und Höhenbegrenzung in `vh`. Für den Ausdruck zählt nur,
was darin steht; alles, was das Fenster zu einem Fenster macht, muss vorher weg – sonst druckt
der Browser das Fenster als Möbelstück mit, statt seinen Inhalt als Dokument zu behandeln.

**`overflow:hidden` verhindert den Seitenumbruch – das ist die eigentliche Lehre, und sie gilt
für jedes künftige Layout, nicht nur für `#app`.** Ein Element mit `overflow:hidden` wird vom
Browser nicht über mehrere Papierseiten hinweg umgebrochen: Es muss ganz auf eine Seite passen
oder wird abgeschnitten. `#app` trägt `overflow:hidden`, weil es auf dem Bildschirm ein Raster
in Fensterhöhe ist (siehe „Das Grundlayout ist ein Raster" oben), und die Modulfläche darunter
trägt `overflow:auto` – beim Drucken ist beides gleich fatal. Nachgemessen am 21.09.2026: Mit `overflow:hidden` wurden aus vier Rad-Etiketten (je
eine Seite) eine einzige Seite mit dem ersten Etikett, der Rest fiel weg; dieselbe Falle hätte
eine zweiseitige Rechnung auf eine Seite gekürzt. Jeder Vorfahre eines künftigen Druck-Layouts
mit `overflow:hidden` (oder `auto`/`scroll`, die sich beim Drucken gleich verhalten) deckelt
den Ausdruck auf eine Seite, unabhängig davon, wie lang der Inhalt darunter ist.

**iOS Safari druckt den Inhalt eines `position:fixed`-Elements nicht mit.** Am Rechner kam die
Rechnung sauber heraus, am iPhone (Safari) ein leeres Blatt – bei der Rechnung wie bei den
Etiketten, gemeldet aus dem Betrieb am 21.09.2026. Da jedes Fenster hier `position:fixed` ist,
muss es für den Druck zu einem gewöhnlichen Block im Textfluss werden.

**Drei Mechanismen wirken zusammen, jeder auf einer anderen Ebene** (`@media print` am Ende von
`globals.css`):

1. **`body *:not(:has(.druck-fenster)):not(.druck-fenster):not(.druck-fenster *){display:none}`**
   (Layout-Ebene) nimmt alles außer dem druckenden Fenster aus dem Seitenaufbau – nicht nur aus
   dem Blick, sonst schöbe die unsichtbare Oberfläche leere Seiten vor den Ausdruck. Die Klasse
   `.druck-fenster` sitzt an den drei druckbaren Fenstern (`RechnungModal.tsx`,
   `ReifensatzEtikett.tsx`, `LagerplatzAufkleber.tsx`), bewusst nicht an `.modal-overlay`
   allgemein: Beim Drucken der Rechnung steht das Auftragsfenster noch offen, und ohne eigene
   Klasse käme es mit aufs Blatt.

   **Die Regel fragt den Baum, sie rät nicht.** Der erste Versuch am 21.09.2026 war
   `#app > *{display:none}` plus `#app > .druck-fenster{display:block}` – gebaut auf die
   Annahme, das Fenster sei ein direktes Kind von `#app`. Die Annahme stimmte nicht, und das
   Ergebnis war ein leeres Blatt, jetzt auch am Rechner. `:has()` stellt stattdessen jedem
   Element dieselbe Frage: Steckt das Druckfenster in dir? Vorfahren bleiben, das Fenster und
   sein Inhalt bleiben, alles andere fällt weg – unabhängig davon, wie tief das Fenster hängt.
   Fehlt einem Browser `:has()`, wird die Regel als Ganzes verworfen und die Oberfläche druckt
   mit; unschön, aber lesbar. Ein leeres Blatt wäre die schlechtere Rückfallebene.
2. **Jeder Vorfahre des Fensters, das Fenster selbst und `.modal-box` werden zu gewöhnlichen
   Blöcken** (`body *:has(.druck-fenster), .druck-fenster, .druck-fenster .modal-box`):
   `position:static`, keine feste Höhe, kein `overflow`, kein Hintergrund, kein `transform`.
   Das behebt beides auf einmal – die `overflow:hidden`-Falle und das `position:fixed`-Problem
   auf iOS – und zwar auf der ganzen Kette, nicht nur an einer vermuteten Stelle. `!important`
   ist hier kein Komfort: In der Kette liegt `#app` (ID-Regel, wiegt schwerer als jede Klasse),
   und die Aufkleber-Fenster setzen `position:relative` als Inline-Attribut am Element
   (`style={{ position: "relative" }}`), was jede gewöhnliche Regel im Stilblatt schlägt.
3. **`visibility:hidden` (Aufkleberbogen/Rechnungsseite) und `.druck-weg{display:none}`**
   bleiben als zweite Sicherung bestehen. Sie lösen ein anderes Problem als Punkt eins und
   zwei: Sie legen fest, was von dem jetzt sichtbaren Fenster gedruckt wird – nicht, ob das
   Fenster am Seitenumbruch teilnimmt. `visibility` erhält dabei den Seitenaufbau des
   verbliebenen Inhalts (siehe „Druckansicht (Aufkleber)" oben); `.druck-weg` entfernt
   einzelne Bedienelemente innerhalb des Fensters ganz aus dem Layout – Schließen-Knopf,
   Überschriften, Filterleisten, Hinweistexte, die zwar im Fenster stehen, aber nicht aufs
   Papier gehören.

**Die Seitenränder kommen weiterhin aus `@page`, nicht aus dieser Regel** – siehe den
Grundsatz oben („Seitenränder beim Druck gehören ins `@page`, nicht ins Padding"). Die drei
Mechanismen hier entscheiden nur, WAS gedruckt wird und dass es sich über mehrere Seiten
umbrechen darf; WO auf dem Papier es steht, bestimmt weiterhin `@page`.

## Etikett-Hochformat: die Anordnung leitet sich aus den Maßen ab (21.09.2026)

**Grundsatz: Ob QR-Code und Text neben- oder untereinander stehen, ist kein eigenes Feld,
sondern eine Ableitung aus Breite und Höhe.** Ist ein Etikett höher als breit, steht der
QR-Code OBEN über die volle Breite und der Text darunter – Beispiel: die Rolle 50 × 80 mm, die
im Betrieb liegt. Ist es breiter als hoch, bleibt es bei QR-Code links, Text rechts. Die Regel
dazu ist `.etikett.hoch` in `app/globals.css`:

```
.etikett.hoch{flex-direction:column;align-items:center;justify-content:flex-start;gap:2.1mm;}
.etikett.hoch .etikett-qr{width:var(--etikett-qr,44mm);height:var(--etikett-qr,44mm);}
.etikett.hoch .etikett-text{width:100%;flex:0 0 auto;}
```

Die Klasse `hoch` wird gesetzt, wenn `hoeheMm > breiteMm` des gewählten Formats gilt
(`hochformat` in `ReifensatzEtikett.tsx`) – zwei Zahlen, die schon als `ETIKETT_FORMATE`-Eintrag
vorliegen, statt ein zweites Mal als Schalter gepflegt zu werden. Zwei Angaben, die dasselbe
sagen, laufen sonst irgendwann auseinander.

**`lib/etikettBild.ts` zeichnet dieselbe Anordnung ein zweites Mal, auf eine Leinwand, für das
Etikett als geteiltes PNG** (Knopf „Als Bild teilen", siehe `docs/lager.md`). Diese Dopplung ist
bewusst und nicht vermeidbar: Ein HTML-Element in ein Bild zu verwandeln geht im Browser nur
über Fremdbibliotheken oder `foreignObject`, und beides ist ausgerechnet in Safari unzuverlässig
– dort, wo dieser Weg gebraucht wird. `etikettZeichnen()` prüft dieselbe Bedingung
(`masse.hoeheMm > masse.breiteMm`) und positioniert QR-Code und Text dann exakt wie das CSS.
**Wer die Anordnung ändert, ändert beide Stellen** – `.etikett`/`.etikett.hoch` in
`globals.css` UND `etikettZeichnen()` in `lib/etikettBild.ts`; nur die Geometrie ist gedoppelt,
nicht der Inhalt (der kommt in beiden Fällen aus derselben Liste `etiketten` in
`ReifensatzEtikett.tsx`).

## Große Zahl UND Tastatur: das Profiltiefe-Feld

Das Messfeld im Radbild (`.rad-wert-gross` mit `input.rad-wert-feld`) ist ein Fall, an dem
zwei Regeln dieses Stilblatts aufeinandertreffen – beide richtig, beide hier zu beachten:

1. **Die mobile 16-px-Regel am Dateiende** vergrößert jedes Eingabefeld auf mindestens 16 px,
   damit Safari beim Antippen nicht hineinzoomt. Beim Messfeld wirkt sie umgekehrt: Es steht
   bei 30 px, die Regel würde es also auf die Hälfte **verkleinern**. Deshalb ist
   `.rad-wert-feld` in der Ausschlussliste dieser Regel eingetragen – sichtbar dort, wo die
   Regel formuliert ist, und nicht als `!important` an anderer Stelle.
2. **Eine Klasse allein reicht gegen `input[type=text]` nicht.** Die Grundregel für Textfelder
   trifft über einen Typ-Selektor und wiegt damit schwerer als eine Klasse. Der Selektor heißt
   deshalb `input.rad-wert-feld`, nicht `.rad-wert-feld`. Nachgemessen, nicht angenommen: mit
   der Klasse allein blieb das Feld bei 13 px und voller Breite.

Der farbige Rahmen (rot/orange/grün nach `profilLage()`) sitzt am umschließenden `label`, nicht
am Feld. So bleibt die Farbe dort, wo sie vorher war, und die ganze Fläche – Zahl samt Einheit
– ist antippbar statt nur die Ziffern.

## Betriebsdaten-Maske (18.09.2026)

`.betriebsdaten` (Admin-Bereich, `BetriebsdatenPanel`) ist die Eingabemaske für Briefkopf,
Bankverbindung, Logo, Rechnungstexte und den Nummernkreis – Details zu den Feldern stehen in
`rechnungen.md`, hier geht es um die Gestaltung:

- **`.bd-raster`** ist am Desktop zweispaltig, am Handy (`@media max-width:720px`) einspaltig.
  Zwei Spalten deshalb, weil PLZ und Ort auch im gedruckten Briefkopf eine Zeile bilden – ein
  Formular, das anders gruppiert als sein Ergebnis, lässt den Nutzer zweimal überlegen. Felder,
  die die volle Breite brauchen (Anschreiben, Fußzeilentexte), tragen zusätzlich `.breit`
  (`grid-column:1 / -1`).
- **`.bd-logo-feld`** zeigt das Logo vor einem hellen Karomuster statt vor durchgehendem Weiß.
  Ein Logo mit durchsichtigem Hintergrund ist auf Weiß sonst nicht von einem mit weißem
  Hintergrund zu unterscheiden – und genau das ist die Frage, die man beim Hochladen beantwortet
  haben will.
- **`.bd-nummer`** (der Nummernkreis) sitzt mit eigener Trennlinie am Ende der Maske, bewusst
  getrennt vom übrigen, sofort speicherbaren Formular – ein falsch gesetzter Wert hier erzeugt
  doppelt oder übersprungen vergebene Rechnungsnummern und verdient einen eigenen,
  unübersehbaren Bedienschritt.
- **`.bd-speichern` klebt bewusst nicht am unteren Rand.** Ein schwebender Speichern-Balken
  verdeckt genau das Feld, das man zuletzt bearbeitet hat – im Browser nachgesehen, lag er
  mitten auf dem Logo-Block und schnitt dessen zweiten Knopf ab. Die Maske ist kurz genug, dass
  man zum Speichern nicht weit scrollen muss.

## Einsatzplanungs-Tabellen: feste Breiten statt Inhalts-Raten

Untereinander stehen in der Einsatzplanung mehrere Tages-Tabellen, eine je Mitarbeiter. Ohne
feste Breiten rechnet jede ihr Spaltenraster aus dem eigenen Inhalt aus – ein kurzer
Kundenname in der einen, ein langer in der nächsten –, und die Spalten springen von Block zu
Block; das Auge muss in jeder Tabelle neu suchen, wo die Uhrzeit steht.

`.tages-tabelle{table-layout:fixed; width:100%;}` legt die Breiten **vor** dem Inhalt fest,
über eine `<colgroup>` (`col.tt-zeit` 132px, `col.tt-fahrzeug` 120px, `col.tt-status` 104px) –
damit liegen alle Blöcke im selben Raster, egal was darin steht. Was nicht passt, bekommt
`overflow:hidden; text-overflow:ellipsis` statt die Spalte zu sprengen; bei fester Breite ist
das keine Kosmetik, sondern die Bedingung dafür, dass die Breite überhaupt hält. Am Handy ist
für die vier festen Spalten kein Platz, die Tabelle bekommt dort eine Mindestbreite
(`min-width:560px`) und scrollt waagerecht statt die Spalten zu stauchen.

**`.tabelle-breit`** (`overflow-x:auto`) ist die allgemeine Variante desselben Gedankens für
eine breite Tabelle auf einer Seite, die als Ganzes scrollt: nur seitlich, nicht zusätzlich
senkrecht – zwei Rollbalken übereinander sind einer zu viel.

**`.pz-kontext`** (Protokollzeilen, Migration 36, Admin-Bereich und Auftragsfenster) folgt
derselben Idee im Kleinen: Woran gearbeitet wurde – Auftrag und Kunde, aus den Kennungen
aufgelöst – steht in einer eigenen Zeile unter der Handlung, mit `overflow:hidden;
text-overflow:ellipsis`, statt in denselben Satz eingebaut zu sein. Ein langer Kundenname
bricht damit am Handy nicht mitten in „X hat Y angelegt".

## Navigation: eine Liste, zwei Darstellungen (10.09.2026)

Die Module standen zweimal von Hand aufgezählt – als Seitenleiste (Desktop) und als
Kachelseite „Weitere" (Handy). Das ging so lange gut, bis jemand ein Modul ergänzte: Am
10.09.2026 fehlten **Saisonliste und Artikelstamm auf dem Handy**, wochenlang unbemerkt, weil
am Schreibtisch alles da war.

Seitdem gibt es `lib/module.ts`: Reiter, Beschriftung, Kachelsatz, Symbol, Sichtbarkeitsregel
und Trenner stehen einmal da; Seitenleiste und Kachelseite erzeugen sich daraus. Das ist die
Konstanten-Regel aus `README.md`, angewandt auf die Navigation.

`tests/navigation.test.ts` hält vier Zusagen fest: keine doppelten Reiter, jedes Modul hat
Beschriftung und Kachelsatz, jedes verweist auf ein Recht, das es in `RECHTE_VORGABE`
wirklich gibt (sonst wäre es für alle außer dem Superadmin unsichtbar – und niemand suchte
den Grund in einer Tabelle mit Voreinstellungen), und hinter „Weitere" stehen genau die
nicht-primären Module.

**Ein neues Modul braucht ab jetzt genau drei Handgriffe:** Eintrag in `lib/module.ts`,
Schlüssel in `RECHTE_VORGABE`, und der Block, der es rendert. Alles andere folgt.

## Fahrzeug-Block am Handy: Raster statt Umbruch (21.09.2026)

`.rd-fahrzeug` (eine Zeile im Block „Fahrzeug" am Auftrag, `FahrzeugeBlock.tsx`) reiht am
Desktop vier Dinge nebeneinander: Nummer, Kennzeichen, Kilometerstand-Feld, Löschkreuz
(`display:flex; flex-wrap:wrap`). Für die Zeile ist am Handy keine Breite für alle vier da; vor
dem 21.09.2026 brach sie deshalb einfach um, und das Kreuz landete allein in der nächsten Zeile
ganz links – ein Löschknopf, der neben nichts steht und aussieht, als gehöre er zum Eintrag
darunter statt zu dem darüber.

Unter `560px` gilt seither ein festes Raster statt des Umbruchs:

```
grid-template-columns: 1fr auto;
grid-template-areas: "nr weg" "kennzeichen kennzeichen" "km km";
```

Nummer und Löschkreuz stehen oben in einer Zeile (das Kreuz am rechten Rand, wo es der Daumen
erreicht), darunter über die volle Breite das Kennzeichen, darunter der Kilometerstand. Stehen
mehrere Fahrzeuge am Auftrag, braucht das Auge eine Grenze zwischen ihnen – sonst liest sich das
Kennzeichen des einen wie die Fortsetzung des anderen: `.rd-fahrzeug + .rd-fahrzeug` bekommt
deshalb in derselben `@media`-Regel eine gestrichelte Trennlinie oberhalb (`border-top:1px dashed
var(--border)`).
