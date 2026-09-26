# Artikel (Artikelstammdaten / Leistungen)

Migration 12 (+ 14), Tabellen `articles`, `article_prices`, `order_articles` – erster Baustein
Richtung ERP: ein zentrales Artikelverzeichnis für Dienstleistungen/Artikel, die einem
Auftrag zugeordnet werden können. Eigene Kachel **"Artikel"** in der Hauptnavigation (vorher
ein Unter-Tab im Admin-Bereich).

## Datenmodell

- `articles`: `article_number` (beim Anlegen automatisch von der Datenbank vorbelegt,
  Migration 14 – in der Artikel-Übersicht aber bewusst frei überschreibbar, für Artikel(-
  gruppen) mit eigenen Nummernfolgen; die Unique-Constraint verhindert Dopplungen),
  `short_name`/`long_name`/`active`. Dazu, seit Migration 46/48/50, `abrechnungsart`,
  `fragt_einlagerung`, `einheit` und `freitext` – siehe „Abrechnungsart, Lagergebühr und freie
  Position" unten. Die Tabelle selbst ist die Single Source of Truth für die Artikelliste
  (siehe `konstanten-register.md`) – nichts davon steht als Konstante im Code.
- `article_prices`: eigene **Preis-Historie** je Artikel (`net_price`, `vat_rate`,
  `valid_from`/`valid_to`) statt nur eines einzigen aktuellen Preises – beim Anlegen eines
  neuen Preises wird ein noch offener vorheriger Zeitraum automatisch einen Tag vor dem
  neuen `valid_from` geschlossen (`addArticlePrice` in `app/page.tsx`). Helfer
  `currentArticlePrice(prices, datum?)` in `lib/helpers.ts` ermittelt den zu einem Stichtag
  gültigen Preis. Eine bereits erfasste Zeile lässt sich **korrigieren** (`updateArticlePrice`)
  oder **entfernen** (`deleteArticlePrice`) – gedacht für den Tippfehler direkt nach der
  Eingabe. Ohne das bliebe nur, einen zweiten Preis nachzuschieben und die falsche Zeile für
  immer in der Historie stehen zu lassen. Rückwirkend ist das ungefährlich, weil
  Auftragspositionen ihren Preis als Schnappschuss halten (siehe unten); überlappende
  Zeiträume werden vor dem Schreiben abgefangen und im Klartext gemeldet, statt den
  Datenbank-Constraint aus Migration 18 auflaufen zu lassen. Beim Entfernen übernimmt der
  unmittelbare Vorgänger das Ende der gelöschten Zeile, damit keine preislose Lücke entsteht.
- `order_articles`: Zuordnung eines Artikels zu einem Auftrag – Menge (immer **ganze
  Stückzahlen**: die Eingabefelder zählen in 1er-Schritten und runden auf mindestens 1;
  halbe Reifenwechsel gibt es nicht), `endpreis_netto` (**Endpreis statt Prozentrabatt**,
  individuell je Zuordnung, nicht am Artikel), Nettopreis/MwSt. als **Schnappschuss** zum
  Zuordnungszeitpunkt, damit eine spätere Preisänderung bereits zugeordnete Positionen nicht
  rückwirkend verändert, sowie `note` – der Text auf der Rechnung (siehe unten).

Ein Endpreis statt eines Rabatts: Im Gespräch läuft es „das kostet 50, wir machen 40" – der
Endpreis ist die Aussage, wie viel Nachlass das ist, rechnet die Anwendung aus und zeigt es
daneben. `endpreis_netto = null` heißt „kein Sonderpreis" (dann gilt Menge × Listenpreis) und
ist etwas anderes als `0`, was „geschenkt" bedeutet. Einen Prozentrabatt (`discount_percent`)
gab es bis Migration 38; Migration 39 hat die Spalte entfernt, weil ein alter Prozentwert ohne
den Preis, auf den er sich bezog, in der Auswertung nichts mehr bedeutet.

## UI

- **Zuordnung zu einem Auftrag**: wiederverwendbare Komponente `ArticleAssignPanel` –
  eingebunden direkt inline in der Kundendetail-Ansicht unter jedem Auftrag
  (`CustomerOrderRow`) sowie als Popover (`openArtMenu`/`artMenuFor`, gleiches Muster wie die
  Mitarbeiter-Zuordnung, siehe `auftraege.md`) über die
  "Leistungen"-Spalte im Aufträge-Tab und in der Einsatzplanungs-Auftragsliste.
- **Artikel pflegen**: eigene Kachel **"Artikel"** (`components/admin/artikel/
  ArticleAdminPanel.tsx` + `ArticleDetailEditor.tsx`) – Sichtbarkeit steuert der
  Modul-Berechtigungs-Schlüssel `view.artikel` (Default: Admin + Nutzer, kein Techniker),
  tatsächliches Anlegen/Ändern bleibt per RLS nur Admin/Superadmin vorbehalten.

## Berechtigungen

Sehen der Artikel-Kachel: `view.artikel` in den Modul-Berechtigungen (Default Admin + Nutzer).
Pflegen (Artikel/Preise anlegen/ändern) dürfen weiterhin nur Admin/Superadmin (RLS-Policy über
`public.current_user_role()`, wie bei den anderen Modul-Berechtigungen). Die Zuordnung zu
einem Auftrag darf dagegen jeder eingeloggte Nutzer, wie bei `order_employees`.

## Startdaten

Migration 12 legt einen Start-Artikelstamm mit den sechs Dienstleistungen des mobilen
Reifenwechsel-Vorbilds an (Wechsel/Wuchten/Einlagerung/Entsorgung/Wäsche/Beratung), zunächst
ohne Preis – die tatsächlichen Preise werden im Admin-Bereich unter "Artikelstamm"
nachgetragen.

## Belegcharakter: nichts verschwindet spurlos

Seit Migration 19 wird eine einem Auftrag zugeordnete Leistung nicht mehr gelöscht, sondern nur
als gelöscht markiert (`order_articles.deleted_at`) – sie ist eine Belegposition mit
Preis-Schnappschuss. Wird der Auftrag oder der Kunde gelöscht, reicht ein Trigger die
Markierung durch, so wie es vorher die Kettenlöschung über die Fremdschlüssel tat. Die App
filtert überall auf `deleted_at is null`, für den Nutzer ändert sich dadurch nichts.

Seit Migration 18 verhindert außerdem ein Constraint überlappende Preiszeiträume je Artikel.
Bisher sorgte nur `insertArticlePrice()` dafür, den Vorgänger zu schließen – zwei gleichzeitige
Clients konnten Überschneidungen erzeugen.

## Rechnungsstellung

Buchhaltung/Rechnungsstellung ist seit Migration 48–50 gebaut und setzt genau auf
`order_articles` auf: Menge, Endpreis- bzw. Listenpreis-Schnappschuss, `einheit` und – bei
einem Freitext-Artikel – der eingetippte Text (`note`) werden zu Rechnungspositionen. Die dafür
nötige Nachvollziehbarkeit (Urheber-Spalten, Änderungsprotokoll, Soft-Delete) stand schon
vorher, seit Phase 11. Datenmodell, Nummernkreis, Lebenszyklus und Druck stehen in
`rechnungen.md`.

## Abrechnungsart, Lagergebühr und freie Position (Migration 46/48/50)

Vier Felder am Artikel, zusätzlich zu Kurz-/Langbezeichnung, die steuern, WIE und WOMIT eine
Leistung auf der Rechnung erscheint:

- **`abrechnungsart`** (`'normal'`, `'lagergebuehr'`, seit Migration 61 auch
  `'reifenverkauf_neu'` / `'reifenverkauf_gebraucht'`): Die beiden Reifenverkäufe öffnen im
  Auftrag die Reifensuche im Lager; Preis und Text der Position kommen vom Reifen, ein Preis am
  Artikel wird nicht gebraucht (die Artikelliste zeigt „vom Reifen" und zählt ihn nicht unter
  „ohne Preis"). Migration 61 legt „Reifen neu" und „Reifen gebraucht" an, falls es noch
  keinen Artikel dieser Art gibt. Zwei Artikel statt einem, weil gebrauchte Reifen steuerlich
  anders zu behandeln sein können (Differenzbesteuerung, mit dem Steuerberater klären) – dann
  lassen sie sich getrennt buchen. Details in `lager.md`, „Reifenverkauf".
  Zur Lagergebühr (Migration 46): „normal" wird
  eingetragen, sobald die Leistung erbracht ist – der Regelfall. „lagergebuehr" wird nie beim
  Einlagern verlangt, sondern beim Auslagern eines Reifensatzes vorgeschlagen, mit der Zahl der
  Lagermonate als Menge. Ersetzt `articles.braucht_lagerplatz` aus Migration 22: Jener Haken
  hatte zwei Aussagen in einem Feld getragen – „hier wird eingelagert" und „das kostet etwas" –
  und war beim Auslagern deshalb immer falsch herum, weil dort ein Platz frei statt belegt
  wird. Migration 46 hat den zugehörigen Abschluss-Zwang aus der Datenbank entfernt;
  `braucht_lagerplatz` steht als Spalte noch da, wird aber von keiner Stelle mehr gelesen.
  Details zum Auslagern-Dialog, zur Monatsrechnung und zur Langlieger-Schwelle stehen in
  `lager.md`.
- **`fragt_einlagerung`** (Migration 46): die brauchbare zweite Hälfte des alten Hakens – „bei
  dieser Leistung fallen Altreifen an". Sitzt an einem ANDEREN Artikel als die Gebühr, üblicher-
  weise am Wechsel/an der Montage statt an der Einlagerung selbst, und wurde von Migration 46
  deshalb bei keinem Artikel automatisch gesetzt. Steht ein so gekennzeichneter Artikel auf
  einem Auftrag und wurde nichts eingelagert, fragt das Auftragsfenster beim Abschließen einmal
  nach, ob der Kunde die alten Reifen mitnimmt – als Frage, nicht als Zwang: Abschließen lässt
  sich der Auftrag so oder so.
- **`einheit`** (Migration 48, Standardwert „Stück"): steht auf der Rechnung hinter der Menge –
  „4 Stück", „1 Fahrt". Freitext-Eingabe mit Vorschlagsliste (`EINHEITEN` in
  `lib/constants.ts`: Stück, Fahrt, Monate, Pauschal, Stunde) statt einer geschlossenen Auswahl,
  weil ein fünfter Wert absehbar ist und eine feste Liste dafür eine unnötige Grenze wäre.
- **`freitext`** (Migration 50): Der Techniker hilft vor Ort bei etwas, das in keinem Artikel
  steht, und vereinbart einen Preis – dafür gibt es „Sonstiges" & Co. Ohne den Haken ist der am
  Auftrag eingetippte Text (`order_articles.note`) eine Zusatzzeile UNTER der Artikelbezeichnung
  (z. B. „Reifenmontage", darunter „Radlager Reifen VR"); mit gesetztem Haken ERSETZT er sie auf
  der Rechnung – bleibt das Feld dort leer, steht ersatzweise wieder der Artikelname da, denn
  eine Zeile ganz ohne Bezeichnung gibt es nicht. Migration 50 setzt den Haken bei keinem
  Artikel automatisch, auch nicht bei einem, der „Sonstiges" heißt: Ein Betrieb kann seine
  Sammelposition anders nennen, und ein anderer hat einen echten Artikel, der zufällig so
  heißt.

Bei allen vieren dieselbe Überlegung: ein Haken bzw. Wert am Artikel statt einer Erkennung am
Namen im Code. Kommt morgen „Felgen einlagern" dazu oder wird „Sonstiges" in „Diverses"
umbenannt, wird im Artikelstamm umgestellt statt Code geändert – ein Vergleich auf einen
Artikelnamen wäre beim ersten Umbenennen still kaputt, und still kaputte Prüfungen sind
schlimmer als keine.

## Die Artikel-Seite (Entwurf „Q · Artikel", 26.09.2026)

Karten statt Tabelle: Nummer, Kurz- und Langbezeichnung, Marken (Lagergebühr · beim Auslagern,
fragt nach Altreifen, Text am Auftrag, inaktiv) und der heute gültige Preis mit Einheit. Suche
über Nummer und Bezeichnung, Filter Aktiv · Inaktiv · Ohne Preis · Alle. „Ohne Preis" zählt nur
aktive Artikel, die einen Preis brauchen – eine freie Position bekommt ihren Preis am Auftrag.

„+ Artikel" fragt Kurz- und Langbezeichnung ab und öffnet danach gleich das Blatt des neuen
Artikels. Im Blatt: Nummer, Bezeichnungen, Einheit, aktiv, Abrechnung als Umschalter, die beiden
Kennzeichen als Schalter – übernommen mit „Speichern" (mit Rückfrage beim Schließen, wenn etwas
geändert wurde). Die Preis-Historie steht als Zeitleiste darunter („heute gültig" orange);
„+ Neuer Preis ab …", Ändern und Löschen wirken sofort, wie bisher.

Am Auftrag (`ArticleAssignPanel`) kommt eine Leistung aus dem Blatt „Leistung hinzufügen" mit
Menge 1; Menge per −/+, Endpreis und Rechnungstext klappen unter der Zeile auf.

