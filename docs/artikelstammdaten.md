# Artikel (Artikelstammdaten / Leistungen)

Migration 12 (+ 14), Tabellen `articles`, `article_prices`, `order_articles` – erster Baustein
Richtung ERP: ein zentrales Artikelverzeichnis für Dienstleistungen/Artikel, die einem
Auftrag zugeordnet werden können. Eigene Kachel **"Artikel"** in der Hauptnavigation (vorher
ein Unter-Tab im Admin-Bereich, siehe `roadmap.md`).

## Datenmodell

- `articles`: `article_number` (beim Anlegen automatisch von der Datenbank vorbelegt,
  Migration 14 – in der Artikel-Übersicht aber bewusst frei überschreibbar, für Artikel(-
  gruppen) mit eigenen Nummernfolgen; die Unique-Constraint verhindert Dopplungen),
  `short_name`/`long_name`/`active`. Die Tabelle selbst ist die Single Source of Truth für die
  Artikelliste (siehe `konstanten-register.md`) – nichts davon steht als Konstante im Code.
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
  halbe Reifenwechsel gibt es nicht), Rabatt-%
  (**individuell je Zuordnung**, nicht am Artikel), sowie Nettopreis/MwSt. als
  **Schnappschuss** zum Zuordnungszeitpunkt, damit eine spätere Preisänderung bereits
  zugeordnete Positionen nicht rückwirkend verändert.

Rabatte werden bewusst NICHT am Artikel hinterlegt, sondern individuell bei der Zuordnung
zu einem Auftrag vergeben.

## UI

- **Zuordnung zu einem Auftrag**: wiederverwendbare Komponente `ArticleAssignPanel` –
  eingebunden direkt inline in der Kundendetail-Ansicht unter jedem Auftrag
  (`CustomerOrderRow`) sowie als Popover (`openArtMenu`/`artMenuFor`, gleiches Muster wie die
  Mitarbeiter-Zuordnung, siehe `auftraege-termine-einsatzplanung.md`) über die
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

## Noch offen

Buchhaltung/Rechnungsstellung ist bewusst noch nicht Teil davon, kann aber auf
`order_articles` aufsetzen (siehe `roadmap.md`). Die dafür nötige Nachvollziehbarkeit
(Urheber-Spalten, Änderungsprotokoll, Soft-Delete) steht seit Phase 11.

## Kennzeichen „braucht Lagerplatz" (Migration 22)

Jeder Artikel hat einen Haken `braucht_lagerplatz`, zu setzen im Artikelstamm unter der
Kurz-/Langbezeichnung. Er bedeutet: bei dieser Leistung geht etwas ins Lager.

Steht eine so gekennzeichnete Leistung in einem Auftrag, **lässt die Datenbank den Abschluss
nicht zu**, solange kein Lagerplatz belegt ist (erweiterter Statuswechsel-Trigger, siehe
`lager.md` und `auftragsablauf.md`). Migration 22 setzt den Haken einmalig bei Artikeln, deren
Name „einlager" enthält – ab dann wird er hier gepflegt.

Warum das Kennzeichen am Artikel hängt und nicht als Name im Code steht: kommt später „Felgen
einlagern" oder „Dachbox" dazu, wird ein Haken gesetzt statt Code geändert. Ein Vergleich auf
„Reifeneinlagerung" wäre beim ersten Umbenennen still kaputt.
