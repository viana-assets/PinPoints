# Architektur-Review 28.08.2026

Vollständige Durchsicht des Repos (Migrationen 01–14, `app/`, `components/`, `lib/`, Doku)
mit drei Fragen: Ist das gegen Angriffe abgesichert? Trägt es die geplanten Datenmengen?
Lässt sich darauf ein ERP mit weiteren Modulen aufbauen?

Kurzfassung: die **Bauweise** ist gut – Modulschnitt, Datenzugriffsschicht, Konstanten-Regel,
Preis-Historie mit Schnappschuss, durchnummerierte Migrationen, konsequentes `escapeHtml()` in
den Leaflet-Popups. Das **Fundament** trägt so aber noch nicht: das Rollenmodell existiert
fast nur in der Oberfläche, nicht in der Datenbank, und die Datenladeschicht bricht bei den
geplanten ~4500 Kunden still zusammen. Beides ist mit überschaubarem Aufwand zu beheben,
sollte aber vor jedem weiteren Modul passieren.

Reihenfolge unten: A kritisch (Sicherheit), B hoch (Skalierbarkeit), C mittel
(Erweiterbarkeit/ERP-Fundament), D Konsistenz.

> **Stand 29.08.2026: alle Befunde sind behoben**, mit einer bewussten Teil-Ausnahme.
>
> **A6 teilweise:** die CSP steht, erlaubt bei Skripten aber weiterhin `'unsafe-inline'` für den
> Next.js-Bootstrap; eine nonce-basierte CSP bleibt ein kleiner Folgeschritt.
>
> **B1/B2/C1** sind erledigt, aber anders als hier vorgeschlagen: statt jede Suche
> serverseitig zu filtern, werden Kunden einmal vollständig geladen (feste Menge, ~1,4 MB) und
> im Browser gefiltert, während die unbegrenzt wachsenden Aufträge über ein umschaltbares
> Zeitfenster kommen. Die Begründung steht in `roadmap.md` bei Phase 10.
>
> Dieses Dokument bleibt absichtlich unverändert im Befund-Wortlaut stehen – es beschreibt den
> Zustand, der zu den Maßnahmen geführt hat. Was daraus geworden ist, steht in `roadmap.md`
> bei den Phasen 6–12.

---

## A – Kritisch: Sicherheit

### A1. Jeder eingeloggte Nutzer kann sich selbst zum Superadmin machen

`01_schema.sql`:

```sql
create policy "Nutzer aktualisiert eigenes Profil" on public.profiles
  for update using (auth.uid() = id);
```

Die Policy beschränkt nur, *welche Zeile* geändert werden darf – nicht, *welche Spalten*.
Die Spalte `role` steht in derselben Zeile. Ein beliebiger eingeladener Nutzer kann in der
Browser-Konsole der laufenden App

```js
supabase.from("profiles").update({ role: "superadmin" }).eq("id", <eigene id>)
```

ausführen und hat danach volle Rechte – inklusive Modulverwaltung und Nutzerverwaltung.
Die gesamte Rollen-Governance hängt an dieser einen Spalte.

**Fix**: Spaltenrecht entziehen und Rollenwechsel nur noch über die geprüfte Serverroute bzw.
den Superadmin zulassen:

```sql
revoke update (role) on public.profiles from authenticated;
```

zusätzlich abgesichert durch einen Trigger analog zu `restrict_techniker_order_update()`, der
eine Änderung an `role` ablehnt, wenn `current_user_role() <> 'superadmin'`.

### A2. Das Rollenmodell wird in der Datenbank praktisch nicht erzwungen

10 von 14 Tabellen tragen dieselbe Policy:

```sql
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated')
```

Betroffen: `customers`, `contact_history`, `vehicles`, `appointments`, `warehouses`,
`storage_slots`, `tire_storage`, `employees`, `order_employees`, `order_articles`.

Das heißt: **jeder eingeloggte Account – auch „Techniker" und „Nutzer" – darf sämtliche
Kunden, Fahrzeuge, Lagerplätze, Einlagerungen und Mitarbeiter lesen, ändern und löschen.**
Ein einzelner API-Aufruf löscht den kompletten Kundenstamm. Die Modulverwaltung
(`module_permissions`) blendet in der Oberfläche nur Knöpfe aus; sie ist keine
Zugriffskontrolle. Die feingranularen `action.lager.*`-Schlüssel (Lager anlegen/löschen,
Lagerplätze anlegen/löschen) haben in der Datenbank **keine Entsprechung**.

**Fix**: `module_permissions` in der Datenbank auswertbar machen und die Policies darauf
stützen, statt nur auf „eingeloggt". Eine Hilfsfunktion reicht:

```sql
create or replace function public.has_module_permission(p_key text)
returns boolean language sql security definer stable set search_path = '' as $$
  select public.current_user_role() = 'superadmin'
      or public.current_user_role() = any (
           select edit_roles from public.module_permissions where module_key = p_key
         );
$$;
```

und dann pro Tabelle getrennte SELECT-/INSERT-/UPDATE-/DELETE-Policies, die `view.<modul>`
bzw. `action.<modul>.<x>` abfragen. Damit gilt genau eine Wahrheit für Oberfläche und
Datenbank – und neue Module erben das Muster automatisch.

### A3. Die Techniker-Einschränkung aus Migration 13 ist umgehbar

Migration 13 ist sorgfältig gebaut (RLS + Spalten-Trigger), läuft aber ins Leere, weil die
umliegenden Tabellen offen sind:

1. `order_articles` ist für jeden Eingeloggten lesbar und enthält `order_id` – ein Techniker
   liest darüber die IDs **aller** Aufträge aus, auch der fremden.
2. `order_employees` ist für jeden Eingeloggten beschreibbar – der Techniker trägt sich per
   `insert` selbst bei einem fremden Auftrag ein.
3. Danach greift die Policy „Techniker sieht eigene Aufträge" – der Auftrag ist jetzt
   formal seiner, er sieht ihn und darf Status/Notiz ändern.

Die Roadmap führt das unter „bekannte Einschränkung"; faktisch hebt es Migration 13
vollständig auf. **Fix**: `order_employees`-Schreibrecht auf Nicht-Techniker beschränken
(Muster wie bei `orders`), `order_articles`-SELECT für Techniker auf eigene Aufträge filtern.

### A4. `security definer`-Funktionen ohne fixierten `search_path`

`handle_new_user()`, `current_user_role()`, `current_employee_id()` und
`restrict_techniker_order_update()` laufen mit erhöhten Rechten, ohne den Suchpfad zu
fixieren. Das ist der Standard-Befund des Supabase-Security-Linters: wer eine gleichnamige
Funktion/Tabelle in einem früher durchsuchten Schema anlegen kann, lenkt den Aufruf um.

**Fix**: an jede dieser Funktionen `set search_path = ''` anhängen und alle Objekte voll
qualifizieren (`public.profiles` statt `profiles`).

### A5. Spalten-Trigger als Denylist statt Allowlist

`restrict_techniker_order_update()` zählt auf, was ein Techniker **nicht** ändern darf
(`customer_id`, `title`, `description`, `order_date`, `time`, `assigned_employee_id`). Jede
Spalte, die künftig zu `orders` dazukommt – Rechnungsnummer, Freigabe-Kennzeichen, Preis –
ist damit ab dem Tag ihres Anlegens für Techniker frei änderbar, ohne dass jemand daran
denkt.

**Fix**: umdrehen auf Positivliste, z. B. über `to_jsonb(new) - 'status' - 'techniker_notiz'
- 'updated_at'` im Vergleich zu `to_jsonb(old)` minus derselben Schlüssel.

### A6. Keine Security-Header, keine Subresource Integrity

`next.config.mjs` enthält nur `reactStrictMode`. Es fehlen `Content-Security-Policy`,
`X-Frame-Options`/`frame-ancestors` (Clickjacking), `Referrer-Policy`,
`Permissions-Policy`, `Strict-Transport-Security`. Gleichzeitig lädt `app/layout.tsx`
Leaflet-CSS und -JS von `cdnjs.cloudflare.com` **ohne `integrity`-Attribut** – ein
kompromittiertes CDN-Skript läuft mit vollen Rechten in der Sitzung jedes Nutzers und kann
den Supabase-Token abgreifen.

**Fix**: `headers()` in `next.config.mjs` ergänzen; Leaflet entweder als npm-Abhängigkeit
bündeln (sauberste Variante, beseitigt zugleich `(window as any).L`) oder mindestens
`integrity` + `crossorigin` setzen.

### A7. `lib/supabaseServer.ts` ohne Server-Schutzschild

Die Datei enthält `createAdminClient()` mit dem Service-Role-Key und wird nur durch
Konvention serverseitig gehalten. Ein versehentlicher Import aus einer Client-Komponente
fällt heute erst beim Build auf.

**Fix**: `import "server-only";` als erste Zeile, und `require("@supabase/supabase-js")`
durch einen normalen `import` ersetzen.

### A8. Der ADMIN_EMAIL-Mechanismus funktioniert nicht

`handle_new_user()` liest `current_setting('app.admin_email', true)`. Dieser Parameter ist in
einer Supabase-Instanz nie gesetzt, der Ausdruck liefert immer `null` – **jeder neue Account
bekommt „user"**, unabhängig von der `.env`-Variable. Die Beförderung passiert in Wahrheit
nur durch das einmalige `update` am Ende von Migration 05. `.env.example` und die
Kommentare beschreiben eine Automatik, die es nicht gibt.

**Fix**: entweder ganz entfernen und den Superadmin bewusst manuell setzen, oder die
Zuweisung in die Invite-Route verlagern (dort ist die Rolle ohnehin schon geprüft).

### A9. Kundendaten gehen ungefiltert an Nominatim

`geocodeAddress()` schickt die vollständige Kundenadresse aus dem Browser an
`nominatim.openstreetmap.org`. Zusätzlich zur bekannten AVV-Lücke bei Vercel/Supabase ist
das ein dritter Empfänger personenbezogener Daten, ohne Vertrag und ohne den von Nominatim
geforderten identifizierenden User-Agent (max. 1 Anfrage/Sekunde). Beim Import echter
Bestandskunden würde ein Massen-Geocoding die Nutzungsbedingungen verletzen.

**Fix**: Geocoding serverseitig kapseln (eigene Route, Warteschlange, Caching in der
Datenbank) und den Dienst in die AVV-Klärung mit aufnehmen.

---

## B – Hoch: Skalierbarkeit

### B1. Ab 1000 Datensätzen fehlen stillschweigend Zeilen

Sämtliche `fetchX()`-Funktionen laden ohne `.range()`/Pagination:

```ts
const { data } = await supabase.from("customers").select("*").order("name");
```

PostgREST liefert standardmäßig **maximal 1000 Zeilen** pro Anfrage. Bei den geplanten ~4500
Reifenwechsel-Kunden bekommt die App also 1000 Kunden – ohne Fehlermeldung, ohne Hinweis.
Suche, Karte, Dashboard-Zahlen und Umkreisfilter arbeiten dann auf einem Viertel des
Bestands und wirken korrekt. Dasselbe gilt für `orders`, `order_articles`, `tire_storage`.

Das ist der gefährlichste Befund nach A1, weil er nicht als Fehler auffällt, sondern als
falsche Zahl.

**Fix**: serverseitig filtern und paginieren statt alles zu laden – Suche als
`.ilike()`-Abfrage, Listen mit `.range()`, Karte über einen Bounding-Box-Filter,
Dashboard-Kennzahlen über `count`-Abfragen oder eine Datenbank-View.

### B2. Der Initial-Load lädt 13 Tabellen vollständig und nacheinander

`HomePage` holt beim Start `customers`, `warehouses`, `storage_slots`, `tire_storage`,
`orders`, `employees`, `order_employees`, `articles`, `article_prices`, `order_articles`,
`vehicles`, `module_permissions` – jeweils komplett, jeweils mit `await` hintereinander,
bevor überhaupt etwas angezeigt wird. Selbst ohne das 1000er-Limit wären das bei realem
Datenbestand mehrere MB und zweistellige Sekunden auf dem Handy im Feld.

Verschärfend: jede Schreiboperation ruft anschließend `refreshX()` und lädt die **komplette**
Tabelle neu. Ein Häkchen im Mitarbeiter-Popover zieht einen Vollabzug von `order_employees`
nach sich.

**Fix**: Datenladen pro Modul statt global, beim Öffnen des Tabs statt beim Start, und mit
einer Caching-Bibliothek (TanStack Query o. ä.), die gezielt einzelne Einträge invalidiert
statt ganze Tabellen. Das ist derselbe Schritt, der auch B4 und C1 entschärft.

### B3. Keine Indizes – auch nicht auf den Fremdschlüsseln

Postgres legt für Fremdschlüssel **keine** Indizes an. Im gesamten Schema existiert außer den
Primärschlüsseln und der neuen Unique-Constraint auf `articles.article_number` kein einziger
Index. Fehlend sind mindestens:

```sql
create index on public.orders (customer_id);
create index on public.orders (order_date);
create index on public.order_employees (employee_id);   -- wird von der RLS-Policy 13 pro Zeile ausgewertet
create index on public.order_articles (order_id);
create index on public.contact_history (customer_id);
create index on public.vehicles (customer_id);
create index on public.tire_storage (storage_slot_id);
create index on public.tire_storage (customer_id);
create index on public.storage_slots (warehouse_id);
create index on public.article_prices (article_id);
create index on public.employees (profile_id);          -- current_employee_id() bei jedem Zugriff
```

Besonders relevant: `current_employee_id()` und die `exists (...)`-Unterabfrage der
Techniker-Policy laufen **pro geprüfter Zeile**.

### B4. RLS-Funktionsaufrufe nicht gekapselt

`auth.role() = 'authenticated'` und `public.current_user_role() = ...` werden von Postgres
je Zeile neu ausgewertet. Der Standardtrick ist, sie in ein Sub-Select zu packen
(`(select auth.role())`), damit sie einmal pro Anfrage laufen. Bei einigen tausend Zeilen ist
das ein messbarer Faktor. Außerdem fehlt überall die Rollenangabe `to authenticated`, sodass
die Policies auch für anonyme Anfragen durchgerechnet werden.

### B5. Fehler werden fast überall verschluckt

In `lib/api/` gibt es 58 Supabase-Aufrufe und genau vier Stellen, die `error` überhaupt
auswerten (alle in `articles.ts`). Überall sonst:

```ts
await supabase.from("customers").update(patch).eq("id", id);
```

Schlägt der Schreibvorgang fehl – RLS-Verweigerung, Netzabbruch, Constraint-Verletzung –,
passiert **nichts sichtbares**: kein Hinweis, kein Log, und `refreshX()` überschreibt den
State anschließend mit dem alten Serverstand. Der Nutzer sieht seine Eingabe verschwinden und
hält es für einen Anzeigefehler. Für ein System, das später Rechnungen tragen soll, ist das
der teuerste Fehlertyp.

**Fix**: einheitliches Ergebnisobjekt (`{ data, error }`) aus jeder `lib/api`-Funktion
zurückgeben, in `HomePage` an einer Stelle in eine Fehleranzeige (Toast) kippen. Das ist
mechanische Arbeit, aber sie macht alle folgenden Module verlässlich.

---

## C – Mittel: Fundament für weitere ERP-Module

### C1. `HomePage` ist der globale Zustandsspeicher

Phase 2 und 3 haben Komponenten und Datenzugriff sauber herausgelöst – der State ist aber
komplett geblieben: ~25 `useState` in einer Komponente, alle Module hängen an denselben
Listen, alles wird per Props durchgereicht. Jedes neue Modul (Rechnungen, Angebote,
Fahrzeugakte, Zeiterfassung) fügt hier zwei bis vier weitere States plus deren `refreshX()`
hinzu, und jede Zustandsänderung rendert die gesamte Anwendung neu.

Das ist heute noch beherrschbar, aber es ist die Stelle, an der „ein Modul mehr" jedes Mal
teurer wird. Empfehlung vor dem nächsten Modul: Server-Cache-Bibliothek einführen
(TanStack Query) und den State pro Modul in einen eigenen Hook (`useAuftraege()`,
`useLager()`) legen. `HomePage` behält Layout und Routing. Das ist die logische Fortsetzung
von Phase 3 und löst zugleich B2.

### C2. Berechtigungen werden an drei Stellen parallel gepflegt

`PERMISSION_CATALOG` und `PERMISSION_DEFAULTS` (`lib/constants.ts`) sowie der Seed in
`10_modul_berechtigungen_matrix.sql`. Sie sind **bereits auseinandergelaufen**: Migration 10
gibt `view.kunden`, `view.neuer_kunde` und `view.inaktive_kunden` an Techniker, die Defaults
im Code tun das seit Phase 4 nicht mehr – und weil die Datenbankzeile den Code-Fallback
schlägt, gilt der alte Stand, solange niemand die Haken von Hand entfernt. `view.artikel`
fehlt in Migration 10 ganz.

Das widerspricht der eigenen Konstanten-Regel im Kern: derselbe Wertebereich an zwei Orten.
**Fix**: den Katalog als einzige Quelle behandeln und die Tabelle daraus ableiten (Migration,
die fehlende Schlüssel nachzieht und überzählige entfernt), nicht umgekehrt.

### C3. Keine Nachvollziehbarkeit – für ein ERP zu wenig

Keine Tabelle hat `created_by`/`updated_by`, es gibt kein Änderungsprotokoll, und außer
`tire_storage.removed_at` wird überall hart gelöscht. Für Phase 5 (Rechnungsstellung) ist das
ein Blocker: eine Rechnung muss zeigen können, wer eine Position wann geändert hat, und darf
nachträglich nicht spurlos veränderbar sein. Auch die DSGVO-Auskunftspflicht ist ohne
Protokoll schwer zu bedienen.

**Fix, bevor Rechnungen dazukommen**: `created_by uuid default auth.uid()` und `updated_by`
auf allen Geschäftstabellen, eine generische `audit_log`-Tabelle mit Trigger, und für
belegrelevante Daten Soft-Delete statt `delete`.

### C4. Datenintegrität nur teilweise abgesichert

- Kein Index/Constraint, der **einen** aktiven Reifensatz je Lagerplatz erzwingt. Zwei
  parallele Zuordnungen erzeugen zwei aktive Zeilen; die App zeigt willkürlich eine davon.
  Fix: `create unique index on public.tire_storage (storage_slot_id) where removed_at is null;`
- `storage_slots.code` ist nicht eindeutig je Lager – „A-01" kann doppelt existieren.
- `updated_at` wird nirgends automatisch gepflegt (nur `orders`, als Nebeneffekt des
  Techniker-Triggers). `customers.updated_at` bleibt für immer auf dem Anlagedatum.
- `article_prices` verhindert überlappende Zeiträume nur im Anwendungscode
  (`insertArticlePrice`), nicht in der Datenbank – ein zweiter Client kann Lücken oder
  Überschneidungen erzeugen. Ein `exclude`-Constraint über `daterange` würde das sauber lösen.
- `articles.article_number` ist vom Client frei setzbar; die Unique-Constraint fängt
  Kollisionen ab, aber die Sequenz läuft dann aus dem Tritt.

### C5. Migrationen sind nicht wiederholbar

`07_termine_auftraege_zusammenlegung.sql` und `12_artikelstammdaten.sql` enthalten reine
`insert ... select` bzw. `insert ... values` ohne Schutz. Ein versehentlicher zweiter Lauf
dupliziert alle Termine bzw. den kompletten Start-Artikelstamm. Bei manueller Ausführung im
SQL-Editor ist das ein realistisches Szenario.

**Fix (für künftige Migrationen)**: `on conflict do nothing` bzw. ein `where not exists`-Guard
als feste Regel in `supabase/migrations/README.md`.

### C6. TypeScript läuft ohne `strict`

`tsconfig.json` hat `"strict": false`. Damit prüft der Compiler weder `null`/`undefined` noch
implizite `any` – genau die Fehlerklasse, die bei optionalen Datenbankfeldern (`lat`, `time`,
`valid_to`, `profile_id`) auftritt. Die CI prüft also deutlich weniger, als sie zu prüfen
scheint. Für ein System, das über Jahre wachsen soll, ist das die falsche Grundeinstellung.

**Fix**: schrittweise – erst `strictNullChecks`, Modul für Modul, dann `strict: true`.

### C7. Qualitätssicherung dünner als dokumentiert

- Im verbundenen Ordner existiert **kein `.github/`-Verzeichnis**; die in `architektur.md`
  und `CLAUDE.md` beschriebene CI (`.github/workflows/typecheck.yml`) ist hier nicht
  vorhanden. Entweder liegt sie nur auf GitHub – dann ist der lokale Ordner unvollständig und
  eine Änderung daran geht verloren – oder es gibt sie gar nicht.
- `package.json` bietet `next lint`, es existiert aber keine ESLint-Konfiguration.
- Keine Tests. Für die Preis-/Rabattlogik (`orderArticleTotals`, `currentArticlePrice`,
  `insertArticlePrice`) wären ein paar reine Unit-Tests ohne Infrastruktur machbar und
  hochwirksam, weil dort später Geld dranhängt.

### C8. Leaflet nur lose angebunden

Die Karte hängt an `(window as any).L` und einer Warteschleife
(`setTimeout(tryInit, 60)`), das Popup wird imperativ per `innerHTML` gebaut und die Handler
über `document.getElementById` gesucht. Das funktioniert, ist aber der einzige Bereich ohne
Typsicherheit und mit globalen IDs – bei zwei gleichzeitigen Popups oder einer zweiten Karte
(z. B. Lagerstandorte) bricht es. Empfehlung: `leaflet` als npm-Paket mit `@types/leaflet`,
Popup-Inhalt über `createRoot()` als echte React-Komponente.

Positiv hervorzuheben: die Popup-Erzeugung nutzt durchgängig `escapeHtml()` für alle
Kundendaten. Ein gespeicherter XSS über Kundenname, Adresse oder Auftragstitel ist damit
geschlossen – das ist genau die Stelle, an der solche Lücken sonst entstehen.

---

## D – Konsistenz

| # | Befund |
|---|---|
| D1 | `ROLE_LABEL` ist in `app/admin/users/page.tsx` ein zweites Mal wörtlich definiert – direkter Verstoß gegen die Konstanten-Regel, obwohl das Register die Konstante als „bereits sauber zentral" führt. |
| D2 | `geocodeAddress()` prüft literal auf `"nürnberg"`/`"nuernberg"`, direkt neben der Verwendung von `DEFAULT_GEOCODE_REGION` – derselbe Wert zweimal. |
| D3 | `ASSIGNABLE_ROLES` in `app/api/invite/route.ts` ist eine vierte, unabhängige Rollenliste (neben `Role`, `ROLE_LABEL`, `PERMISSION_ROLES` und dem DB-Constraint). |
| D4 | `konstanten-register.md` verortet `ROLE_LABEL`, `PERMISSION_*` und `EMP_COLORS` in `app/page.tsx`; seit Phase 1 liegen sie in `lib/constants.ts`. |
| D5 | `berechtigungen-und-rollen.md` sagt, die Techniker-Rolle habe „noch keine eigenen Rechte"; Phase 4/Migration 13 haben sie gebaut. |
| D6 | `types.ts` kommentiert `article_number` als „nicht editierbar"; Roadmap, Doku und `updateArticleNumberById()` machen sie ausdrücklich editierbar. Auch Migration 14 behauptet „nicht händisch eingebbar". |
| D7 | Tote, aber erreichbare Altlasten: Tabelle `appointments` (+ Typ `Appointment`) mit voller Schreibpolicy, `orders.assigned_employee_id`, `user_settings.theme`, `module_permissions`-Zeile `'lager'`, die Routen `/admin/invite` und `/admin/users`. Letztere sind nicht verlinkt, aber weiterhin aufrufbar und nur durch RLS geschützt. |
| D8 | Migration 05 enthält eine private E-Mail-Adresse im Klartext und wird so mit versioniert. |
| D9 | Die Migrationskopfzeilen sagen durchgängig „Noch auszuführen", obwohl alle 14 laufen. Der Zustand steht jetzt korrekt in `supabase/migrations/README.md`; die Kommentare in den Dateien selbst widersprechen ihm. (Dateien nicht anfassen – Regel „ausgeführte Migrationen bleiben unverändert".) |

---

## Vorgeschlagene Reihenfolge

**Sofort, vor allem anderen** – eine Migration `15_rls_haertung.sql`:

1. `role`-Spalte gegen Selbstbeförderung sperren (A1).
2. `search_path` in allen `security definer`-Funktionen fixieren (A4).
3. `order_employees`/`order_articles` für Techniker schließen (A3).
4. Indizes anlegen (B3) und die Policies in Sub-Selects kapseln (B4).
5. Partial-Unique-Index auf `tire_storage` (C4).

Danach, in dieser Reihenfolge:

6. **Rollenmodell in die Datenbank** (A2) – `has_module_permission()` + Policies pro Tabelle.
   Der größte Einzelschritt, aber die Grundlage dafür, dass jedes künftige Modul seine Rechte
   erbt statt sie neu zu erfinden.
7. **Security-Header + Leaflet als npm-Paket** (A6, C8) – klein, sofort wirksam.
8. **Fehlerbehandlung vereinheitlichen** (B5) – mechanisch, macht alles Folgende verlässlich.
9. **Datenladen umbauen** (B1, B2, C1) – Pagination und serverseitiges Filtern, Daten pro
   Modul über TanStack Query. Muss vor dem Import echter Kundendaten fertig sein.
10. **Audit-Spalten und Soft-Delete** (C3) – muss vor Phase 5 (Rechnungen) stehen.
11. **`strict: true`** (C6), ESLint, erste Unit-Tests auf die Preislogik (C7).
12. Konsistenz-Aufräumen (D1–D8) – jederzeit nebenbei möglich.

Punkt 9 und der Import echter Kundendaten hängen zusammen: solange B1 offen ist, würde ein
Import von ~4500 Kunden die App still auf 1000 davon beschränken. Zusammen mit der noch
offenen AVV-Frage ist das der Grund, warum vor diesem Umbau keine Echtdaten in die Instanz
gehören.
