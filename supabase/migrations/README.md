# Supabase-Migrationen

Jede Datenbank-Änderung landet hier als eigene, durchnummerierte Datei
(`01_schema.sql`, `02_lager.sql`, `03_auftraege.sql`, `04_fahrzeuge.sql`, …).
Bereits ausgeführte Dateien werden **nicht mehr verändert** – eine neue
Änderung bekommt immer die nächste freie Nummer und einen eigenen,
sprechenden Namen.

So bleibt nachvollziehbar, was in der Supabase-Datenbank bereits läuft und
was noch im SQL-Editor ausgeführt werden muss, ohne dass alte Befehle
überschrieben werden oder man durcheinanderkommt.

## Bereits ausgeführt

Stand 28.08.2026: alle Migrationen `01`–`14` sind im Supabase-SQL-Editor
ausgeführt, die Datenbank ist auf dem Stand dieses Ordners.

- `01_schema.sql` – Basis-Schema (Profiles, Kunden, Termine, Kontakt-Historie, Einstellungen)
- `02_lager.sql` – Lager-Modul (Lager, Lagerplätze, Reifen-Einlagerung)
- `03_auftraege.sql` – Aufträge-Modul
- `04_fahrzeuge.sql` – Fahrzeuge je Kunde
- `05_rollen_und_nutzerverwaltung.sql` – Rollen Superadmin/Admin/Techniker + Nutzerverwaltung
- `06_lager_historie.sql` – Lagerplatz-Historie (Einlagerungen werden beim Entfernen nur noch
  als "entfernt" markiert statt gelöscht, damit das Lager-Modul zeigen kann, was auf einem
  Lagerplatz gelaufen ist)
- `07_termine_auftraege_zusammenlegung.sql` – Termine gehen in Aufträge auf (Auftrag bekommt
  eine optionale Uhrzeit), neue Mitarbeiter-Tabelle für die Einsatzplanung. Übernimmt bestehende
  Termine einmalig nach `orders`, damit nichts verloren geht.
- `08_lager_einstellungen.sql` – Lageradresse (`warehouses.address`), damit beim Lager mehr
  Einstellungen hinterlegt werden können (Nummerierungslogik/Notiz brauchten keine
  Datenbank-Änderung, nur die Adresse ist neu).
- `09_modul_berechtigungen.sql` – neue Tabelle `module_permissions`: legt pro Modul fest,
  welche Rollen dort strukturelle Änderungen vornehmen dürfen (aktuell nur "lager" – Lager
  anlegen/löschen, Lagerplätze anlegen/löschen). Nur der Superadmin darf das ändern
  (im Admin-Tab unter "Modul-Berechtigungen").
- `10_modul_berechtigungen_matrix.sql` – befüllt `module_permissions` (aus Migration 09) mit der
  vollen, feingranularen Schlüssel-Liste der ausgebauten Modulverwaltung: pro Modul eine
  "view.<modul>"-Zeile (darf die Rolle das Modul überhaupt sehen?) sowie zusätzliche
  "action.<modul>.<x>"-Zeilen für einzelne Aktionen innerhalb eines Moduls (aktuell nur beim
  Lager: Reifen zuordnen, Lagerplätze anlegen/löschen, Lager anlegen/bearbeiten/löschen). Der
  alte Schlüssel "lager" aus Migration 09 wird dadurch nicht überschrieben, aber auch nicht mehr
  von der App gelesen. Steuerbar im Admin-Bereich unter "Modulverwaltung" (nur Superadmin).
- `11_auftraege_mehrere_mitarbeiter.sql` – neue Tabelle `order_employees`: ein Auftrag kann ab
  sofort mehreren Mitarbeitern zugeordnet sein (z. B. bei umfangreichen Aufträgen), statt nur
  einem einzigen wie bisher. Übernimmt bestehende Einzel-Zuordnungen aus
  `orders.assigned_employee_id` einmalig nach `order_employees`, damit nichts verloren geht; die
  alte Spalte bleibt danach ungenutzt in der Datenbank stehen.
- `12_artikelstammdaten.sql` – neue Tabellen `articles` (Kurz-/Langbezeichnung, aktiv/inaktiv),
  `article_prices` (Nettopreis + MwSt.-Satz mit "gültig von/bis" – volle Preis-Historie statt nur
  einem aktuellen Preis) und `order_articles` (Zuordnung von Artikeln zu einem Auftrag, mit
  Menge, Rabatt-% und einem Preis-Schnappschuss zum Zuordnungszeitpunkt, damit spätere
  Preisänderungen bereits zugeordnete Positionen nicht verändern). Artikel/Preise dürfen nur
  Admin/Superadmin pflegen (Governance, wie bei den Modul-Berechtigungen); die Zuordnung zu
  einem Auftrag darf jeder eingeloggte Nutzer, wie bei `order_employees`. Enthält außerdem einen
  Start-Artikelstamm mit den sechs Dienstleistungen des mobilen Reifenwechsel-Services (noch
  ohne Preis – die tatsächlichen Preise werden später im Admin-Bereich unter "Artikelstamm"
  gepflegt).
- `13_techniker_auftraege_rechte.sql` – echte, per RLS erzwungene Techniker-Rechte auf
  `orders` (Phase 4): eine Techniker-Rolle sieht nur noch Aufträge, denen ihr per Admin-Panel
  verknüpfter Mitarbeiter-Datensatz zugeordnet ist, darf keine Aufträge anlegen/löschen und darf
  an einem eigenen Auftrag ausschließlich `status` sowie die neue Spalte `techniker_notiz`
  ändern (alles andere lehnt ein Trigger ab). Neue Hilfsfunktion `public.current_employee_id()`.
- `14_artikel_nummer.sql` – fortlaufende, automatisch vergebene Artikelnummer
  (`articles.article_number`, neue Sequenz `article_number_seq`) für die Artikel-Übersicht
  (vorher "Artikelstamm" im Admin-Bereich, jetzt eigene Kachel "Artikel").

## Noch auszuführen

**In dieser Reihenfolge im Supabase-SQL-Editor ausführen – sie bauen aufeinander auf.**
Alle fünf gehören zur Sanierung aus `docs/architektur-review-2026-08.md` (Roadmap Phasen 6–11).

- `15_rls_haertung.sql` – schließt die kritischen Lücken: die Rollen-Spalte in `profiles` ist
  nicht mehr vom Nutzer selbst änderbar (bis hierher konnte sich jeder eingeloggte Account zum
  Superadmin machen), die security-definer-Funktionen bekommen einen fixierten `search_path`,
  die Techniker-Einschränkung aus Migration 13 ist nicht mehr über `order_employees`/
  `order_articles` umgehbar, der Spalten-Trigger arbeitet mit einer Positivliste, ein
  Lagerplatz kann nur noch eine aktive Belegung haben, und das Schema bekommt erstmals
  Indizes. Bereinigt vorhandene Doppelbelegungen im Lager automatisch (jüngste bleibt aktiv).
  Entfernt außerdem den nie funktionierenden ADMIN_EMAIL-Zweig aus `handle_new_user()`.
- `16_rechte_in_der_datenbank.sql` – macht `module_permissions` zur echten Zugriffskontrolle:
  neue Funktion `public.has_module_permission()`, und jede Tabelle bekommt getrennte
  SELECT/INSERT/UPDATE/DELETE-Policies, die sie abfragen. Vorher galt auf zehn Tabellen
  "jeder Eingeloggte darf alles". Gleicht außerdem den Berechtigungskatalog an den Stand von
  `lib/constants.ts` an (`view.artikel` ergänzt, `action.admin.employee_manage` neu, die
  überholten Techniker-Haken bei den Kunden-Schlüsseln entfernt, Altschlüssel `lager`
  gelöscht) und sperrt die tote Tabelle `appointments` für die API.
- `17_geocode_cache.sql` – Tabelle für die serverseitige Geokodierung
  (`app/api/geocode/route.ts`). **Muss zusammen mit dem Code dieser Auslieferung laufen**,
  sonst schlägt jede Adress-Geokodierung fehl (der Kunde wird trotzdem gespeichert, nur ohne
  Kartenposition).
- `18_audit_und_integritaet.sql` – Urheber-Spalten (`created_by`/`updated_by`), automatisches
  `updated_at`, ein Änderungsprotokoll (`audit_log`, nur für den Superadmin lesbar) auf allen
  Geschäftstabellen, dazu Eindeutigkeit der Lagerplatz-Codes je Lager und ein Constraint gegen
  überlappende Preiszeiträume. Die beiden Constraints legt die Migration nur an, wenn die
  vorhandenen Daten sie erfüllen – sonst erscheint ein Hinweis (`NOTICE`) statt eines Fehlers.
- `19_soft_delete.sql` – Kunden, Aufträge und Auftragspositionen werden nicht mehr hart
  gelöscht, sondern nur als gelöscht markiert (`deleted_at`); ein Trigger reicht die Markierung
  wie die frühere Kettenlöschung an Aufträge und Positionen weiter. **Muss zusammen mit dem
  Code dieser Auslieferung laufen** – ohne den Code filtert die App die markierten Zeilen nicht
  heraus und zeigt gelöschte Datensätze weiter an.

- `20_auftragsablauf.sql` – macht aus dem Auftragsstatus eine echte Zustandsmaschine
  (Konzept: `docs/auftragsablauf.md`). Neue Auftragsnummer, Fahrzeugbezug am Auftrag, Zustand
  „Storniert", Felder für Abschluss und Stornierung. Zwei Trigger: einer lässt nur die
  vorgesehenen Zustandswechsel zu und setzt die Zeitstempel selbst, der andere friert die
  Positionen eines abgeschlossenen Auftrags ein. **Muss zusammen mit dem Code dieser
  Auslieferung laufen** – die Oberfläche bietet sonst Handlungen an, die es in der Datenbank
  noch nicht gibt. Bestehende Aufträge bekommen ihre Nummer nach Anlagereihenfolge.

- `21_appointments_entfernen.sql` – entfernt die seit Migration 07 tote Tabelle
  `appointments` (Begründung: `docs/termine-kontakt-auftrag-analyse.md`, Abschnitt 2.7). Zwei
  Tabellen, die beide nach Terminen aussehen, waren eine dauerhafte Verwechslungsquelle. Das
  Skript prüft vorher, ob zu jeder Zeile ein passender Auftrag existiert, und **bricht ab**,
  falls nicht – dann steht dort unerwarteter Bestand, der erst geklärt gehört. Kein Zwang zur
  gemeinsamen Auslieferung mit dem Code: die App fasst die Tabelle seit Migration 07 nicht an.

- `22_lagerplatz_am_auftrag.sql` – bringt Lager und Aufträge zusammen (Konzept: `docs/lager.md`).
  `tire_storage.order_id` hält fest, aus welchem Auftrag eine Einlagerung stammt;
  `articles.braucht_lagerplatz` kennzeichnet Leistungen, bei denen etwas ins Regal geht. Der
  Statuswechsel-Trigger aus Migration 20 wird ersetzt: er lässt keinen Abschluss mehr zu,
  solange eine solche Leistung im Auftrag steht und kein Lagerplatz belegt ist. **Muss zusammen
  mit dem Code dieser Auslieferung laufen.** Vorhandene Artikel, deren Name „einlager" enthält,
  bekommen den Haken einmalig gesetzt – ab dann wird er in den Artikelstammdaten gepflegt.
  Für die QR-Aufkleber ist keine Änderung nötig: der Code enthält die vorhandene
  `storage_slots.id`.

- `23_kontaktergebnis.sql` – hält fest, was bei einem Kontakt herauskam (Konzept:
  `docs/kunden-und-karte.md`). `customers.kontakt_ergebnis` (auftrag | wiedervorlage |
  kein_interesse, als Prüfbedingung in der Datenbank) und `customers.wiedervorlage_am`. **Muss
  zusammen mit dem Code dieser Auslieferung laufen** – die Kartenfarben werten die Spalten aus.
  „Kein Interesse" setzt den Kunden bewusst NICHT automatisch auf inaktiv, die Begründung steht
  im Kopf der Datei.

- `24_firma_email_anrede.sql` – `customers.company`, `customers.email` und `customers.anrede`
  (Konzept: `docs/kunden-und-karte.md`). Anlass ist der Import der Altkundenliste, in der
  Firmen mit Ansprechpartner und E-Mail-Adressen bisher in fremden Spalten standen. **Muss vor
  `supabase/import/kundenimport_2026-08-29.sql` laufen** – das Importskript schreibt in diese
  Spalten.

- `25_adressvorschlaege_cache.sql` – Tabelle `adressvorschlag_cache` für die Adressvorschläge
  (Konzept: `docs/kunden-und-karte.md`). Gegenstück zu `geocode_cache` aus Migration 17, aber
  für eine andere Frage: dort eine Koordinate zu einer Adresse, hier eine Kandidatenliste zu
  einer Sucheingabe. Reiner Zwischenspeicher – die Rücknahme ist gefahrlos.

- `26_push_geraete.sql` – Tabelle `push_geraete` für die Push-Anmeldungen je Gerät (Konzept:
  `docs/benachrichtigungen-plan.md`). Erster Schritt der Terminerinnerung; zunächst nur für den
  Vortest („Testnachricht an mich" in den Einstellungen). **Muss zusammen mit dem Code dieser
  Auslieferung laufen** – die Routen unter `app/api/push/` schreiben in diese Tabelle.
  Zusätzlich müssen bei Vercel `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` gesetzt sein, sonst
  meldet der Versand einen Fehler. Der Schlüssel der Tabelle ist die Geräteadresse, nicht die
  Person – die Begründung steht im Kopf der Datei.

- `27_push_versand.sql` – Tabelle `push_versand`: hält fest, welche Terminerinnerung an wen
  schon rausgegangen ist. Der eindeutige Schlüssel (Auftrag, Person) ist die Doppelmeldungs-
  sperre – ohne sie schickt der Zeitgeber jede Minute des Erinnerungsfensters dieselbe
  Meldung. Bewusst RLS **ohne** Regeln: die Tabelle geht nur den serverseitigen Versand etwas
  an. Braucht `26`, `orders` (03) und `profiles` (01).

- `28_terminerinnerung_zeitgeber.sql` – schaltet `pg_cron` und `pg_net` ein und legt den
  Auftrag an, der jede Minute `/api/push/senden` aufruft. **Zwei Handgriffe von Hand:** die
  Erweiterungen einschalten (macht die Datei, sonst über Database → Extensions) und danach
  einmal Adresse und Geheimnis in `private.push_konfiguration` eintragen – das Geheimnis steht
  aus gutem Grund **nicht** in der Datei. Dasselbe Geheimnis muss bei Vercel als
  `PUSH_GEHEIMNIS` gesetzt sein, sonst weist die Route den Zeitgeber ab. Die Vorlage für das
  `insert` steht im Kopf der Datei. Braucht `27`.

- `29_push_versand_je_termin.sql` – nimmt den Terminzeitpunkt in den eindeutigen Schlüssel von
  `push_versand` auf. Vorher galt „einmal je Auftrag gesendet, nie wieder" – ein verschobener
  Termin bekam damit keine Erinnerung mehr, ausgerechnet dann, wenn sie am nötigsten wäre.
  **Muss zusammen mit dem Code dieser Auslieferung laufen** (`app/api/push/senden` schreibt die
  neue Spalte mit). Braucht `27`.

- `30_einlagerung_fahrzeug_und_saison.sql` – der eingelagerte Satz gehört ab jetzt zu einem
  **Kundenfahrzeug** (`tire_storage.vehicle_id`) und hat eine **Saison** (`saison`:
  sommer/winter/ganzjahr). Der alte Rückweg `vehicles.stored_tire_storage_id` entfällt – er
  war eine zweite, von Hand gepflegte Wahrheit. Zwei Regeln kommen dazu: das Fahrzeug muss dem
  Kunden der Einlagerung gehören (Trigger), und ein Auftrag mit Einlagerung lässt sich erst
  abschließen, wenn Fahrzeug und Saison stehen (Trigger, wie die Lagerplatz-Pflicht aus 22).
  **Muss zusammen mit dem Code dieser Auslieferung laufen.** Braucht `02`, `04`, `20`/`22`.
  Konzept: `docs/lager-ausbaukonzept.md`, Schritte A2 und A3.

- `31_saisonliste_berechtigung.sql` – nimmt `view.saison` in die Modulverwaltung auf. Die
  Anwendung läuft auch ohne (dann greift der eingebaute Standard), aber der Superadmin könnte
  das Modul sonst nicht freigeben oder entziehen. Braucht `09`/`10`.

- `32_firmenfahrzeuge.sql` – neue Tabelle `firmenfahrzeuge` (die eigenen Transporter) und
  `orders.firmenfahrzeug_id`. Bewusst getrennt von `vehicles`: „Fahrzeug" heißt im
  Kundenkontext das Auto des Kunden und im Einsatzkontext der eigene Wagen. Kennzeichen sind
  eindeutig (unabhängig von Groß-/Kleinschreibung und Leerzeichen), Pflegen nur
  Admin/Superadmin, Lesen jeder Angemeldete. Ausgemustert statt gelöscht. Braucht `03`, `05`
  und `18`. Konzept: `docs/lager-ausbaukonzept.md`, Block C.

Nach dem Ausführen bitte hier nach oben unter "Bereits ausgeführt" verschieben.

## Welche Migrationen sind wirklich gelaufen?

`PRUEFUNG_welche_migrationen_liefen.sql` beantwortet das, indem es die Datenbank selbst
befragt: Für jede Migration prüft es, ob das existiert, was sie anlegt. Nur lesend, beliebig
oft wiederholbar. Die erste Zeile nennt die Datenbank – der Abgleich gegen
`NEXT_PUBLIC_SUPABASE_URL` in Vercel beantwortet die Frage „bin ich im richtigen Projekt?",
die am 09.09.2026 eine Stunde gekostet hat.

Diese Liste hier bleibt trotzdem gepflegt: Sie sagt, WARUM etwas gemacht wurde. Das Skript
sagt nur, OB.

## Datenskripte (kein Schema)

`supabase/import/` enthält einmalige DATEN-Skripte. Sie sind bewusst keine Migrationen: sie
ändern kein Schema, sind nicht Teil der Aufbaureihenfolge einer leeren Datenbank, und wer eine
Instanz von Grund auf aufsetzt, will sie in aller Regel nicht mitlaufen lassen.

- `kundenimport_2026-08-29.sql` – die bestehende Kundenliste aus „Mappe1.xlsx" (422 Kunden,
  47 Fahrzeuge). Braucht Migration 24. Mehrfach ausführbar: eingefügt wird nur, was es unter
  demselben Namen und derselben Anschrift noch nicht gibt. Danach in der App unter
  **Admin → Wartung → Adressen geokodieren** die Kartenpositionen nachtragen.
  Die Prüfliste `pruefliste_kundenimport.xlsx` daneben führt jede Entscheidung auf, die bei der
  Aufbereitung getroffen wurde.

**Regel für alle künftigen Datenskripte: keine temporären Tabellen.** Der erste Entwurf des
Imports benutzte `create temporary table` und scheiterte im Supabase-SQL-Editor mit
`relation "_import_kunden" does not exist`. Der Editor arbeitet über einen Verbindungs-Pooler
und garantiert nicht, dass zwei aufeinanderfolgende Befehle dieselbe Sitzung sehen – eine
temporäre Tabelle gehört aber immer genau einer Sitzung. Rohdaten gehören deshalb als
`values`-Liste in den jeweiligen Befehl, und jeder Befehl muss für sich allein lauffähig und
wiederholbar sein. Aus demselben Grund kein `begin`/`commit` um mehrere Befehle: was der Pooler
auf verschiedene Verbindungen verteilt, kann keine gemeinsame Transaktion haben.

## Rücknahme-Skripte

Zu jeder dieser Migrationen liegt unter `rollback/` ein passendes Rücknahme-Skript
(`15_rollback.sql` … `25_rollback.sql`). Sie sind für den Notfall gedacht – wenn nach dem
Ausführen etwas nicht mehr funktioniert und kein sofortiger Fix zur Hand ist. Zwei Hinweise:

- **In umgekehrter Reihenfolge zurücknehmen** (25 vor 24 vor 23 …), sonst hängen Trigger und
  Policies in der Luft.
- `21_rollback.sql` stellt nur die leere Tabellenstruktur wieder her, nicht ihren Inhalt – die
  Zeilen von damals leben seit Migration 07 in `orders`. Das steht auch im Kopf des Skripts.
- Bei `19_rollback.sql` zuerst den Anwendungscode zurückdrehen, sonst tauchen als gelöscht
  markierte Datensätze wieder in allen Listen auf. Das steht auch im Kopf des Skripts.

Eine zurückgenommene Migration bleibt als Datei bestehen – sie wird korrigiert und erneut
ausgeführt, nicht gelöscht.

## Abhängigkeiten zwischen den Migrationen

Nur relevant, falls die Datenbank einmal von Grund auf neu aufgebaut wird – dann in der
Nummernreihenfolge ausführen. Die einzelnen Abhängigkeiten:

- `07` braucht `orders` (03) und `profiles` (01).
- `08` braucht nur `02_lager.sql`.
- `09` braucht `public.current_user_role()` aus `05`.
- `10` braucht die Tabelle aus `09`.
- `11` braucht `orders` (03) und `employees` (07).
- `12` braucht `orders` (03) und `public.current_user_role()` (05).
- `13` braucht `orders`/`order_employees` (03, 11) und `public.current_user_role()` (05).
- `14` braucht `articles` (12).
- `21` braucht `07` (die Zusammenlegung, die `appointments` überflüssig gemacht hat) und
  greift auf `orders` (03) zu, um die Sicherheitsprüfung zu machen.
- `26` braucht `profiles` (01) – sonst nichts.
- `27` braucht `26` (dieselbe Sache), `orders` (03) und `profiles` (01).
- `29` braucht `27` und muss zusammen mit dem passenden Anwendungscode laufen.
- `30` braucht `02` (tire_storage), `04` (vehicles) und `20`/`22` (Auftragsablauf) und muss
  zusammen mit dem passenden Anwendungscode laufen. Rücknahme stellt
  `vehicles.stored_tire_storage_id` wieder her und befüllt es aus `vehicle_id`.
- `28` braucht `27` und die Erweiterungen `pg_cron`/`pg_net`. Beim Zurücknehmen die umgekehrte
  Reihenfolge einhalten: erst `28` (Zeitgeber aus), dann `27` – sonst läuft der Versand jede
  Minute in eine fehlende Tabelle.
- `23`, `24` und `25` stehen für sich – keine Trigger, keine Funktionen. `23`/`24` brauchen
  `customers` (01), `25` gar nichts.
- `22` braucht `tire_storage` (02), `orders` (03), `articles`/`order_articles` (12) und ersetzt
  die Trigger-Funktion aus `20`. `22_rollback.sql` stellt genau diese Fassung wieder her –
  wer `20` zurücknimmt, muss `22` vorher zurückgenommen haben.
