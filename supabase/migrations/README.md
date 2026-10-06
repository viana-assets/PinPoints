# Supabase-Migrationen

Jede Datenbank-Änderung landet hier als eigene, durchnummerierte Datei
(`01_schema.sql`, `02_lager.sql`, `03_auftraege.sql`, `04_fahrzeuge.sql`, …).
Bereits ausgeführte Dateien werden **nicht mehr verändert** – eine neue
Änderung bekommt immer die nächste freie Nummer und einen eigenen,
sprechenden Namen.

So bleibt nachvollziehbar, was in der Supabase-Datenbank bereits läuft und
was noch im SQL-Editor ausgeführt werden muss, ohne dass alte Befehle
überschrieben werden oder man durcheinanderkommt.

**Noch auszuführen: 70 und 71** (Abschnitt „Noch auszuführen“ unten, in dieser Reihenfolge). **Stand 05.10.2026: Alle Migrationen 01–69 sind in der Produktivdatenbank ausgeführt** (66–69 laut Vitali am 05.10.2026) –
geprüft mit `PRUEFUNG_welche_migrationen_liefen.sql` (jede Zeile „ja"). Die Abschnitte unten,
die noch „noch auszuführen" hießen, sind damit erledigt und heißen jetzt „ausgeführt"; ihr Text
bleibt als Begründung stehen. Eine neue Migration bekommt wieder einen eigenen Abschnitt
„noch auszuführen", bis Vitali sie gemeldet hat.

## Bereits ausgeführt

`01`–`14` (Grundschema, ausgeführt bis 28.08.2026):

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

## Ausgeführt ab 15

**Ausgeführt in dieser Reihenfolge – sie bauen aufeinander auf** (bestätigt 02.10.2026).
Die ersten fünf gehören zur Sanierung vom August 2026 (siehe `docs/architektur.md`).

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

- `33_eingelagerte_raeder.sql` – die vier Räder eines Satzes einzeln. `tire_storage`
  bekommt `erfassungsart` (`sammel`|`einzeln`, Standard `sammel`) und `anzahl_raeder`
  (1–8, Standard 4); neue Tabelle `eingelagerte_raeder` mit Position (VL/VR/HL/HR, darf
  leer bleiben), Reifengröße, DOT, Profiltiefe, Felge, Sensor, Bemerkung. Der Sammelwert
  bleibt der Normalfall – **wichtig ist, dass es die Profiltiefe nur einmal gibt**: bei
  `sammel` am Satz, bei `einzeln` an den Rädern, nie an beiden (Prüfregel
  `tire_storage_kein_doppelter_profilwert`). Drei Regeln sichern das ab, alle in der
  Datenbank: kein Rad an einem Sammel-Satz, nicht mehr Räder als `anzahl_raeder`, und kein
  Rückweg auf `sammel`, solange Radzeilen existieren. Braucht `02` (tire_storage), `18`
  (audit_log) und muss zusammen mit dem passenden Anwendungscode laufen. Konzept:
  `docs/lager-ausbaukonzept.md`, A1.

- `34_fahrzeug_ohne_reifenzustand.sql` – entfernt `vehicles.tire_dot_date` und
  `vehicles.tire_profile_mm`. Sie beschreiben einen Reifensatz, standen aber am Auto: Ein
  Auto behält man zehn Jahre, der Satz wechselt zweimal im Jahr – nach dem ersten Wechsel
  war der Wert still falsch. Seit `33` steht beides am Satz bzw. am einzelnen Rad.
  `vehicles.tire_size` bleibt: Welche Größe ein Fahrzeug fährt, ist eine Eigenschaft des
  Autos. Die Migration zählt vor dem Löschen, wie viele Fahrzeuge dort noch Werte haben, und
  meldet das als Notice; die Rettungsabfrage steht im Kopf der Datei. Zweimaliges Ausführen
  ist unschädlich. Braucht `04` und muss zusammen mit dem passenden Anwendungscode laufen.

- `39_tote_spalten.sql` – entfernt drei Spalten, die niemand mehr schreibt:
  `orders.assigned_employee_id` (abgelöst von `order_employees`, Migration 11),
  `order_articles.discount_percent` (abgelöst vom Endpreis, Migration 38) und
  `user_settings.theme` (nie benutzt). Sie stehen nicht im Weg – sie sind schlimmer als das:
  Eine Spalte, die dasteht, wird irgendwann für eine Aussage gehalten, und `discount_percent`
  enthält den Rabatt von vorgestern. **Fassung v25 muss vorher laufen** – sie ist die erste,
  die keine der drei mehr schreibt. Zweimaliges Ausführen ist unschädlich
  (`drop column if exists`), und bewusst **ohne** `cascade`: Hängt wider Erwarten doch eine
  Sicht daran, soll die Migration abbrechen und es sagen. Das Protokoll bleibt unberührt –
  `audit_log` hält die alten Werte als jsonb, und die bleiben lesbar.

- `40_rechnung_erstellt.sql` – die zweite Hälfte des Schalters aus Migration 38. Der sagt
  bisher nur, DASS eine Rechnung fällig ist, nicht ob sie geschrieben wurde – damit ist er
  eine Kennzeichnung und keine Arbeitsliste. Neu: `rechnung_erstellt_am` (null = offen),
  `rechnung_erstellt_von` und `rechnung_nummer` (die Nummer aus dem ERP, freiwillig, aber die
  einzige Brücke zurück). Datum und Person setzt ein Trigger, nicht der Aufrufer – wie bei
  `completed_at` in Migration 20. Eine Prüfregel und der Trigger verhindern gemeinsam eine
  Rechnungsnummer ohne Rechnungsdatum: die Prüfregel beim INSERT, der Trigger beim UPDATE (er
  meldet es, statt die Nummer stillschweigend wegzuwerfen). Dazu ein Teilindex auf genau die
  Arbeitsliste. Techniker sind automatisch ausgeschlossen, weil
  `restrict_techniker_order_update()` mit einer Positivliste arbeitet. Fügt nur hinzu,
  zweimaliges Ausführen ist unschädlich.

- `41_techniker_darf_bearbeiten.sql` – der Techniker darf seinen eigenen Auftrag bearbeiten
  statt nur Status und Notiz. Entscheidung vom 16.09.2026: **alles außer wegnehmen** – auch
  Preise und die Rechnungsschalter. Begründung ist nicht „ungefährlich", sondern das
  Protokoll: Seit Migration 18/36 steht jede Änderung mit Person und Zeitpunkt darin, und am
  Auftrag ist sie sichtbar. Gesperrt bleiben Stornieren, Löschen, Wiedereröffnen und das
  Umhängen auf einen anderen Kunden. Zusätzlich darf er die Leistungen seines eigenen Auftrags
  anlegen und ändern (`order_articles`); der Einfrier-Trigger aus Migration 20 gilt
  unverändert weiter. Die Einteilung (`order_employees`) bleibt beim Büro.

  **ACHTUNG, hier dreht sich eine Regel um:** Der Spaltenschutz wechselt von einer Positiv-
  auf eine NEGATIVliste. Phase 6 hatte das absichtlich andersherum gemacht, damit eine
  künftige Spalte automatisch geschützt ist. Mit der neuen Absicht („alles außer wegnehmen")
  geht das nicht mehr – der Preis dafür: **Eine neue Spalte an `orders` ist für Techniker ab
  sofort automatisch änderbar.** Wer eine anlegt, prüft, ob sie in die Sperrliste gehört.

- `42_rechte_lesen_schreiben_loeschen.sql` – aus einem Haken je Modul werden **drei je Rolle**:
  lesen, schreiben, löschen. `module_permissions` bekommt `read_roles` und `delete_roles`
  (`edit_roles` bleibt und meint „schreiben"); neue Funktionen `public.darf(bereich, verb)` und
  `public.ist_kollege(employee_id)`; alle Richtlinien neu geschrieben.

  **Zweistufig**, und das ist nicht Kosmetik: Ein erster Entwurf schnitt die Bereiche an
  TABELLEN („Lager und Lagerplätze", „Eingelagerte Reifen"). Beim Durchsprechen fiel auf, dass
  dadurch zwei Haken schlicht falsch saßen – „Löschen" bei den Reifen hätte nicht das
  Auslagern gesteuert (das ist ein `update` auf `removed_at`), und eine Leistung aus einem
  Auftrag zu entfernen hing am selben Haken wie das Wegwerfen des ganzen Auftrags. Ein
  Techniker konnte damit eine Leistung eintragen, aber seinen eigenen Tippfehler nicht mehr
  korrigieren. Jetzt: Modulzeile = darf der Reiter geöffnet werden, eingerückte Zeilen = was
  man mit den Daten TUT (`auftraege.auftrag`, `auftraege.leistungen`, `auftraege.einteilung`,
  `lager.regale`, `lager.einlagerung`, `lager.raeder`).

  **Fünf Dinge, die man dazu wissen muss:**

  1. **Die Techniker-Regel „nur eigene Aufträge" bleibt und gilt ZUSÄTZLICH.** Sie steht jetzt
     in DERSELBEN Richtlinie wie das Modulrecht und nicht daneben – mehrere Richtlinien für
     dieselbe Aktion sind in Postgres ODER-verknüpft, eine zweite danebengestellt hätte die
     Einschränkung also aufgehoben statt ergänzt.
  2. **Löschen ist hier meistens ein `update`** (Soft-Delete seit Migration 19) und hinge damit
     am Schreibrecht. Ein Trigger `pruefe_loeschrecht()` fängt beides ab.
  3. **Die DELETE-Richtlinien fragen nach `lesen`, nicht nach `loeschen`.** Kein Versehen: Eine
     Richtlinie, die die Zeile wegfiltert, lässt den Trigger gar nicht laufen, und der Nutzer
     bekäme ein stummes „0 Zeilen" statt einer Begründung. Die Entscheidung trifft der Trigger.
  4. **`tire_storage` hat keinen Löschtrigger und keine Löschrichtlinie.** Eine Einlagerung
     wird nie gelöscht. Wenn die Anwendung etwas nie tut, soll auch kein Haken so tun, als
     könnte man es erlauben.
  5. **Ein Techniker sieht bei den Mitarbeitern nur noch Kollegen vom eigenen Auftrag**
     (`ist_kollege()`). Bisher lag die Belegschaft offen und nur die Oberfläche blendete sie
     aus – zwei Wahrheiten für dieselbe Frage.

  Übernahme: jede bisherige Einstellung wird abgebildet. Wo mehrere alte Zeilen auf ein Verb
  fallen, gilt die **Vereinigung** – eine Umstellung darf niemandem wegnehmen, was er gestern
  konnte. Die alten Zeilen bleiben stehen und werden nur nicht mehr gelesen.

- `43_aufraeumen_nach_42.sql` – entfernt die Spuren eines frühen Entwurfs von Migration 42
  (Bereiche noch an Tabellen geschnitten: `lager`, `einlagerung`). **Nur nötig, wenn diese
  frühe Fassung ausgeführt wurde** – sonst findet sie schlicht nichts und ist unschädlich.
  Zweimaliges Ausführen ebenso.

  Der ernste Punkt: Die überarbeitete Fassung benannte die Lager-Richtlinien um, räumte die
  alten aber nicht weg (auch die `drop`-Anweisungen trugen den neuen Namen). Auf `warehouses`
  und `storage_slots` lagen danach zwei Sätze Richtlinien, und mehrere Richtlinien für
  dieselbe Aktion sind ODER-verknüpft: Wer „Regale und Plätze verwalten – Schreiben" abhakte,
  nahm es damit NICHT weg. Eine Matrix, die ein Wegnehmen anzeigt, aber nicht vollzieht, ist
  schlimmer als gar keine. Dazu zwei harmlosere Reste: die verwaiste Zeile `einlagerung` und
  ein Löschtrigger auf `tire_storage`, der eine Handlung bewachte, die es nicht gibt.

- `44_auftrag_fahrzeuge.sql` – neue Tabelle `auftrag_fahrzeuge`: welche Fahrzeuge betrifft ein
  Auftrag, und mit welchem Kilometerstand. Ersetzt `orders.vehicle_id`, das nur EINES zuließ;
  die alte Spalte wird übernommen und bleibt vorerst stehen (fällt in einer späteren
  Migration, dieselbe Reihenfolge wie `discount_percent` 38 → 39).

  **Der Kilometerstand gehört an die Verbindung Auftrag↔Fahrzeug, nicht ans Fahrzeug.** Er ist
  eine Messung an einem Tag, keine Eigenschaft des Autos – am Fahrzeug stünde nach dem zweiten
  Besuch eine Zahl, die zum ersten nicht mehr passt. Genau der Fehler, den Migration 34 bei
  DOT-Datum und Profiltiefe wieder ausbauen musste.

  Dazu `pruefe_rechnungsdaten()`: Ist „Rechnung benötigt" gesetzt, lässt sich der Auftrag nur
  abschließen, wenn Name, Anschrift und E-Mail des Kunden da sind und jedes beteiligte
  Fahrzeug Kennzeichen und Kilometerstand hat. Die Meldung nennt ALLES Fehlende auf einmal.
  Der Trigger heißt `trg_pruefe_rechnungsdaten` – der Anfangsbuchstabe ist Absicht, damit er
  NACH `trg_enforce_order_status_transition` läuft: Erst muss feststehen, dass der
  Statuswechsel überhaupt erlaubt ist.

  Die Maske führt dieselbe Prüfung als Abhakliste, sperrt aber nichts – man darf den Haken
  setzen und später ergänzen. Eine Prüfung im Browser ist eine Bitte, eine im Trigger eine
  Regel.

- `45_techniker_sieht_eigene_kunden.sql` – **behebt einen Fehler aus Migration 42.** Dort
  hängt das Lesen von `customers` und `vehicles` an `darf('kunden','lesen')`, und der
  Techniker steht dort mit Absicht nicht drin. Damit sah er aber auch den Kunden seines
  EIGENEN Auftrags nicht mehr: kein Name und keine Anschrift im Auftragsfenster, kein
  Navigationsknopf, keine Kundensuche im Lager – und seit Migration 44 meldete die
  Rechnungs-Abhakliste ihm „Name fehlt, Anschrift fehlt", obwohl beides gepflegt war.

  Genau davor warnt der Abweichungs-Vermerk zu Phase 7 in `docs/roadmap.md` seit August
  wörtlich. Die Warnung stand da, und sie wurde übersehen.

  Die Korrektur gibt nicht alles wieder frei (dann wäre der Haken „Kunden lesen" wirkungslos),
  sondern nimmt dieselbe Form wie bei Aufträgen und Mitarbeitern: **Modulrecht ODER eigener
  Bezug.** Neue Funktion `ist_eigener_kunde()`. Die Kontakthistorie bleibt draußen – der
  Techniker braucht die Anschrift, nicht den Vorgang. Das Schreiben bleibt unverändert beim
  Büro.

Nach dem Ausführen bitte hier nach oben unter "Bereits ausgeführt" verschieben.

## Ohne eigenen Eintrag oben (Kurzfassung, nachgetragen 02.10.2026)

Für diese Migrationen fehlte bisher ein Absatz in dieser Datei; alle sind ausgeführt. Die
ausführliche Begründung steht im Kopfkommentar der jeweiligen Datei und in `docs/architektur.md`
(„Migrationsstand").

- `35` – `customers.geo_genauigkeit` (exakt / ungefähr / von Hand).
- `36` – Änderungsprotokoll für Admin und Superadmin lesbar, Auftrags-/Kundenbezug als Spalten.
- `37` – `orders.end_time`: Termine mit Von–bis. (Richtigstellung 02.10.2026, Fahrplan C3: Der Kopfkommentar
  sagt, die Standarddauer stehe „auch im Code" mit 60 Minuten – maßgeblich ist `betrieb.termin_intervall_min`,
  die Datei selbst wird als ausgeführte Migration nicht mehr geändert.)
- `38` – `orders.rechnung_noetig`, `order_articles.endpreis_netto`, Tabelle `betrieb`.
- `46` – Abrechnungsart am Artikel (Lagergebühr), Altreifen-Rückfrage.
- `47` – Abschluss eines Auftrags schreibt den Kontaktstand des Kunden.
- `48` – Rechnungen in PinPoints: Tabelle `rechnungen`, Briefkopf, Kundennummer.
- `49` – Rechnung und Auftrag transaktional verknüpft.
- `50` – `articles.freitext` für Sammelpositionen wie „Sonstiges".
- `53` – Laufkundschaft (Sammelkunde für Barverkäufe).
- `54` – Stornogrund an der Rechnung Pflicht.

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
- `34` braucht `04` (vehicles). Die Rücknahme stellt die Spalten LEER wieder her – die alten
  Werte sind mit dem `drop column` weg. Vorher den Anwendungscode zurückdrehen.
- `33` braucht `02` (tire_storage) und `18` (audit_log). Beim Zurücknehmen gehen die
  einzeln gemessenen Räder verloren – `33_rollback.sql` nennt im Kopf die Abfrage, mit der
  sie sich vorher sichern lassen.
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
- `35` braucht `01` (customers) – sonst nichts. Fügt nur eine Spalte samt Prüfregel hinzu.
- `36` braucht `18` (audit_log, audit_row, stamp_row) und `05` (current_user_role). Legt
  **kein** Protokoll an – das gibt es seit `18`. Sie zieht drei nach `18` entstandene
  Tabellen nach (`order_employees`, `firmenfahrzeuge`, `eingelagerte_raeder`), öffnet das
  Leserecht für Admin, ergänzt `auftrag_id`/`kunde_id` als berechnete Spalten (auch
  rückwirkend für alle Altzeilen) und stellt `protokoll_personen()` bereit, weil `profiles`
  laut `05` nur der Superadmin lesen darf. Die Rücknahme nimmt genau das zurück und lässt
  das Protokoll selbst samt allem Aufgezeichneten unberührt.
- `37` braucht `07` (`orders.time`). Ergänzt `end_time`, bringt vorhandene Anfangszeiten auf
  zweistellige Stunden (sonst vergleicht sich Text falsch: "9:15" > "10:00") und trägt dem
  Bestand ein angenommenes Ende von 60 Minuten nach. Die Rücknahme löscht `end_time` samt
  aller von Hand gepflegten Endzeiten – vorher sichern, der Kopf der Rücknahme nennt die
  Abfrage. Zuerst den Anwendungscode zurückdrehen.
- `38` braucht `03` (orders), `12` (order_articles), `05` (current_user_role) und `18`
  (audit_row, nur damit die neue Tabelle `betrieb` mitprotokolliert wird). **Fügt nur hinzu
  und löscht nichts**: `order_articles.discount_percent` bleibt vorerst stehen, weil die
  laufende Fassung sie noch schreibt – sie fällt in einer späteren Migration, wenn die neue
  Fassung überall läuft. Die Rücknahme entfernt `rechnung_noetig`, `endpreis_netto` und die
  Tabelle `betrieb`; die Endpreise gehen dabei verloren, der Kopf der Rücknahme nennt die
  Sicherungsabfrage. Zuerst den Anwendungscode zurückdrehen.
- `39` braucht `03` (orders), `12` (order_articles) und `01`/`09` (user_settings) – und vor
  allem den Anwendungscode: **erst v25, dann diese Migration.** Umgekehrt schriebe die
  laufende Fassung in Spalten, die es nicht mehr gibt. Die Rücknahme legt die drei Spalten
  LEER wieder an; die Werte sind mit dem `drop column` weg, die Sicherungsabfrage steht im
  Kopf von `39_rollback.sql`.
- `40` braucht `03` (orders), `20` (der Trigger dort sperrt das UPDATE auf einem erledigten
  Auftrag NICHT – nur die Positionen sind eingefroren, die Auftragszeile nicht) und `38`
  (`rechnung_noetig`). Muss zusammen mit dem passenden Anwendungscode laufen: Der Code liest
  die drei neuen Spalten, ohne sie gäbe es einen Fehler beim Laden der Aufträge. Deshalb
  **SQL zuerst, dann die Dateien.** Die Rücknahme löscht mit den Spalten auch die Angabe,
  welche Rechnungen bereits geschrieben wurden – die Sicherungsabfrage steht im Kopf von
  `40_rollback.sql`.
- `41` braucht `13`/`15` (`is_own_order`, `current_user_role`, der Spaltenschutz-Trigger),
  `20` (die Fassung, die sie ersetzt) und `18` (das Protokoll, das die ganze Begründung
  trägt). Legt keine Spalte an. Muss zusammen mit dem passenden Anwendungscode laufen –
  sonst bietet die Oberfläche einem Techniker weiterhin nichts an, obwohl er dürfte.
  Die Rücknahme stellt genau die Positivliste aus `20` wieder her.

## Projektwache in jeder neuen Migration

In derselben Supabase-Organisation liegen mehrere Projekte. Der SQL-Editor merkt sich, welches
zuletzt offen war – **dreimal** ist eine Migration dadurch im falschen gelandet. Die Meldung
war jedes Mal `relation "public.orders" does not exist`: technisch richtig und als Hinweis
unbrauchbar, weil sie nach einem Fehler in der Migration aussieht statt nach der falschen
Datenbank.

**Ab Migration 40 beginnt jede Migration direkt hinter `begin;` mit dieser Prüfung:**

```sql
do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;
```

Sie steht INNERHALB der Transaktion, damit der Abbruch alles Weitere mitnimmt und im Editor
nur diese eine Meldung erscheint. Zwei Tabellen statt einer, weil ein Projekt durchaus eine
Tabelle `orders` haben kann, aber kaum zusätzlich ein `tire_storage`.
- `42` braucht `09`/`10` (module_permissions), `16` (die Richtlinien, die sie ersetzt), `15`
  (`is_own_order`, `current_user_role`), `19` (Soft-Delete) und `41`. Muss zusammen mit dem
  passenden Anwendungscode laufen: Die neue Fassung liest drei Spalten. **SQL zuerst.**
  `is_own_order()` muss `security definer` sein (ist es seit `15`) – sonst ruft die
  Auftrags-Richtlinie eine Funktion auf, die wieder auf `orders` zugreift, und Postgres bricht
  mit „stack depth limit exceeded" ab. Die Rücknahme stellt die Richtlinien aus `16`, `13`/`15`
  und `41` wieder her und lässt die neuen Spalten stehen.
- `43` braucht `42`. Läuft danach auf jedem Stand, mit oder ohne die frühe Fassung im Rücken.
  Die Kontrollabfragen stehen am Ende der Datei; beide müssen leer sein.
- `44` braucht `03` (orders), `04` (vehicles), `20` (orders.vehicle_id), `38`
  (`rechnung_noetig`), `42` (`darf`, `is_own_order`) und `18`/`36` (`stamp_row`, `audit_row` –
  fehlen sie, überspringt die Migration die Protokoll-Trigger mit einer Notiz). Muss zusammen
  mit dem passenden Anwendungscode laufen. **SQL zuerst.** Die Rücknahme löscht die Tabelle
  samt aller Kilometerstände; das übernommene Erstfahrzeug steht weiter in
  `orders.vehicle_id`.
- `45` braucht `42` (`darf`), `13`/`15` (`current_employee_id`, `is_own_order`) und `44`
  (`auftrag_fahrzeuge`, für den zweiten Weg auf die Fahrzeuge). Muss zusammen mit dem
  passenden Anwendungscode laufen – der blendet dem Techniker das E-Mail-Feld in der
  Abhakliste aus, weil die Datenbank es ihm ohnehin verweigert.
- `46` braucht `22` (der Abschluss-Zwang, den sie aufhebt), `20` (`order_articles`) und `14`
  (`articles`). Muss zusammen mit dem passenden Anwendungscode laufen. **SQL zuerst.** Sie
  stuft jeden Artikel mit `braucht_lagerplatz` als Lagergebühr ein und meldet am Ende, welche
  das waren – das bitte im Artikelstamm nachsehen, denn Migration `22` hatte den Haken
  seinerzeit selbst geraten. `fragt_einlagerung` bleibt bewusst überall leer: Der Haken gehört
  an die Wechsel-Leistungen, nicht an die Einlagerung, und was hier geraten würde, wäre falsch
  geraten. Die Rücknahme stellt den Zwang aus `22` wieder her und lässt die neuen Spalten
  stehen; `braucht_lagerplatz` bleibt vorerst als tote Spalte erhalten und fällt später.
- `47` braucht `01` (`contact_history`), `03` (`orders`) und `23` (`kontakt_ergebnis`,
  `wiedervorlage_am`). Läuft unabhängig vom Anwendungscode – die Regel steht vollständig in der
  Datenbank, der Code lädt danach nur die Kunden neu. Der Trigger ist `security definer`, weil
  der Techniker selbst kein Schreibrecht auf `customers` hat (`42`/`45`); ohne das würde die
  Regel ausgerechnet für den nicht gelten, der draußen abschließt. `last_contact` rückt nur
  vor, nie zurück – ein nachträglich abgeschlossener alter Auftrag stellt die Wiedervorlage-Uhr
  also nicht heimlich zurück. Die Rücknahme entfernt nur den Trigger; geschriebene
  Kontaktstände bleiben stehen, denn die Aufträge WURDEN abgeschlossen.
- `48` braucht `03` (orders), `14` (articles), `38` (`betrieb`) und `42` (`darf`, für die
  Richtlinien auf `rechnungen`). Sie legt den Briefkopf als Spalten an `betrieb`, vergibt
  Kundennummern ab 10000, gibt dem Artikel eine Einheit und baut die Rechnungstabelle samt
  Nummernvergabe, Unveränderbarkeit und Storno. **SQL zuerst**, danach die Anwendung.
  Vor der ersten Rechnung: Betriebsdaten und die Startnummer des Kreises setzen (im
  Adminbereich unter Betrieb – oder einmalig per Skript). Die Rücknahme verweigert den Dienst,
  sobald eine einzige Rechnung existiert: Sie würde Belege löschen.
- `49` braucht `48` (`rechnungen`) und `40` (`orders.rechnung_erstellt_am`, `stempel_rechnung`).
  Sie verbindet Beleg und Auftrag: Eine ausgestellte Rechnung hakt ihren Auftrag ab, eine
  Stornorechnung nimmt den Haken zurück und kennzeichnet die aufgehobene Rechnung – alles in
  EINER Transaktion, damit es nicht halb passieren kann. Zusätzlich zwei Sperren: keine
  Rechnung ohne Firmenname im Briefkopf (sonst wäre die Nummer für einen Beleg ohne Absender
  verbraucht), und der Haken „Rechnung erstellt" lässt sich nicht mehr von Hand lösen, solange
  ein gültiger Beleg am Auftrag hängt. Die Rücknahme setzt die drei Funktionen auf den Stand
  von `40`/`48` zurück; ausgestellte Rechnungen bleiben unberührt.
- `52` braucht `18` (`audit_log`, Trigger an `orders`) und `44` (`auftrag_fahrzeuge`). Läuft
  nach `51`. Reines Nachholen von Daten, kein Schema-Eingriff.
- `51` braucht `44` (`auftrag_fahrzeuge`) und `20` (`orders.vehicle_id`, `idx_orders_vehicle`).
  **Reihenfolge umgekehrt wie sonst: erst den Code hochladen, dann das SQL.** Die Migration
  entfernt eine Spalte, die die alte Fassung des Auftragsfensters noch schreibt; läuft sie
  vorher, scheitert dort jedes Speichern. Umgekehrt ist es harmlos – der neue Code fasst die
  Spalte ohnehin nicht mehr an.
- `50` braucht `14` (`articles`) und `48` (`articles.einheit`). Sie gibt dem Artikel den Haken
  `freitext`: Die Bezeichnung dieser Leistung wird am AUFTRAG eingegeben und ersetzt auf der
  Rechnung den Artikelnamen – für Sammelpositionen wie „Sonstiges". Das Feld für den Text gibt
  es seit `20` (`order_articles.note`), gedruckt wird es seit `48`; was fehlte, war die
  Unterscheidung zwischen ERGÄNZEN und ERSETZEN. Muss zusammen mit dem passenden
  Anwendungscode laufen. **SQL zuerst.**
  Die Migration setzt den Haken bei KEINEM Artikel – ein Betrieb nennt seine Sammelposition
  „Diverses", ein anderer hat einen echten Artikel, der so heißt. Die Abfrage am Ende zeigt den
  ganzen Artikelstamm mit einem Hinweis, wo einer hingehört; gesetzt wird er im Artikelstamm
  der Anwendung. Dieselbe Entscheidung wie bei `fragt_einlagerung` in `46`.
  Die Rücknahme entfernt nur den Haken; die Texte bleiben und erscheinen dann wieder als
  Zusatzzeile unter der Bezeichnung.
- `51_fahrzeug_nur_noch_einmal.sql` – **CODE ZUERST, dann dieses SQL.** Entfernt
  `orders.vehicle_id` samt Index. Welche Fahrzeuge an einem Auftrag hängen, steht seit
  Migration `44` in `auftrag_fahrzeuge`; die alte Spalte sollte laut `44` nur noch gelesen
  werden, wurde vom Auftragsfenster aber weiter beschrieben. Damit gab es zwei Antworten auf
  dieselbe Frage: Die Rechnung las `auftrag_fahrzeuge`, der Vorgeschichte-Hinweis
  `orders.vehicle_id`. Bei einem Kunden mit zwei Autos konnten beide verschiedene Wagen
  meinen. Die Migration holt vorher alles nach, was nur in der alten Spalte steht, und gibt
  am Ende eine Tabelle aus, wie viele Einträge das waren. Zweiter Lauf ist folgenlos.
  Die Rücknahme legt die Spalte wieder an und füllt sie mit dem ZUERST eingetragenen Fahrzeug
  je Auftrag – mehrere Autos passen dort nicht hinein, verloren geht in `auftrag_fahrzeuge`
  aber nichts.
  **NACHTRAG 21.09.2026:** Die zuerst ausgelieferte Fassung sammelte die nachzuholenden
  Fahrzeuge in einer temporären Tabelle. Im SQL-Editor hält `begin; … commit;` nicht über die
  ganze Datei – jede Anweisung wird für sich abgeschlossen, die temporäre Tabelle war sofort
  wieder fort, der Nachhol-Schritt scheiterte, und das `drop column` danach lief trotzdem. Die
  Datei im Repo ist inzwischen korrigiert (ohne temporäre Tabelle) und für eine frische
  Datenbank vollständig; auf der Produktivdatenbank holt **`52`** das Fehlende nach.
- `52_fahrzeug_aus_dem_protokoll.sql` – **nach `51` ausführen.** Holt die Fahrzeug-Zuordnungen
  nach, die beim misslungenen Lauf von `51` verloren gingen. Quelle ist `audit_log`: Der
  Protokoll-Trigger aus `18` schreibt bei jedem Einfügen und jeder Änderung die ganze
  `orders`-Zeile als jsonb mit, also auch `vehicle_id`, solange es die Spalte gab. Genommen
  wird je Auftrag der jüngste Abzug, der den Schlüssel überhaupt noch enthält.
  Erfindet nichts: Aufträge, deren Fahrzeug zuletzt auf „keines" stand, und Fahrzeuge, die es
  nicht mehr gibt, bleiben außen vor und werden am Ende gezählt. Zweiter Lauf fügt nichts
  hinzu. Die Rücknahme entfernt genau die nachgeholten Zeilen wieder.

## Runde 35 (23.09.2026) – ausgeführt

**Ausgeführt in dieser Reihenfolge, jeweils SQL zuerst, dann die Dateien.** Beide fügen nur hinzu; der alte
Code stört sich an nichts davon.

- `55_schutz_und_abendhinweis.sql` – drei Dinge, jedes für sich wirksam:
  1. Ein belegter Lagerplatz bzw. ein Lager mit belegten Plätzen lässt sich nicht löschen
     (Trigger `lager_belegt_nicht_loeschen()`, Fahrplan D3). Frühere Einlagerungen sperren nicht.
  2. Die nächste Rechnungsnummer ist fest, sobald eine Rechnung existiert: nur „höchste plus
     eins" (Trigger `pruefe_rechnungsnummernkreis()`, Fahrplan D7). Das Hochzählen beim
     Ausstellen ist ausgenommen (`pg_trigger_depth() > 1`).
  3. Abendhinweis: `user_settings.abendhinweis_aktiv` / `abendhinweis_uhrzeit` (Vorgabe an,
     20:00) und die Sperre gegen Doppelversand `push_abendhinweis`.
  Am Ende eine Ergebnistabelle, die letzte Zeile sagt, ob der Rechnungszähler zum Bestand passt.
  Zweiter Lauf folgenlos. Rücknahme: `rollback/55_rollback.sql` (erst Code zurück).
- `56_datenschutz_protokoll_und_papierkorb.sql` – Fahrplan B1/B2. Spalte
  `audit_log.geschwaerzt_am`, Funktion `protokoll_schwaerzen()` (Frist 36 Monate) mit nächtlichem
  pg_cron-Auftrag `pinpoints-protokoll-schwaerzen` (03:15 UTC), Funktion
  `kunde_endgueltig_loeschen()` für den Papierkorb (nur Superadmin, Rechnungen bleiben). Braucht
  `18`/`36` (audit_log), `28` (pg_cron), `48` (rechnungen), `53` (laufkundschaft). Die
  Ergebnistabelle nennt, wie viele Einträge heute Nacht geschwärzt werden. Zweiter Lauf
  folgenlos. Rücknahme: `rollback/56_rollback.sql` – Geschwärztes und endgültig Gelöschtes
  kommt dadurch nicht zurück.

Geprüft gegen ein frisches Postgres 16 (Migrationen 01–56 am Stück), je zweimal ausgeführt,
zurückgenommen und wieder ausgeführt; Verhalten nachgestellt: belegter Platz / Lager gesperrt,
Platz mit Verlauf löschbar, Zähler nach Rechnung fest, Ausstellen zählt weiter, endgültiges
Löschen samt Protokoll (Rechnung bleibt mit Namen im Snapshot), Schwärzen nach Frist, zweiter
Schwärzungslauf ohne Wirkung, Aufruf als `authenticated` abgewiesen.

## 24.09.2026 – ausgeführt

- `57_laufkunde_am_auftrag_und_einmalkunde.sql` – **nach `55` und `56`, SQL zuerst.**
  `orders.laufkunde_name/_telefon/_ort`, Trigger `pruefe_laufkunde()` (Name Pflicht beim
  Abschließen eines Laufkunden-Auftrags), `customers.einmalkunde` mit Prüfbedingung
  `customers_lauf_oder_einmal`, und `protokoll_schwaerzen()` kennt die drei neuen Felder. Braucht
  `53` und `56` – bricht sonst mit Klartext ab. Die Ergebnistabelle nennt, wie viele offene
  Laufkunden-Aufträge noch keinen Namen haben. Zweiter Lauf folgenlos. Rücknahme:
  `rollback/57_rollback.sql` (erst Code zurück; die eingetragenen Namen gehen dabei verloren).
  Geprüft gegen ein frisches Postgres 16 (01–57): Abschließen ohne Namen abgewiesen, mit Namen
  durch, normaler Kunde unberührt, Laufkundschaft + Einmalkunde abgewiesen, Schwärzen erfasst
  `laufkunde_name`, Rücknahme und Neulauf sauber.

## 25.09.2026 – ausgeführt

- `58_mitnehmen_abhaken.sql` – **SQL zuerst, dann die Dateien.** Neue Tabelle
  `mitnehmen_gepackt` (Satz × Einsatztag, wer und wann) für das Abhaken der Liste „Reifen
  mitnehmen" im neuen Dashboard, fürs ganze Team sichtbar. RLS: lesen, abhaken und Haken
  entfernen für alle mit `lager.einlagerung · lesen`. Braucht `42` (`darf()`). Die
  Ergebnistabelle prüft Tabelle, RLS und die drei Richtlinien. Zweiter Lauf folgenlos.
  Rücknahme: `rollback/58_rollback.sql` (erst Code zurück; nur die Haken gehen verloren).

## 26.09.2026 – ausgeführt

- `59_datev_export.sql` – **SQL zuerst, dann die Dateien** (die Betriebsdaten-Maske speichert die
  neuen Spalten mit; ohne sie schlüge schon das Speichern des Briefkopfs fehl).
  Zehn Spalten `betrieb.datev_*` für den DATEV-Buchungsstapel der neuen Auswertungsseite:
  Berater- und Mandantennummer (leer = Export gesperrt), Beginn des Wirtschaftsjahres,
  Sachkontenlänge, Kontenrahmen (Vorgabe SKR03), Erlöskonten 19 %/7 %/0 % (Vorgabe
  8400/8300/8200), Debitor = Kundennummer + Basis (Vorgabe 0) und Sammeldebitor (69999) für
  Rechnungen ohne Kundennummer. Sechs Prüfbedingungen mit den Grenzen des DATEV-Formats. Rechte
  wie beim Briefkopf. Die Ergebnistabelle prüft Spalten, Bedingungen und Vorgaben. Zweiter Lauf
  folgenlos. Rücknahme: `rollback/59_rollback.sql` (erst Code zurück; nur die DATEV-Angaben gehen
  verloren). Geprüft gegen Postgres 16 (Stand 58): zweimal ausgeführt, ungültige Beraternummer
  und Kontenrahmen abgewiesen, gültige Werte gespeichert, zurückgenommen, erneut ausgeführt.

- `60_testkunde_und_neuigkeiten.sql` – **SQL zuerst, dann die Dateien** (die neue Oberfläche liest
  `customers.testkunde` und `user_settings.neuigkeiten_gesehen`). Testkunden: nur der Superadmin
  legt sie an (Trigger `pruefe_testkunde`), keine Kundennummer, Aufträge mit negativer Nummer aus
  eigener Folge (Anzeige „T1"), Rechnungen mit negativer Nummer und Text „T-RE1" – der echte
  Rechnungs- und Auftragskreis zählt dabei nicht weiter. Die Auftragsnummer vergibt dafür ab jetzt
  der Trigger `vergib_auftragsnummer` statt des Spalten-Vorgabewerts. Testrechnungen (nur sie)
  lassen sich löschen; `testkunde_loeschen(uuid)` entfernt einen Testkunden restlos samt
  Aufträgen, Rechnungen, Fahrzeugen, Reifen und Protokoll. Umschalten nur ohne Aufträge; ein
  Auftrag zieht nicht zwischen Test- und echtem Kunden um. Neu gefasst: `vergib_kundennummer`,
  `vergib_rechnungsnummer`, `rechnung_unveraenderlich`, `kontakt_aus_abschluss`,
  `kunde_endgueltig_loeschen` (verweist Testkunden an die neue Funktion). Die Ergebnistabelle
  prüft Spalten, Trigger und Funktion. Zweiter Lauf folgenlos. Rücknahme:
  `rollback/60_rollback.sql` – ein einziger Block, bricht ab, solange es Testkunden gibt.
  Geprüft gegen Postgres 16 (Stand 59): zweimal ausgeführt; Admin darf keinen Testkunden anlegen;
  T1/T2/T3 neben echten 2/3 (auch eine mitgeschickte Nummer wird ersetzt); RE1 echt, T-RE1/T-RE2
  mit Storno, Zähler bleibt bei 2; Umschalten mit Aufträgen und Umzug abgewiesen; Kontakteintrag
  „Auftrag T2 abgeschlossen"; Papierkorb-Weg verweist um; restloses Löschen (auch erledigter
  Auftrag, Reifen im Regal, Fahrzeug am Auftrag) ohne Rest in allen Tabellen und im Protokoll;
  echte Rechnung bleibt unlöschbar; Rücknahme mit Testkunde abgewiesen, ohne durchgelaufen,
  zweimal; danach Auftragsnummern wieder über den Vorgabewert; erneut ausgeführt.


- `61_reifenverkauf.sql` – **nach `60`, SQL zuerst, dann die Dateien** (die neue Oberfläche liest
  `verkaufsreifen` und `order_articles.verkaufsreifen_id`). Reifenverkauf aus dem Lager: neue
  Tabelle `verkaufsreifen` (Zustand neu/gebraucht, Größe, Hersteller/Modell, Saison, Index, DOT,
  Profil, Felge für Kompletträder, Runflat/XL, EPREL-Nummer, VK- und EK-Preis netto, Lager und
  optional Platz). `bestand` pflegt man von Hand, `reserviert` und `verkauft` zählt allein die
  Datenbank (`verkaufsreifen_zaehlen`, nur für die Trigger ausführbar). Eine Position mit
  `verkaufsreifen_id` reserviert, Abschließen bucht ab, Wiedereröffnen bucht zurück, Stornieren,
  Löschen und Entfernen der Position geben frei; Zeilensperre gegen Doppelverkauf. Ein Platz hält
  entweder einen Kundensatz oder Verkaufsreifen (Trigger in beide Richtungen); Lager und Plätze
  mit Verkaufsreifen lassen sich nicht löschen (`lager_belegt_nicht_loeschen` neu gefasst). Zwei
  neue Abrechnungsarten `reifenverkauf_neu`/`_gebraucht` und die Artikel „Reifen neu" / „Reifen
  gebraucht" (ein gleichnamiger vorhandener Artikel wird übernommen). Neuer Rechte-Bereich
  `lager.verkauf`. Ein Testkunde gibt beim restlosen Löschen seine „verkauften" Reifen zurück;
  ein echter Kunde nicht. Die Ergebnistabelle prüft Tabelle, Spalte, Artikel, Rechte und
  Richtlinien. Zweiter Lauf folgenlos. Rücknahme: `rollback/61_rollback.sql` (erst Code zurück;
  Positionen bleiben, verlieren nur den Verweis). Geprüft gegen Postgres 16 (Stand 60): zweimal
  ausgeführt; Zählfelder aus der Anwendung nicht setzbar; ohne Lager und auf belegtem Platz
  abgewiesen (beide Richtungen); Techniker liest, legt nicht an; falscher Artikel, zu viele Stück,
  halbe Stück abgewiesen; Abschließen 4→1 (3 verkauft), Wiedereröffnen zurück, Storno gibt frei,
  Wiedereröffnen eines Stornos ohne freien Reifen abgewiesen; Papierkorb und Wiederherstellen;
  Löschen von Posten, Platz und Lager mit Bestand abgewiesen; Testkunde gibt zurück, endgültig
  gelöschter echter Kunde nicht; zwei gleichzeitige Buchungen auf den letzten Reifen – die zweite
  wartet und wird abgewiesen; direkter Aufruf der Zählfunktion verweigert; zurückgenommen und
  erneut ausgeführt (kein zweiter Artikel).

## 02.10.2026 – ausgeführt (Vitali, nach v103)

- `62_loeschsperre_und_abfragebremse.sql` – **nach `61`, Reihenfolge SQL/Dateien egal** (die
  Routen fallen ohne die Funktion auf die alte Bremse zurück). (1) D2: Trigger
  `trg_pruefe_auftrag_loeschen` auf `orders` lehnt das Löschen (Soft- und Hard-Delete) eines
  Auftrags ab, auf den eine Rechnung verweist oder der eine Rechnungsnummer trägt; Weitergabe
  aus einem anderen Trigger (Kunde in den Papierkorb, endgültiges Löschen) bleibt erlaubt.
  (2) B3: Tabelle `fremdabfrage_zaehler` (RLS an, keine Richtlinie) und `fremdabfrage_erlaubt(text)`
  (security definer, nur für `authenticated`): zählt je Dienst, Nutzer und Minute, Nominatim
  50/55, Photon 60/300, räumt Zeilen älter als eine Stunde selbst ab. Die Ergebnistabelle zeigt
  Trigger, Tabelle, Funktion und wie viele Aufträge jetzt gesperrt sind. Zweiter Lauf folgenlos.
  Rücknahme: `rollback/62_rollback.sql`. Geprüft gegen Postgres 16 (Stand 61): zweimal
  ausgeführt; Löschen des abgerechneten Auftrags (Soft und Hard) abgewiesen mit Rechnungsnummer
  im Text, anderer Auftrag löschbar, Notiz am abgerechneten Auftrag änderbar; Kunde mit
  abgerechnetem Auftrag in den Papierkorb und endgültig gelöscht – Rechnung bleibt, Verweis
  null; Bremse: 50 erlaubt, danach abgewiesen, ohne Nutzer nein, unbekannter Dienst Fehler;
  zurückgenommen, zweimal, und erneut ausgeführt.
- `63_aufraeumen_telefon_vorlagen.sql` – **nach `62`, SQL zuerst, dann die Dateien** (die Oberfläche
  liest `auftragsvorlagen`; ohne Tabelle fehlt nur der Knopf „+ Vorlage"). (1) D8: frühe Rechnungen
  ohne `texte.mit_steuer` bekommen genau den Wert, den die Druckansicht bisher geraten hat
  (`steuer <> 0`) – Unveränderlichkeits-Trigger dafür in EINEM do-Block aus und wieder an. (2) D10:
  `telefon_vergleich(text)` (immutable) und die berechneten Spalten `customers.mobil_vergleich` /
  `festnetz_vergleich` mit Index. (3) C1: `articles.braucht_lagerplatz` entfernt. (4) E6: Tabelle
  `auftragsvorlagen` mit RLS (lesen: Leistungen oder Artikel; schreiben: Artikel; löschen über
  `pruefe_loeschrecht('artikel')`), Stempel- und Protokoll-Trigger, Name eindeutig, Positionen als
  jsonb-Liste. Zweiter Lauf folgenlos. Rücknahme: `rollback/63_rollback.sql` (lässt `mit_steuer`
  bewusst stehen). Geprüft gegen Postgres 16 (Stand 62): zweimal ausgeführt; Rechnung ohne Feld
  bekommt `true` bei Steuer 1,90, danach ist sie wieder unveränderlich; Telefonfälle wie in
  `tests/telefon.test.ts`; Techniker liest Vorlagen, legt keine an; Admin legt an (Stempel
  gesetzt), doppelter Name und Nicht-Liste abgewiesen; zurückgenommen, zweimal, erneut ausgeführt.
- `64_dubletten_auskunft_fachgroesse_verkauf.sql` – **nach `63`, SQL zuerst, dann die Dateien**
  (die Oberfläche ruft die Funktionen auf und liest `storage_slots.groesse`). (1) E1: Tabelle
  `kunden_keine_dublette` (Paar, kleinere Kennung zuerst; RLS lesen `kunden·lesen`, anlegen/entfernen
  `kunden·loeschen`) und `kunden_zusammenfuehren(behalten, weg)` (security definer, nur
  `kunden·loeschen`): Fahrzeuge mit gleichem Kennzeichen vereint, Aufträge, Sätze, Kontakte,
  Rechnungsverweise und alte Termine umgezogen, leere Felder gefüllt, der andere leer in den
  Papierkorb, Vermerk in beiden Notizen. (2) E10: `kunde_auskunft(kunde)` (jsonb, nur Admin/
  Superadmin, nicht für die Laufkundschaft). (3) E12: `storage_slots.groesse` normal/gross mit
  Prüfregel. (4) E17: `verkaufsreifen.herkunft_satz_id` und `satz_zum_verkauf(satz, posten)`
  (security invoker; Satz auslagern und Posten auf denselben Platz in einem Zug, prüft vorab
  `lager.verkauf·schreiben` und den Hersteller). Ergebnistabelle mit fünf Zeilen. Zweiter Lauf
  folgenlos. Rücknahme: `rollback/64_rollback.sql` (macht gelaufene Zusammenführungen nicht
  rückgängig). Geprüft gegen Postgres 16 (Stand 63): zweimal ausgeführt; Techniker darf nicht
  zusammenführen, gleicher Kunde abgewiesen; Zusammenführen zieht Auftrag, Satz, Kontakt und
  Auftragsfahrzeug um, vereint das doppelte Kennzeichen (Modell und Größe übernommen), füllt
  Festnetz und E-Mail, legt den anderen mit Vermerk in den Papierkorb, zweiter Aufruf abgewiesen;
  Rechnung zieht um (Unveränderlichkeit greift nicht); doppelter und verkehrt herum sortierter
  Vermerk abgewiesen; Auskunft nur Admin, enthält Platz und Protokollzahl; Fachgröße „riesig"
  abgewiesen; Satz zum Verkauf: leere Liste und fehlender Hersteller abgewiesen ohne Auslagern,
  zwei Posten auf denselben Platz mit Lager und Herkunft, zweiter Aufruf abgewiesen, Techniker
  ohne Verkaufsrecht abgewiesen und Satz liegt noch; zurückgenommen, zweimal, erneut ausgeführt.

- `65_fotos_und_unterschrift.sql` – **nach `64`, SQL zuerst, dann die Dateien** (die Oberfläche
  liest `auftrag_belege` und lädt in den Bucket). (1) Privater Storage-Bucket `auftrag-belege`
  (höchstens 3 MB, nur JPEG/PNG/WebP) mit drei Richtlinien auf `storage.objects`: lesen, wenn der
  Auftrag aus dem ersten Pfadteil sichtbar ist; hochladen zusätzlich mit `auftraege.auftrag·schreiben`;
  löschen mit `auftraege.auftrag·loeschen`. (2) Tabelle `auftrag_belege` (Art vorher/nachher/schaden/
  unterschrift, Pfad muss mit der Auftrags-Kennung beginnen, eindeutig), RLS wie der Auftrag, Löschen
  über `pruefe_loeschrecht('auftraege.auftrag')`, Stempel und Protokoll, kein Update. (3)
  `kunde_auskunft()` heißt jetzt `kunde_auskunft_grund()` (nicht mehr direkt aufrufbar); die neue
  `kunde_auskunft()` hängt die Belege an. Ergebnistabelle mit vier Zeilen. Zweiter Lauf folgenlos.
  Rücknahme: `rollback/65_rollback.sql` – der Bucket bleibt (Dateien lassen sich nur über die
  Storage-Schnittstelle löschen); ihn bei Bedarf im Dashboard unter Storage leeren und löschen.
  Geprüft gegen Postgres 16 (Stand 64, mit nachgebildetem `storage`-Schema): zweimal ausgeführt;
  Techniker legt am eigenen Auftrag eine Datei und eine Zeile an, am fremden weder noch; falscher
  Pfad und unbekannte Art abgewiesen; Techniker sieht seinen Beleg und darf ihn nicht löschen
  (Meldung im Klartext); Admin legt an und löscht; Auskunft enthält die Belege, die alte Funktion ist
  direkt nicht aufrufbar; Protokoll INSERT/INSERT/DELETE; endgültiges Löschen eines Kunden und eines
  Testkunden nimmt Belege und deren Protokolleinträge mit (der Name aus der Unterschrift bleibt
  nirgends stehen); zurückgenommen, zweimal, erneut ausgeführt.

## 05.10.2026 – ausgeführt (Vitali, 66 bis 69)

- `66_rechnung_anderswo.sql` – **nach `65`, SQL zuerst, dann die Dateien von v109** (die Oberfläche
  liest `orders.rechnung_extern`). (1) Spalte `orders.rechnung_extern`; ein Haken ohne gültige
  Rechnung aus der Zeit von Migration 40 („im ERP erstellt") wird als anderswo abgerechnet übernommen.
  (2) `stempel_rechnung()` neu: von Hand vermerken („anderswo abgerechnet", auf Wunsch mit Nummer) nur
  bei erledigtem Auftrag mit „Rechnung nötig" und nur mit `rechnungen·schreiben`; zurücknehmen
  ebenso; die Herkunft bestimmt der Trigger, nie der Aufrufer; die Nummer einer Rechnung aus dem MR
  Assistent lässt sich von Hand nicht ändern. (3) `pruefe_rechnung_nicht_anderswo()` auf
  `rechnungen`: keine Rechnung für einen anderswo abgerechneten Auftrag. (4) `pruefe_auftrag_loeschen()`
  neu: auch ein anderswo abgerechneter Auftrag ohne Nummer wird nicht gelöscht. Ergebnistabelle mit
  drei Zeilen. Zweiter Lauf folgenlos. Rücknahme: `rollback/66_rollback.sql` (Haken und Nummer
  bleiben, nur die Herkunft geht verloren). Geprüft gegen Postgres 16 (Stand 65): Techniker sieht den
  fremden Auftrag nicht, Nutzer ohne Rechnungsrecht abgewiesen, offener Auftrag abgewiesen; Admin
  vermerkt mit Nummer (Leerzeichen entfernt, Datum und Person vom Server) und ohne; `rechnung_extern`
  direkt umschalten wirkungslos; Nummer nachtragen; Rechnung im MR Assistent für den vermerkten Auftrag
  abgewiesen, ohne eine Nummer zu verbrauchen; Löschen mit und ohne Nummer abgewiesen; Nutzer nimmt
  nicht zurück, Admin schon; danach Rechnung im MR Assistent, Haken intern, ihre Nummer von Hand
  unveränderlich; Kunde in den Papierkorb und zurück lässt die Herkunft stehen; einzelner Auftrag
  gelöscht und wiederhergestellt; zurückgenommen, zweimal; Altbestand mit ERP-Nummer beim erneuten
  Lauf übernommen.
- `67_auslagern_vormerken.sql` – **nach `66`, SQL zuerst, dann die Dateien von v111** (die Oberfläche
  merkt nur noch vor und schreibt `order_articles.lager_satz_id`). Auslagern erst beim Abschließen:
  (1) die Prüfung „Entnahme braucht ein Datum“ aus Migration 46 fällt – `entnahme_order_id` ohne
  `removed_at` ist jetzt die Vormerkung. (2) Spalte `order_articles.lager_satz_id` (Gebühr gehört zu
  einem Satz). (3) `tire_storage_vormerkung_pruefen()`: vormerken nur für einen offenen Auftrag
  desselben Kunden, nicht doppelt. (4) `lager_vormerkung_zurueck()` und `auftrag_lager_entnahme()` auf
  `orders`: Abschließen lagert aus, Wiedereröffnen holt zurück (wenn der Platz frei ist), Stornieren und
  Löschen heben die Vormerkung auf. (5) Bestand: für einen noch offenen Auftrag schon ausgelagerte Sätze
  kommen als vorgemerkt zurück, wenn ihr Platz frei ist. Ergebnistabelle mit drei Zeilen. Zweiter Lauf
  folgenlos. Rücknahme: `rollback/67_rollback.sql` (lagert Vorgemerktes sofort aus, dann die alte
  Prüfung). Geprüft gegen Postgres 16 (Stand 66): Altbestand – offener Auftrag zurück ins Regal,
  erledigter nicht; Techniker merkt vor; zweites Vormerken, fremder Kunde und erledigter Auftrag
  abgewiesen (Meldung mit Nummer); Gebühr mit Satz; Abschließen lagert aus, Wiedereröffnen holt zurück;
  nach neuer Belegung des Platzes bleibt der Satz draußen, ohne Fehler; Stornieren und Löschen heben die
  Vormerkung auf; zurücknehmen; ohne Auftrag sofort auslagern; Abschluss, der an der
  Einlagerungsprüfung scheitert, lässt den Satz im Regal; Nutzer schließt ab; zurückgenommen, zweimal
  (Vorgemerktes ausgelagert, Prüfung wieder da), erneut ausgeführt.
- `68_verfuegbarkeit.sql` – **nach `67`, SQL zuerst, dann die Dateien von v112.** Verfügbarkeit der
  Mitarbeiter: Tabelle `verfuegbarkeiten` (je Mitarbeiter und Tag; `von`/`bis` leer = ganzer Tag),
  Recht `einsatzplanung.verfuegbarkeit` (Vorgabe Admin lesen und schreiben), `verfuegbarkeit_pruefen()`
  (eigene Zeile ohne Recht, nur ab heute; Meldungen im Klartext), Protokoll, Aufräumen nach 12 Monaten
  samt Protokollzeilen (`verfuegbarkeit_aufraeumen()`), vier Richtlinien. Ergebnistabelle mit drei
  Zeilen. Zweiter Lauf folgenlos. Rücknahme: `rollback/68_rollback.sql` (die Einträge sind danach
  weg). Geprüft gegen Postgres 16 (Stand 67): Techniker trägt heute und ein Zeitfenster ein, ein
  13 Monate alter Eintrag samt Protokoll verschwindet; für einen anderen, gestern, Fenster ohne Ende
  oder verkehrt herum abgewiesen; Nutzer und Techniker sehen nur sich; fremdes Löschen still ohne
  Wirkung; eigenes Ändern und Austragen; Verschieben auf einen anderen abgewiesen; Zugang ohne
  Mitarbeiter mit Meldung; Admin sieht alle und trägt für einen ohne Zugang ein, auch gestern;
  doppelter Tag abgewiesen; Superadmin sieht alle; Protokoll; zurückgenommen, zweimal, erneut.
- `69_reifentausch.sql` – **nach `68`, SQL zuerst, dann die Dateien von v112.** Reifentausch auf
  demselben Platz: `tire_storage.kommt_rein`/`tausch_fuer`; Platz-Index ohne hereinkommende Sätze
  (erst der neue, dann der alte weg) und höchstens ein Tausch je Platz; `tire_storage_tausch_pruefen()`;
  `tire_storage_vormerkung_pruefen()` und `auftrag_lager_entnahme()` neu (Abschließen tauscht).
  Ergebnistabelle mit drei Zeilen. Zweiter Lauf folgenlos. Rücknahme: `rollback/69_rollback.sql`
  (wartende Tausch-Sätze werden verworfen, Funktionen und Index wie Migration 67/15; zweimal
  lauffähig). Geprüft gegen Postgres 16 (Stand 68): Tausch angelegt; zweiter Satz und zweiter Tausch
  auf dem Platz abgewiesen; gegen nicht vorgemerkten Satz und falschen Platz abgewiesen; Vormerkung
  zurücknehmen bei stehendem Tausch abgewiesen; von Hand wirksam machen und nachträglich zum Tausch
  machen abgewiesen; Abschließen tauscht; Wiedereröffnen lässt den neuen auf dem Platz; Storno hebt die
  Vormerkung auf, danach scheitert der Abschluss mit Meldung, nach erneutem Vormerken geht er; Tausch
  verwerfen; zurückgenommen, zweimal, erneut; Migration-67-Verhalten danach unverändert.

## Noch auszuführen

- `70_unterschrift_fest.sql` – **nach `69`, SQL zuerst, dann die Dateien von v114.** Die Unterschrift
  eines erledigten Auftrags steht fest: `auftrag_unterschrift_pruefen()` (BEFORE INSERT/DELETE auf
  `auftrag_belege`) lehnt am erledigten Auftrag eine zweite Unterschrift und das Löschen der
  Unterschrift ab, am stornierten jede Unterschrift; fehlt sie beim Abschluss, darf sie nachgeholt
  werden. Fotos sind frei. Ergebnistabelle mit zwei Zeilen. Zweiter Lauf folgenlos. Rücknahme:
  `rollback/70_rollback.sql` (ändert keine Daten; zweimal lauffähig). Geprüft gegen Postgres 16
  (Stand 69): offen zweimal unterschrieben; nach dem Abschluss dritte abgewiesen, Foto geht;
  Unterschrift löschen abgewiesen, Foto löschen geht; ohne Unterschrift abgeschlossen – Nachholen
  geht, zweite abgewiesen; wiedereröffnet – neue und Löschen gehen; storniert – Unterschrift
  abgewiesen, Foto geht; Auftrag samt Unterschrift löschen (Kaskade) und endgültiges Löschen eines
  Kunden aus dem Papierkorb gehen; zurückgenommen, zweimal, erneut ausgeführt.
- `71_notiz_je_rad.sql` – **nach `70`, SQL zuerst, dann die Dateien von v115.** Notiz je Rad am
  eingelagerten Satz: `tire_storage.notiz_vl`, `notiz_vr`, `notiz_hl`, `notiz_hr` (Prüfregel höchstens
  300 Zeichen), unabhängig von „ein Wert für den Satz“ oder „je Rad“; vorhandene Bemerkungen gemessener
  Räder werden übernommen, wo am Satz noch nichts steht (`eingelagerte_raeder.bemerkung` bleibt, die
  App schreibt sie nicht mehr); `kunde_auskunft()` liefert zusätzlich `reifen_notizen`. Ergebnistabelle
  mit zwei Zeilen. Zweiter Lauf folgenlos (kein Satz wird erneut geändert). Rücknahme:
  `rollback/71_rollback.sql` (schreibt Notizen in leere Bemerkungen gemessener Räder zurück und
  entfernt die Spalten in EINER Anweisung – Notizen an Sätzen ohne gemessene Räder gehen verloren;
  zweimal lauffähig). Geprüft gegen Postgres 16 (Stand 70): Bemerkungen VL/HR übernommen, leere nicht;
  Admin setzt Notiz VR und Satznotiz; 301 Zeichen abgewiesen; Umschalten auf Satzwert lässt die
  Notizen stehen; Techniker setzt eine Notiz; Auskunft mit vier Notizen und weiter mit Belegen;
  Protokoll hat die Änderung; zurückgenommen (Notiz VR in die leere Bemerkung geschrieben), zweimal,
  erneut ausgeführt.
