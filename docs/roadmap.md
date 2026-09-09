# Roadmap Richtung professionelles, skalierbares System

Priorisierte Liste, von risikoarm/sofort machbar bis groß/planungsbedürftig. Jede Phase
baut nicht zwingend auf der vorherigen auf – sie sind nach Aufwand/Risiko sortiert, nicht
nach fachlicher Abhängigkeit.

## Aktuelle Arbeitsreihenfolge (Stand 28.08.2026)

Phase 0–4 sind erledigt. Aus dem Architektur-Review vom 28.08.2026
(`architektur-review-2026-08.md`) sind die Phasen **6–12** hinzugekommen; sie beheben die dort
gefundenen Sicherheits-, Skalierungs- und Konsistenzmängel. Die fachliche Erweiterung
**Phase 5 (Buchhaltung/Rechnungsstellung)** steht bewusst *hinter* diesen Phasen, weil sie
sonst auf einem Fundament aufsetzt, das Rechte nicht erzwingt und Änderungen nicht
protokolliert.

Reihenfolge, in der gearbeitet wird:

```
6 → 7 → 8 → 9 → 10 → 11 → 12 → dann 5
```

**Alle Sanierungsphasen sind umgesetzt.** Als Nächstes steht die fachliche Erweiterung
Phase 5 (Buchhaltung/Rechnungsstellung) an. Dem Import echter Kundendaten steht nichts mehr
im Weg: die AVV-Frage mit Vercel, Supabase und Nominatim ist am 04.09.2026 geklärt, und die
Altkundenliste liegt als Datenskript unter `supabase/import/` bereit.

| Phase | Inhalt | Auslieferung | Stand |
|---|---|---|---|
| 6 | Sofort-Härtung der Datenbank | Migration 15 | ✅ erledigt |
| 7 | Rollenmodell in die Datenbank | Migration 16 + `lib/constants.ts` | ✅ erledigt |
| 8 | App-Härtung (Header, Leaflet, Geocoding, Secrets) | Code + Migration 17 | ✅ erledigt |
| 9 | Fehlerbehandlung vereinheitlichen | `lib/api`, `app/page.tsx` | ✅ erledigt |
| 10 | Datenladeschicht | Code, mehrere Schritte | ✅ erledigt |
| 11 | Audit-Protokoll, Soft-Delete, Integrität | Migrationen 18/19 + Code | ✅ erledigt |
| 12 | Qualität: `strict`, ESLint, CI, Tests | Konfiguration + Tests | ✅ erledigt |
| 5a | Auftragsablauf: Zustände, Abschluss, Fahrzeug, Auftragsnummer | Migration 20 + Code | ✅ erledigt |
| 5 | Buchhaltung/Rechnungsstellung | offen | 🔜 als Nächstes |

Umgesetzt am 28.08.2026 (Phasen 6–9, 11, 12 und Schritt 10.1) sowie am 29.08.2026 (Rest von
Phase 10). Was dabei anders gelaufen ist als oben geplant, steht jeweils am Ende der
Phasenbeschreibung unter „Abweichung".

Jede Phase ist so geschnitten, dass sie **ein** Auslieferungspaket ergibt (eine Pfadliste zum
Nachziehen in GitHub, höchstens eine neue Migration im Supabase-SQL-Editor). Die Buchstaben-
Kürzel (A1, B3, C4 …) in den Phasenbeschreibungen verweisen auf die Befunde im Review.

## Phase 0 – sofort, risikoarm (erledigt)

- ✅ **Doppeltes Branding behoben** (siehe `design-system.md`): Sidebar-Kopfzeile
  (`.app-brand-header`) zeigt sich jetzt nur noch auf dem Handy, `.nav-brand` in `#iconNav`
  nur auf Desktop/Tablet – nie beide gleichzeitig.
- ✅ **`ORDER_STATUS_LABEL` zentralisiert**: die vormals dreifach duplizierte lokale
  `statusLabel`-Konstante (`CustomerOrderRow`, `AuftraegePanel`, `EinsatzplanungPanel`)
  referenziert jetzt eine einzige Modul-Konstante (siehe `konstanten-register.md`).
- ✅ **`DEFAULT_VAT_RATE` als Konstante** (`lib/helpers.ts`) statt zweimal die Zahl `19`.
- ✅ **`DEFAULT_GEOCODE_REGION`/`DEFAULT_MAP_CENTER`/`DEFAULT_MAP_ZOOM` als benannte
  Konstanten** statt literaler Werte in `geocodeAddress()` und dem Karten-Init-Effekt.

Alle vier Punkte ändern kein sichtbares Verhalten (außer der Branding-Korrektur, die genau
das beabsichtigte sichtbare Verhalten war) – konkrete Umsetzung der Konstanten-Regel aus
`docs/README.md`.

## Phase 1 – Konstanten/Konfiguration konsolidieren (erledigt)

- ✅ `lib/constants.ts` angelegt: `ROLE_LABEL`, `ORDER_STATUS_LABEL`, `PERMISSION_CATALOG`/
  `PERMISSION_DEFAULTS`/`PERMISSION_ROLES` (+ `PermItem`-Typ), `EMP_COLORS` – vorher verstreut
  in `app/page.tsx` definiert, jetzt an einer Stelle, `app/page.tsx` importiert sie.
- Rein modul-lokale Konstanten (`DEFAULT_VAT_RATE`/`DEFAULT_GEOCODE_REGION` in
  `lib/helpers.ts`, `MAP_STYLES`/`DEFAULT_MAP_CENTER`/`DEFAULT_MAP_ZOOM` in
  `lib/mapStyles.ts`) bleiben bewusst bei ihrem Thema statt in `lib/constants.ts` gesammelt
  zu werden – siehe Begründung in der Datei selbst.
- Regel bleibt bestehen: bei jeder neuen Funktion vorab prüfen: "gibt es dafür schon eine
  Konstante, oder lege ich gerade eine zweite Quelle für denselben Wert an?" – siehe
  `docs/README.md`.

## Phase 2 – `app/page.tsx` aufteilen (größter Hebel für Skalierbarkeit, erledigt)

Ausgangslage war eine Datei mit über 3.660 Zeilen (siehe `architektur.md`). Schrittweise,
mit `npx tsc --noEmit`/`npm run build`-Verifikation nach jedem einzelnen Verschiebe-Schritt,
wurden ausgelagert:

- Zustandslose Bausteine ohne `HomePage`-State-Abhängigkeit: `components/icons.tsx`,
  `components/NavItem.tsx`, `components/EmployeeCheckboxList.tsx`, `lib/calendar.ts`.
- Kunden-Bausteine: `components/kunden/CustomerRowMeta.tsx`, `AddCustomerForm.tsx`,
  `DetailModal.tsx` (inkl. der darin verschachtelten `CustomerOrderRow.tsx`,
  `AddOrderInline.tsx`, `VehicleSection.tsx`), sowie die modulübergreifend genutzte
  `components/CustomerPicker.tsx`.
- Admin-Bausteine: `components/admin/SettingsPanel.tsx`, `AdminPanel.tsx`,
  `PermissionMatrix.tsx`, `artikel/ArticleAdminPanel.tsx`, `artikel/ArticleDetailEditor.tsx`.
- Aufträge-Bausteine: `components/auftraege/AuftraegePanel.tsx`, `OrderModal.tsx`,
  `ArticleAssignPanel.tsx`.
- Einsatzplanung: `components/einsatzplanung/EinsatzplanungPanel.tsx`.
- Lager: `components/lager/LagerPanel.tsx` (inkl. `TireAssignModal`, `SlotNumberingFields`).

`app/page.tsx` ist dadurch von ~3.660 auf ~1.480 Zeilen geschrumpft. Jeder Schritt war ein
reines Verschieben (Code + zugehörige Imports in eine neue Datei, Import zurück in
`HomePage`) ohne Logik- oder Verhaltensänderung. Was in `app/page.tsx` bleibt, ist
bewusst so: der komplette App-State, die `refreshX()`/CRUD-Funktionen (Supabase-Zugriffe),
Popover-Logik und das Zusammenstecken/Routing der Tabs. Zielstruktur erreicht:

```
components/
  icons.tsx, NavItem.tsx, EmployeeCheckboxList.tsx, CustomerPicker.tsx
  kunden/
    CustomerRowMeta.tsx, AddCustomerForm.tsx, DetailModal.tsx,
    CustomerOrderRow.tsx, AddOrderInline.tsx, VehicleSection.tsx
  admin/
    SettingsPanel.tsx, AdminPanel.tsx, PermissionMatrix.tsx,
    artikel/ArticleAdminPanel.tsx, artikel/ArticleDetailEditor.tsx
  auftraege/
    AuftraegePanel.tsx, OrderModal.tsx, ArticleAssignPanel.tsx
  einsatzplanung/EinsatzplanungPanel.tsx
  lager/LagerPanel.tsx
lib/
  constants.ts, calendar.ts, api/*.ts                            ← siehe Phase 3
app/page.tsx                                                    ← App-State + Layout + Zusammenstecken
```

## Phase 3 – Datenzugriffsschicht (erledigt)

Alle `supabase.from(...).select/insert/update/delete`-Aufrufe aus `app/page.tsx` sind in
eine eigene `lib/api/*.ts`-Schicht gezogen, modulweise mit `npx tsc --noEmit`/
`npm run build` nach jedem Schritt verifiziert:

- `lib/api/customers.ts` – Kunden + Kontakt-Historie (inkl. Geocoding-Anstoß bei
  Adressänderung, Kunde-anlegen-mit-erstem-Auftrag).
- `lib/api/orders.ts` – Aufträge/Termine + `order_employees`-Zuordnung.
- `lib/api/employees.ts` – Mitarbeiter (Einsatzplanung).
- `lib/api/vehicles.ts` – Fahrzeuge je Kunde.
- `lib/api/articles.ts` – Artikelstamm, Preis-Historie (inkl. Auto-Schließen überlappender
  Preiszeiträume), Auftrags-Artikelzeilen.
- `lib/api/lager.ts` – Warehouses, Lagerplätze (inkl. Bulk-Nummerierung), Reifen-Einlagerung
  (inkl. Soft-Delete-Historie).
- `lib/api/permissions.ts` – Modul-Berechtigungen (`module_permissions`).
- `lib/api/session.ts` – eigene Rolle + Anzeige-Einstellungen beim Initial-Load
  (inkl. Anlegen der `user_settings`-Zeile beim allerersten Login).

Muster durchgängig: jede `lib/api`-Funktion nimmt den Supabase-Client als ersten Parameter
und gibt Daten zurück statt selbst React-State zu setzen (`fetchX(supabase)` →
`setX(await fetchX(supabase))` in `HomePage`); reine Business-Logik, die eng mit der
Tabellenstruktur zusammenhängt (z. B. das automatische Schließen eines alten
Preiszeitraums beim Anlegen eines neuen Artikelpreises), lebt in der jeweiligen
`lib/api`-Datei statt in `app/page.tsx`. `app/page.tsx` ist dadurch von ~1.480 auf ~1.290
Zeilen geschrumpft; verbleibend sind der App-State selbst, die dünnen
`refreshX()`/`addX()`/`updateX()`/`deleteX()`-Wrapper, Popover-Logik, Karten-Initialisierung
und Tab-Routing – bewusst so, siehe `architektur.md`.

Nicht in `lib/api` gezogen, bewusst: `supabase.auth.getUser()`/`signOut()` (Sitzungssteuerung,
kein Tabellenzugriff) und alles, was direkt mit dem Leaflet-Karten-Objekt arbeitet.

## Phase 4 – Absicherung/Qualität

- ✅ **CI eingerichtet**: `.github/workflows/typecheck.yml` läuft bei jedem Push/PR auf
  `main` und führt `npx tsc --noEmit` sowie `npm run build` (mit Platzhalter-
  Umgebungsvariablen) aus – Vitali sieht das Ergebnis direkt am Commit/an der PR, auch ohne
  eigenen Terminal-Zugriff. Ersetzt keine echten Tests (es gibt noch keine im Repo), fängt
  aber TypeScript-Fehler und kaputte Builds ab, bevor sie auf Vercel landen.
- ✅ **Techniker-Rolle mit echten Rechten** (Entscheidung von Vitali: nur eigene Aufträge
  sehen, kein Zugriff auf Admin/Kunden-Stammdaten, Status/Notiz an eigenen Aufträgen ändern):
  - Migration `13_techniker_auftraege_rechte.sql` erzwingt das per RLS auf `orders`, nicht
    nur in der Oberfläche: Techniker sieht nur Aufträge, denen sein verknüpfter
    Mitarbeiter-Datensatz (`employees.profile_id`) über `order_employees` zugeordnet ist,
    darf keine Aufträge anlegen/löschen, und darf an einem eigenen Auftrag ausschließlich
    `status` und die neue Spalte `techniker_notiz` ändern – ein Datenbank-Trigger lehnt jede
    Änderung an anderen Spalten ab, selbst bei einem manipulierten API-Aufruf.
  - `AuftraegePanel`/`EinsatzplanungPanel` blenden für die Techniker-Rolle zusätzlich
    "+ Auftrag", Löschen sowie die Mitarbeiter-/Leistungen-Zuordnungs-Popover aus und zeigen
    stattdessen eine reine Notiz-Eingabe (neue Spalte "Notiz" in beiden Tabellen).
  - Kein Zugriff mehr auf "Kunden"/"Neuer Kunde"/"Inaktive Kunden": `PERMISSION_DEFAULTS`
    (siehe `lib/constants.ts`) enthält "techniker" dort nicht mehr. **Falls in
    `module_permissions` schon eine Zeile aus einem älteren Stand existiert**, überschreibt
    die Datenbank-Zeile diesen Fallback – dann bitte einmalig im Admin-Bereich unter
    "Modulverwaltung" bei den drei Kunden-Zeilen den Haken bei "Techniker" entfernen.
  - Bewusst NICHT eingeschränkt: `customers`/`vehicles` bleiben für Techniker per RLS lesbar
    (nicht auf zugeordnete Kunden gefiltert), damit z. B. die Kundenadresse im eigenen
    Auftrag (Navigation) und die Kundensuche im Lager-Modul weiter funktionieren – die
    Einschränkung wirkt hier nur über das ausgeblendete "Kunden"-Tab, nicht auf
    Datenbankebene. `order_employees`/`order_articles` bleiben ebenfalls unverändert
    (Techniker könnte diese theoretisch per direktem API-Aufruf ändern, auch wenn die
    Oberfläche das nicht anbietet) – als bekannte Einschränkung dokumentiert, nicht Teil der
    von Vitali gewählten Rechte.
- ✅ **`employees.profile_id` mit echten Accounts verknüpfen** (Entscheidung: manuell im
  Admin-Panel): im Admin-Tab unter "Mitarbeiter (Einsatzplanung)" wählt der Superadmin per
  Dropdown den passenden Login-Account zu jedem Mitarbeiter aus (`lib/api/employees.ts`,
  `updateEmployeeProfileId`). Auf "einfache" Admins nicht ausgeweitet, weil die
  `profiles`-Tabelle laut RLS (Migration 05) nur der Superadmin komplett lesen darf.

## Zwischenstand: Artikel als eigene Kachel + Artikelnummer

Auf Wunsch von Vitali (nicht Teil der ursprünglichen Phasen-Nummerierung, aber hier
dokumentiert): die frühere Unterseite "Artikelstamm" im Admin-Bereich ist jetzt eine eigene
Kachel **"Artikel"** in der Hauptnavigation (unter "Inaktive Kunden"), analog zu den anderen
eigenständigen Modulen wie Lager oder Einsatzplanung.

- Migration `14_artikel_nummer.sql`: neue Spalte `articles.article_number`. Beim Anlegen eines
  Artikels automatisch fortlaufend vorbelegt (Sequenz `article_number_seq`), in der
  Artikel-Übersicht aber bewusst frei überschreibbar (Eingabefeld statt reiner Anzeige) – für
  unterschiedliche Artikel(-gruppen) mit eigenen Nummernfolgen (z. B. eigene Nummernkreise je
  Kategorie) reicht eine einzige durchlaufende Sequenz nicht aus. Die Unique-Constraint aus
  Migration 14 bleibt bestehen: eine bereits vergebene Nummer wird beim Speichern mit einer
  Fehlermeldung abgelehnt. In der Tabelle die erste Spalte, vor der Kurzbezeichnung.
- Sichtbarkeit über neuen Modul-Berechtigungs-Schlüssel `view.artikel` (Default: Admin +
  Nutzer, wie bei "Kunden"/"Neuer Kunde" – kein Techniker-Zugriff, siehe Phase 4). Pflegen
  (Artikel/Preise anlegen/ändern) bleibt unverändert nur Admin/Superadmin vorbehalten (RLS aus
  Migration 12).
- `components/admin/artikel/ArticleAdminPanel.tsx` bewusst am bisherigen Dateipfad belassen
  (nur die Einbindung in `app/page.tsx` hat sich geändert, nicht der Ordner) – ein Verschieben
  hätte eine verwaiste Kopie im OneDrive-Ordner hinterlassen, die Vitali manuell über GitHub
  hätte löschen müssen.

## Zwischenstand: Navigations-Icon

Ebenfalls auf Wunsch von Vitali: der Navigations-Button in Auftrags-/Terminzeilen zeigt jetzt
`IconNavPin` (`components/icons.tsx`) – ein farbiger Standort-Pin – statt des vorherigen
Kompass-Emojis. Keine Datenbank-/API-Änderung, reines UI-Icon. `docs/design-system.md` und
`docs/kunden-und-karte.md` sind entsprechend aktualisiert.

## Phase 5a – Auftragsablauf (Vorstufe zur Rechnungsstellung)

> **✅ Erledigt am 29.08.2026** – `supabase/migrations/20_auftragsablauf.sql`,
> `components/auftraege/AuftragModal.tsx` (neu) und die davon berührten Panels.
>
> Nicht ursprünglich geplant, sondern aus der Nutzung entstanden: der Auftragsstatus war ein
> Auswahlfeld, das nichts durchsetzte und nichts auslöste – man konnte beliebig zwischen
> „Offen", „In Arbeit" und „Erledigt" springen, und ein erledigter Auftrag blieb so veränderbar
> wie ein offener. Damit fehlte genau der Zeitpunkt, ab dem feststeht, was abgerechnet wird.
>
> Gebaut wurde: Zustandsmaschine mit geregelten Übergängen, Einfrieren der Positionen beim
> Abschluss (in der Datenbank, nicht in der Oberfläche), Wiedereröffnung nur für Admins mit
> Begründung, Auftragsnummer, Fahrzeugbezug am Auftrag, und das Auftragsfenster, das das viel
> zu kleine Leistungen-Popover ersetzt. Konzept und Umsetzungsstand: `auftragsablauf.md`.
>
> **Damit ist die erste Hälfte von Phase 5 erledigt.** Was noch fehlt, ist die Rechnung selbst.

## Phase 5 – Buchhaltung/Rechnungsstellung

> **Gesperrt bis Phase 11.** Rechnungen brauchen ein Fundament, das nachweisen kann, wer wann
> was geändert hat, und das belegrelevante Daten nicht spurlos löschbar macht. Beides entsteht
> erst in Phase 11 (Audit-Protokoll + Soft-Delete). Vorher gebaut, müsste die Rechnungslogik
> nachträglich umgebaut werden.

Auf `order_articles` aufsetzen (Preis-Schnappschuss ist dafür bereits vorbereitet, siehe
`artikelstammdaten.md`) – erst sinnvoll planbar, wenn feststeht, ob/wie Rechnungen aus der
App selbst erzeugt werden sollen oder nur als Datengrundlage für ein externes
Buchhaltungssystem dienen.

## Bekannte Betriebs-Einschränkungen (unabhängig von obigen Phasen)

- **AVV/DPA: erledigt (04.09.2026).** Der Auftragsverarbeitungsvertrag mit Vercel und Supabase
  ist geschlossen; die frühere Beschränkung auf Testdaten in der produktiven Instanz ist
  aufgehoben. Der Punkt bleibt hier als Historie stehen, weil mehrere Entscheidungen in
  diesem Dokument mit ihm begründet sind – etwa die serverseitige Geokodierung (A9), die
  ohnehin die bessere Lösung ist und bleibt.
- CARTOs kostenlose Kartenkacheln (`light_all`/`dark_all`) sind seit August 2026 nicht mehr
  ohne kostenpflichtigen API-Key nutzbar – deshalb wurden die Kartenstile „Hell"/„Dunkel"
  ersatzlos entfernt. Aktuell verfügbare Stile: Straße (OSM), Satellit, Satellit mit
  Beschriftung (beide Esri).

---

# Sanierungsphasen aus dem Architektur-Review (28.08.2026)

Grundlage: `architektur-review-2026-08.md`. Die Kürzel in Klammern verweisen auf die dortigen
Befunde. Vor jeder Auslieferung gilt weiterhin `npx tsc --noEmit` + `npm run build`
(`CLAUDE.md`, Regel 6); jede Migration bekommt die nächste freie Nummer und wird in
`supabase/migrations/README.md` nachgetragen (Regel 5).

## Phase 6 – Sofort-Härtung der Datenbank

> **✅ Erledigt am 28.08.2026** – `supabase/migrations/15_rls_haertung.sql`.
>
> **Abweichung:** Zwei Punkte sind hier mit hineingewandert, statt wie geplant erst in Phase 8
> zu kommen. Erstens die Bereinigung des toten ADMIN_EMAIL-Zweigs (A8): `handle_new_user()`
> musste für den `search_path` ohnehin neu geschrieben werden, und die Funktion zweimal
> hintereinander neu zu definieren wäre nur verwirrend gewesen. Zweitens sind die
> Auftrags-Policies aus Migration 13 auf die neue Hilfsfunktion `public.is_own_order()`
> umgestellt – fachlich identisch, aber die Unterabfrage läuft einmal pro Auftrag statt als
> Inline-EXISTS pro geprüfter Zeile.


**Ziel**: die Löcher schließen, über die sich ein eingeloggter Account heute selbst zum
Superadmin machen oder die Techniker-Einschränkung umgehen kann. Reine Datenbankarbeit, kein
Code, kein sichtbares Verhalten ändert sich.

**Auslieferung**: eine Migration `15_rls_haertung.sql`.

1. **Rollen-Spalte sperren** (A1): `revoke update (role) on public.profiles from authenticated`
   plus Trigger `restrict_profile_role_change()`, der eine Änderung an `role` ablehnt, solange
   `public.current_user_role() <> 'superadmin'`. Die Invite-Route arbeitet mit dem
   Service-Role-Key und ist davon nicht betroffen.
2. **`search_path` fixieren** (A4): `handle_new_user()`, `current_user_role()`,
   `current_employee_id()` mit `set search_path = ''` neu anlegen, alle Objekte voll
   qualifizieren (`public.profiles` statt `profiles`).
3. **Techniker-Umgehung schließen** (A3):
   - `order_employees`: die Alles-Policy ersetzen durch „Nicht-Techniker verwalten
     Zuordnungen" + „Techniker liest eigene Zuordnungen" (Muster wie `orders`, Migration 13).
   - `order_articles`: SELECT/Schreiben für Techniker auf Aufträge einschränken, die ihm über
     `order_employees` zugeordnet sind.
4. **Spalten-Trigger auf Positivliste umstellen** (A5): `restrict_techniker_order_update()` so
   umbauen, dass es `to_jsonb(new) - 'status' - 'techniker_notiz' - 'updated_at'` gegen
   `to_jsonb(old)` minus derselben Schlüssel vergleicht. Damit sind künftige Spalten
   automatisch geschützt, statt vergessen zu werden.
5. **Indizes anlegen** (B3): auf allen Fremdschlüsseln und den Feldern, die die RLS-Policies
   und die Kalenderansicht pro Zeile auswerten – Liste steht im Review unter B3.
6. **RLS-Aufrufe kapseln** (B4): `auth.role()`/`current_user_role()` in Sub-Selects packen
   (`(select auth.role())`) und allen Policies `to authenticated` mitgeben.
7. **Ein aktiver Reifensatz je Lagerplatz** (C4):
   `create unique index on public.tire_storage (storage_slot_id) where removed_at is null;`
   Vorher einmalig prüfen, ob es bereits doppelte aktive Zeilen gibt – dann zuerst bereinigen,
   sonst schlägt das Anlegen des Index fehl.

**Prüfen nach dem Ausführen**: mit einem Techniker-Testaccount versuchen, (a) die eigene Rolle
zu ändern, (b) einen fremden Auftrag über `order_employees` an sich zu ziehen. Beides muss
abgelehnt werden. Der Supabase-Security-Linter sollte danach keine
„function_search_path_mutable"-Warnung mehr zeigen.

## Phase 7 – Rollenmodell in die Datenbank

> **✅ Erledigt am 28.08.2026** – `supabase/migrations/16_rechte_in_der_datenbank.sql`.
>
> **Abweichung:** `customers`, `vehicles`, `employees` und der Artikelstamm bleiben für jeden
> eingeloggten Account **lesbar**; nur das Schreiben hängt jetzt an den Modul-Berechtigungen.
> Das ist keine Nachlässigkeit, sondern die schon in Migration 13 getroffene Entscheidung:
> ein Techniker braucht die Kundenadresse seines eigenen Auftrags für die Navigation, die
> Kundensuche im Lager und die Mitarbeiternamen in seinen Listen. Würde man das per RLS
> abschneiden, wären genau diese Funktionen kaputt. Das Ausblenden des Kunden-Tabs regelt
> weiterhin die Modulverwaltung in der Oberfläche.
>
> Zusätzlich zum Plan: neuer Schlüssel `action.admin.employee_manage` (Mitarbeiter-Stammdaten
> waren vorher für jeden schreibbar), und die tote Tabelle `appointments` hat ihre
> Alles-erlaubt-Policy verloren – sie war eine offene Schreibfläche ohne Nutzen.


**Ziel**: `module_permissions` wird von einer reinen Oberflächen-Einstellung zur echten
Zugriffskontrolle. Das ist der größte Einzelschritt der Sanierung und zugleich die
Voraussetzung dafür, dass jedes künftige Modul seine Rechte *erbt*, statt sie neu zu erfinden.

**Auslieferung**: eine Migration `16_rechte_in_der_datenbank.sql` + Anpassung von
`lib/constants.ts`.

1. **Hilfsfunktion** (A2): `public.has_module_permission(p_key text)` – liefert `true` für
   Superadmin oder wenn die eigene Rolle in `module_permissions.edit_roles` des Schlüssels
   steht. `security definer`, `stable`, `set search_path = ''`.
2. **Policies pro Tabelle** darauf umstellen, getrennt nach SELECT/INSERT/UPDATE/DELETE statt
   `for all`: `customers`/`contact_history` an `view.kunden`, `vehicles` an `view.kunden`,
   `warehouses`/`storage_slots` an `action.lager.warehouse_*`/`slot_*`, `tire_storage` an
   `action.lager.tire_assign`, `employees` an einen neuen Schlüssel
   `action.admin.employee_manage`, `articles`/`article_prices` bleiben bei
   Admin/Superadmin (Migration 12).
3. **Katalog als einzige Quelle** (C2): `PERMISSION_CATALOG` in `lib/constants.ts` ist die
   Wahrheit; die Migration gleicht `module_permissions` daran ab – fehlende Schlüssel
   (`view.artikel`) einfügen, überzählige (`'lager'` aus Migration 09) löschen, und die
   Techniker-Haken bei `view.kunden`/`view.neuer_kunde`/`view.inaktive_kunden` entfernen, die
   seit Phase 4 nur noch als veraltete Datenbankzeile überleben.
4. **Neue Schlüssel dokumentieren**: `konstanten-register.md` und
   `berechtigungen-und-rollen.md` mitziehen, inklusive der Regel „neues Modul = neue
   `view.<modul>`-Zeile im Katalog **und** Policy auf der zugehörigen Tabelle".

**Prüfen**: je ein Testaccount pro Rolle; für jede Rolle stichprobenartig lesen, anlegen und
löschen auf Kunden, Lager und Aufträge – das Ergebnis muss dem entsprechen, was die
Modulverwaltung anzeigt. Anschließend einen Haken in der Modulverwaltung umlegen und
gegenprüfen, dass sich das Verhalten sofort mit ändert.

## Phase 8 – App-Härtung

> **✅ Erledigt am 28.08.2026** – `next.config.mjs`, `app/layout.tsx`, `app/page.tsx`,
> `app/api/geocode/route.ts`, `lib/helpers.ts`, `lib/supabaseServer.ts`, `.env.example`,
> `supabase/migrations/17_geocode_cache.sql`.
>
> **Offen geblieben:** Die CSP erlaubt bei `script-src` weiterhin `'unsafe-inline'`, weil
> Next.js seinen Bootstrap-Code inline einbettet. Der eigentliche Gewinn ist trotzdem da –
> fremde Skript-Hosts sind ausgeschlossen, und Leaflet kommt seit dieser Phase als npm-Paket
> statt von cdnjs. Eine nonce-basierte CSP bräuchte eine Nonce-Erzeugung in `middleware.ts`
> und ist ein eigener, kleiner Folgeschritt.
>
> Ebenfalls bewusst offen: die Drosselung in der Geocoding-Route wirkt pro Server-Instanz. Für
> einzelne Adressen bei der Kundenanlage reicht das; ein Massenimport braucht einen echten
> zentralen Warteschlangenlauf.


**Ziel**: die Angriffsfläche außerhalb der Datenbank schließen. Kleine, voneinander
unabhängige Schritte – lässt sich auch in zwei Auslieferungen teilen.

1. **Security-Header** (A6): `headers()` in `next.config.mjs` mit
   `Content-Security-Policy`, `X-Frame-Options: DENY` bzw. `frame-ancestors 'none'`,
   `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (Kamera/Mikrofon/
   Geolocation aus) und `Strict-Transport-Security`. Die CSP muss Supabase, Google Fonts und –
   bis Schritt 2 greift – cdnjs erlauben.
2. **Leaflet als npm-Abhängigkeit** (A6, C8): `leaflet` + `@types/leaflet` in `package.json`,
   `<script>`/`<link>` aus `app/layout.tsx` entfernen. Beseitigt in einem Zug das fehlende
   SRI-Attribut, das ungetypte `(window as any).L` und die `setTimeout(tryInit, 60)`-Warteschleife.
   Danach die CSP von `cdnjs` befreien.
3. **`server-only`-Schutzschild** (A7): `import "server-only";` als erste Zeile in
   `lib/supabaseServer.ts`, `require("@supabase/supabase-js")` durch einen normalen Import
   ersetzen.
4. **Geocoding serverseitig** (A9): neue Route `app/api/geocode/route.ts`, die die Anfrage
   bündelt, einen identifizierenden User-Agent setzt, auf eine Anfrage pro Sekunde drosselt
   und das Ergebnis in einer neuen Tabelle `geocode_cache` (Migration 17) ablegt.
   `geocodeAddress()` in `lib/helpers.ts` ruft dann diese Route statt Nominatim direkt.
   Nebeneffekt: der Massen-Import in Phase 10 wird dadurch überhaupt erst zulässig.
5. **Toten ADMIN_EMAIL-Pfad entfernen** (A8): die `current_setting('app.admin_email')`-Logik
   aus `handle_new_user()` streichen (in Migration 17 mit), `ADMIN_EMAIL` aus `.env.example`
   nehmen und in `README.md`/`CLAUDE.md` klarstellen, dass der Superadmin bewusst per
   Nutzerverwaltung vergeben wird.
6. **Literale aufräumen, die hier auffallen** (D2): der `"nürnberg"`-Vergleich in
   `geocodeAddress()` wandert auf `DEFAULT_GEOCODE_REGION`.

**Prüfen**: Seite laden und in den DevTools kontrollieren, dass keine CSP-Verstöße in der
Konsole stehen und die Karte weiterhin alle drei Kartenstile zeigt.

## Phase 9 – Fehlerbehandlung vereinheitlichen

> **✅ Erledigt am 28.08.2026** – `lib/api/client.ts` (neu), alle acht `lib/api/*.ts`,
> `app/page.tsx`, `app/globals.css`.
>
> **Abweichung vom Plan, bewusst:** Statt eines Rückgabetyps `ApiResult<T>` **wirft** die
> Datenzugriffsschicht jetzt eine `ApiError`, und `app/page.tsx` fängt alles an einer einzigen
> Stelle über einen `unhandledrejection`-Listener ab. Drei Gründe: einen geworfenen Fehler
> kann der Aufrufer nicht versehentlich ignorieren; das `refreshX()` nach einem
> fehlgeschlagenen Schreibvorgang unterbleibt automatisch, sodass die Eingabe des Nutzers
> stehen bleibt (genau der dritte Punkt der ursprünglichen Planung, hier gratis); und es ist
> die Form, die TanStack Query in Phase 10 erwartet – ein `ApiResult`-Vertrag wäre dort sofort
> wieder ersetzt worden. Der Diff ist dadurch außerdem deutlich kleiner, weil die rund 60
> Aufrufstellen in `HomePage` unverändert bleiben konnten.
>
> Ausnahme, die weiterhin einen Rückgabewert nutzt: `updateArticleNumberById()`. Eine bereits
> vergebene Artikelnummer ist ein erwarteter Bedienfehler, keine Störung.


**Ziel**: kein stiller Datenverlust mehr. Heute werten 58 Supabase-Aufrufe in `lib/api`
zusammen vier Mal `error` aus – eine abgelehnte Schreiboperation verschwindet spurlos, und
`refreshX()` überschreibt die Eingabe des Nutzers mit dem alten Serverstand (B5).

**Auslieferung**: Code, modulweise – `lib/api/*.ts` und `app/page.tsx`. Gut in zwei bis drei
Pakete teilbar (z. B. Kunden/Aufträge, Lager/Fahrzeuge, Artikel/Rechte).

1. Einheitlicher Rückgabetyp `ApiResult<T> = { data: T | null; error: string | null }` in
   `lib/api/types.ts`, jede `lib/api`-Funktion gibt ihn zurück statt `void`/`T`.
2. In `HomePage` eine zentrale `handle()`-Hilfsfunktion, die den Fehlerfall in einen State
   `toast` kippt; eine schlichte, nicht blockierende Meldung unten rechts in `globals.css`.
   Ersetzt zugleich das einzelne rohe `alert()` in `updateArticleNumber`.
3. Bei Fehlschlag **kein** `refreshX()` – die Eingabe des Nutzers bleibt stehen, damit er sie
   nicht neu tippen muss.

**Prüfen**: mit einem Testaccount ohne Recht eine Änderung versuchen (nach Phase 7 lehnt die
Datenbank sie ab) – es muss eine verständliche Meldung erscheinen, keine stille Rückabwicklung.

## Phase 10 – Datenladeschicht: Pagination und Laden pro Modul

> **✅ Erledigt** – Schritt 1 am 28.08.2026 (`lib/api/client.ts`: `fetchPaged`, `PAGE_SIZE`),
> der Rest am 29.08.2026 (`lib/queries/*`, `app/providers.tsx`, `app/page.tsx`, `lib/api/*`).
>
> **Abweichung, und zwar eine grundsätzliche:** Die geplanten Schritte 2 und 3 – jede Suche
> und jeden Filter als Datenbankabfrage, die Karte über eine Bounding-Box – sind bewusst NICHT
> so umgesetzt worden. Der Grund liegt in den Zahlen: Kunden sind eine Menge mit fester Größe
> (~4500, rund 1,4 MB), Aufträge dagegen wachsen unbegrenzt weiter. Für die Kunden ist einmal
> laden und im Browser filtern das bessere Verhalten – die Suche reagiert ohne Verzögerung,
> und die Karte braucht keine eigene Abfrage bei jedem Verschieben. Serverseitig zu filtern
> hätte hier Tempo gekostet statt gewonnen. Was tatsächlich gebaut wurde:
>
> - **Zeitfenster für Aufträge** statt Filtern über alles: standardmäßig erledigte Aufträge der
>   letzten 30 Tage plus **alle** offenen, unabhängig vom Alter. Umschaltbar auf „Dieses Jahr"
>   und „Alle" über einen Schalter direkt über der Liste (`FensterSchalter`). Das ist die
>   einzige sichtbare Verhaltensänderung dieser Phase – siehe
>   `auftraege-termine-einsatzplanung.md`.
> - **Zuordnungen kommen verschachtelt mit den Aufträgen** (`order_employees`, `order_articles`
>   in derselben Abfrage) statt als zwei weitere Vollabzüge über eigene Tabellen. Sie können
>   dadurch gar nicht mehr zum geladenen Fenster in Widerspruch geraten.
> - **Kundendetail lädt die vollständige Historie** dieses einen Kunden, unabhängig vom
>   Zeitfenster – dort will man alles sehen, und je Kunde ist die Zeilenzahl klein.
> - **Fahrzeuge nur für den geöffneten Kunden** statt der kompletten Tabelle.
> - **Lager, Artikel und Mitarbeiter erst beim Öffnen** des jeweiligen Moduls.
> - **Dashboard-Lagerzahl über zwei count-Abfragen**, statt dafür das ganze Lager zu laden.
> - **Karte zeichnet nur den sichtbaren Ausschnitt** (plus Rand), mit einer Obergrenze von 600
>   Markern und einem Hinweis, wenn weitere im Ausschnitt liegen.
> - **Kundenliste zeichnet 200 Zeilen auf einmal**, nachladbar per Knopf. Gefiltert und gezählt
>   wird weiterhin über den ganzen Bestand.
> - **TanStack Query** als Zwischenspeicher: nach einer Änderung wird gezielt der betroffene
>   Schlüssel für ungültig erklärt statt die ganze Tabelle neu geladen.
>
> Nebenbei behoben: die Terminliste durchsuchte für jeden einzelnen Kunden die komplette
> Auftragsliste erneut – bei ~4500 Kunden Tausende von Durchläufen bei jedem Rendern. Aufträge
> werden jetzt einmal nach Kunde gruppiert.
>
> **Die Sperre für Echtdaten ist damit aufgehoben**, soweit es die Technik betrifft – und seit
> dem 04.09.2026 auch vertraglich (AVV geklärt).


**Ziel**: die App muss mit dem echten Bestand umgehen können. Solange diese Phase offen war,
durften keine echten Kundendaten importiert werden – und zwar nicht nur wegen der damals
offenen AVV-Frage, sondern weil PostgREST bei ~4500 Kunden stillschweigend nur 1000 Zeilen
liefert und Suche, Karte und Dashboard damit falsche, aber plausible Zahlen zeigen (B1).
Diese Phase ist umgesetzt; der technische Grund ist damit entfallen.

**Auslieferung**: Code in mehreren Schritten, jeder einzeln mit `tsc`/`build` verifiziert.

1. **Sofortmaßnahme gegen die stille Kappung** (B1): jede `fetchX()`-Funktion bekommt ein
   explizites `.range()`; wo eine vollständige Liste gebraucht wird, seitenweise nachladen,
   bis weniger Zeilen als die Seitengröße zurückkommen. Damit ist das Verhalten wenigstens
   korrekt, bevor Schritt 2–4 es auch schnell machen.
2. **Serverseitig filtern statt im Browser**: Kundensuche als `.ilike()`-Abfrage,
   Buchstaben-/PLZ-Filter als Datenbankbedingung, Auftragsliste mit Status-/Zeitraumfilter in
   der Abfrage. Die heutigen `listItems`-Filterketten in `app/page.tsx` entfallen dadurch
   weitgehend.
3. **Karte über Bounding-Box**: Marker nur für den aktuell sichtbaren Kartenausschnitt laden
   (`lat`/`lng` zwischen den Grenzen des Viewports), statt alle Kunden im Speicher zu halten.
4. **Kennzahlen aus der Datenbank**: Dashboard-Zahlen (Gesamt, kontaktiert, offene Aufträge,
   belegte Lagerplätze) über `count`-Abfragen oder eine View, nicht durch Zählen im Browser.
5. **Laden pro Modul statt beim Start** (B2, C1): `@tanstack/react-query` einführen, je Modul
   einen Hook (`useKunden()`, `useAuftraege()`, `useLager()`, `useArtikel()`), der seine Daten
   erst beim Öffnen des Tabs holt und nach einer Änderung gezielt nur den betroffenen Eintrag
   invalidiert – statt der heutigen 13 seriellen Vollabzüge beim Start und eines kompletten
   Tabellen-Neuladens nach jedem Häkchen. `HomePage` behält Layout, Routing und die Karte.

**Prüfen**: Testdatensatz mit >1000 Kunden anlegen (Skript im SQL-Editor) und kontrollieren,
dass Kundenzahl, Suche und Kartenmarker vollständig sind; Ladezeit des Startbildschirms vorher/
nachher vergleichen.

## Phase 11 – Nachvollziehbarkeit und Datenintegrität

> **✅ Erledigt am 28.08.2026** – `supabase/migrations/18_audit_und_integritaet.sql` und
> `19_soft_delete.sql`, dazu `lib/types.ts` und `lib/api/{customers,orders,articles}.ts`.
>
> Umsetzungsdetails, die vom Plan abweichen: die Urheber-Spalten und Trigger werden über eine
> Schleife auf eine Tabellenliste ausgerollt, damit beim nächsten Modul nur ein Name ergänzt
> werden muss statt dreizehn Anweisungen. Die beiden neuen Constraints (eindeutige
> Lagerplatz-Codes, keine überlappenden Preiszeiträume) legen sich selbst nur an, wenn die
> vorhandenen Daten sie erfüllen – sonst gibt die Migration einen Hinweis aus, statt mit einem
> Constraint-Fehler abzubrechen. Überlappende Preiszeiträume werden vorher automatisch
> geschlossen, genau so wie die Anwendung es beim Anlegen eines Preises tut.
>
> Soft-Delete gilt für `customers`, `orders`, `order_articles`. Fahrzeuge, Mitarbeiter, Lager
> und Lagerplätze werden weiterhin hart gelöscht – Stammdaten ohne Belegcharakter.


**Ziel**: das Fundament, das Phase 5 (Rechnungen) braucht – und das die DSGVO-Auskunftspflicht
überhaupt bedienbar macht (C3, C4, C5).

**Auslieferung**: `18_audit_und_integritaet.sql` + `19_soft_delete.sql`, dazu Code-Anpassungen.

1. **Urheber-Spalten**: `created_by uuid not null default auth.uid()` und `updated_by uuid` auf
   allen Geschäftstabellen, gesetzt über einen gemeinsamen Trigger, der zugleich `updated_at`
   pflegt (heute passiert das nirgends automatisch außer bei `orders`).
2. **Änderungsprotokoll**: Tabelle `audit_log` (Tabelle, Datensatz-ID, Aktion, alter/neuer Wert
   als `jsonb`, Nutzer, Zeitpunkt) mit einem generischen Trigger, der auf die
   Geschäftstabellen gelegt wird. Nur Superadmin darf lesen, niemand darf ändern oder löschen.
3. **Soft-Delete für belegrelevante Daten**: `deleted_at` auf `orders`, `order_articles`,
   `customers`; `delete` in `lib/api` durch das Setzen von `deleted_at` ersetzen, alle
   `fetchX()` um `is('deleted_at', null)` ergänzen. `tire_storage` macht das mit `removed_at`
   bereits vor.
4. **Restliche Integritätsregeln** (C4): `unique (warehouse_id, code)` auf `storage_slots`;
   `exclude`-Constraint über `daterange(valid_from, valid_to)` je Artikel auf
   `article_prices`, damit überlappende Preiszeiträume nicht mehr nur im Anwendungscode
   verhindert werden; `article_number` serverseitig vergeben statt vom Client setzbar.
5. **Regel für künftige Migrationen** (C5): `insert`-Anweisungen in Migrationen immer mit
   `on conflict do nothing` oder `where not exists` absichern – als feste Zeile in
   `supabase/migrations/README.md`. Migration 07 und 12 würden bei einem versehentlichen
   zweiten Lauf heute alle Termine bzw. den kompletten Start-Artikelstamm duplizieren.

**Prüfen**: eine Änderung an einem Auftrag vornehmen und kontrollieren, dass `audit_log` sie
mit Nutzer und Zeitpunkt enthält; einen Auftrag „löschen" und prüfen, dass er aus der
Oberfläche verschwindet, in der Datenbank aber mit `deleted_at` erhalten bleibt.

## Phase 12 – Qualitätssicherung

> **✅ Erledigt am 28.08.2026** – `tsconfig.json`, `.eslintrc.json` (neu),
> `.github/workflows/typecheck.yml` (neu), `vitest.config.ts` (neu), `tests/` (neu),
> `package.json`.
>
> Erfreuliche Überraschung: `"strict": true` ließ sich in einem Zug einschalten. Der gesamte
> Anwendungscode war bereits null-sauber – die einzige Fehlerstelle lag in einer Test-Fabrik
> dieser Auslieferung. Die schrittweise Einführung über `strictNullChecks` war also gar nicht
> nötig.
>
> 21 Tests auf die Rechenlogik, an der später Geld hängt: Preis-Gültigkeitszeiträume,
> Rabatt- und MwSt.-Berechnung, ISO-Kalenderwochen und Wochenstart, Lagerplatz-Nummerierung.
> Die CI führt jetzt `tsc --noEmit`, `next lint`, `vitest run` und `next build` aus.


**Ziel**: verhindern, dass die sanierten Punkte wieder zurückfallen (C6, C7).

1. **`strict` in `tsconfig.json`** – schrittweise: erst `strictNullChecks`, Modul für Modul die
   auftretenden Fehler beheben, dann `strict: true`. Gerade die optionalen Datenbankfelder
   (`lat`, `time`, `valid_to`, `profile_id`) sind heute ungeprüft.
2. **CI wiederherstellen und sichtbar machen**: im verbundenen OneDrive-Ordner existiert kein
   `.github/`-Verzeichnis, obwohl `architektur.md` und `CLAUDE.md` einen Workflow
   `typecheck.yml` beschreiben. Zuerst auf GitHub prüfen, ob er dort liegt – wenn ja, die Datei
   in den Ordner zurückholen, damit sie nicht bei der nächsten Änderung verlorengeht; wenn
   nein, neu anlegen.
3. **ESLint**: `next lint` steht in `package.json`, eine Konfiguration fehlt.
   `eslint-config-next` ergänzen und in die CI aufnehmen.
4. **Erste Tests** auf die Rechenlogik, an der später Geld hängt: `orderArticleTotals()`,
   `currentArticlePrice()`, `insertArticlePrice()` (Schließen des Vorgänger-Zeitraums),
   `buildSlotCodes()`. Reine Funktionen, kein Datenbankzugriff nötig – Vitest genügt.

## Konsistenz-Aufräumen (laufend, nicht blockierend)

Kleinteilig, jederzeit nebenbei erledigbar – am besten jeweils mit dem Paket, das die Datei
ohnehin anfasst. Verweise auf die Review-Befunde:

- D1: `ROLE_LABEL` in `app/admin/users/page.tsx` durch den Import aus `lib/constants.ts`
  ersetzen.
- D3: `ASSIGNABLE_ROLES` in `app/api/invite/route.ts` aus dem zentralen `Role`-Typ ableiten.
- D4: `konstanten-register.md` auf `lib/constants.ts` korrigieren (verortet die Konstanten noch
  in `app/page.tsx`).
- D5: `berechtigungen-und-rollen.md` – Abschnitt „Techniker" auf den Stand von Phase 4 bringen.
- D6: Kommentar zu `article_number` in `lib/types.ts` („nicht editierbar") an die Realität
  anpassen.
- D7: tote Altlasten entfernen – **Tabelle `appointments` ist am 29.08.2026 erledigt**
  (`21_appointments_entfernen.sql`, Begründung in `termine-kontakt-auftrag-analyse.md`); den
  Typ `Appointment` gibt es im Code ohnehin nicht mehr. Offen bleiben:
  `orders.assigned_employee_id`, `user_settings.theme`, `module_permissions`-Zeile `'lager'`,
  die ungenutzten Routen `/admin/invite` und `/admin/users`. Jeweils erst prüfen, ob wirklich
  nichts mehr darauf zeigt; Löschungen im Repo muss Vitali manuell über GitHub machen
  (`CLAUDE.md`, Regel 4).
- D8: private E-Mail-Adresse in Migration 05 – die Datei bleibt unverändert (ausgeführte
  Migration), aber künftige Migrationen enthalten keine Klarnamen mehr.
- D9: die Kopfkommentare der Migrationen 04–14 sagen „Noch auszuführen", obwohl alle laufen.
  Bewusst nicht korrigiert – ausgeführte Migrationsdateien bleiben unangetastet; der gültige
  Stand steht in `supabase/migrations/README.md`.

## Phase 13 – Ausbau zur PWA (Stufen 1–3 erledigt, Stand 09.09.2026)

Installierbare Web-App mit eigenem Symbol, Start ohne Adressleiste und – je nach Entscheidung –
Offline-Betrieb. Stufenplan, Aufwands- und Risikoeinschätzung sowie die offenen Fragen
(Datenschutz bei lokal gespeicherten Kundendaten, Kartenkacheln, Geräte/iOS-Fassungen) stehen
in `pwa-plan.md`. **Stufe 1 (installierbar) und Stufe 2 (Service Worker für die
Programmhülle) sind umgesetzt** – dort liegt nur Programmcode lokal, keine Kundendaten.
Stufe 3 (Daten offline lesen) und Stufe 4 (offline schreiben) sind offen und hängen an den
Datenschutzfragen in `pwa-plan.md`; Stufe 4 ist ein eigenes Vorhaben in der Größenordnung
von Phase 5.

## Phase 14 – Terminerinnerung als Push (gebaut am 09.09.2026, Einrichtung offen)

Fünf Minuten vor einem Termin eine Benachrichtigung an den zugeordneten Techniker; ein Tippen
öffnet direkt das Kundenfenster (`/?kunde=‹id›`). Setzt Phase 13 voraus – auf iOS geht Push nur
in der installierten App.

Gebaut: Geräteanmeldung (`push_geraete`, Migration 26), Doppelmeldungssperre (`push_versand`,
Migration 27), Zeitgeber im Minutentakt über `pg_cron`/`pg_net` (Migration 28), Versandroute
`app/api/push/senden` mit gemeinsamem Geheimnis, Anzeige und Antippen im Service Worker.

Zum Scharfschalten fehlen drei Handgriffe von Hand (Migrationen 27/28, Geheimnis in Vercel und
in `private.push_konfiguration`) – die Schritte, die Kontrollabfragen und die Begründungen
stehen in `benachrichtigungen-plan.md`. Offen bleibt die eigentliche Frage des Vortests:
kommt die Meldung bei gesperrtem Bildschirm und im Fokus „Fahren" an?
