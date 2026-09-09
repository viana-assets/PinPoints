# Architektur

## Tech-Stack

- **Next.js 14** (App Router), TypeScript, Client Components für die Hauptlogik.
- **Supabase**: Postgres + Auth (Invite-only, kein öffentliches Signup) + RLS.
  `@supabase/ssr` für Browser-/Server-Clients.
- **Leaflet** als npm-Abhängigkeit (`leaflet` + `@types/leaflet`), CSS in `app/layout.tsx`,
  das Modul selbst per dynamischem `import("leaflet")` im Karten-Effekt von `app/page.tsx`
  (deshalb `leafletRef` statt `window.L`). Inkl. eigenem Google-Maps-artigem
  Kartenstil-Schalter (Leaflet `L.Control.extend`). Vorher kam Leaflet von cdnjs, ohne
  `integrity`-Attribut – siehe `architektur-review-2026-08.md`, Befund A6.
- **Vercel** Hosting, automatisches Deployment bei jedem Commit auf `main`.
- **Sicherheits-Header** in `next.config.mjs`: CSP, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS (siehe dort für die Begründung der einzelnen Direktiven).
- **CI**: `.github/workflows/typecheck.yml` (GitHub Actions) läuft bei jedem Push/PR auf
  `main` und führt `npx tsc --noEmit`, `npm run lint`, `npm test` und `npm run build` aus
  (mit Platzhalter-Umgebungsvariablen) – Ergebnis sieht Vitali direkt am Commit/an der PR,
  ohne eigenen Terminal-Zugriff. Dieselbe Verifikation läuft zusätzlich in der Claude-Session
  vor jeder Auslieferung.

  Der Workflow **bestimmt den Projektordner selbst**, statt ihn fest einzutragen: je nachdem,
  wie die Dateien über die GitHub-Weboberfläche hochgeladen werden, liegt die Anwendung im
  Wurzelverzeichnis oder in `viana-pinpoints/`. Ein fest verdrahteter Pfad war genau die
  Annahme, an der die CI am 29.08.2026 gescheitert ist – und zwar mit einer Meldung
  (`Some specified paths were not resolved`), die nicht verrät, welche der beiden Ursachen
  vorliegt. Fehlt `package-lock.json`, bricht der Workflow jetzt mit einer Meldung im Klartext
  ab, statt erst später bei `npm ci`.
- **Tests**: Vitest, `tests/*.test.ts` – bewusst nur die reinen Rechenfunktionen (Preise,
  Rabatte, Gültigkeitszeiträume, Kalenderwochen, Lagerplatz-Nummerierung), also die Logik, an
  der später Geld hängt. Keine Komponententests.
- **TypeScript im `strict`-Modus** seit der Sanierung (vorher `strict: false`, damit waren
  null/undefined und implizite `any` ungeprüft).
- **ESLint mit `no-use-before-define`** (`variables: true`, Funktionen und Klassen ausgenommen).
  Diese Regel fängt einen Fehler ab, den weder `tsc` noch `next build` sehen: eine `const`, die
  in einem Callback gelesen wird, bevor sie deklariert ist. TypeScript lässt das durch, weil der
  Zugriff in einer Funktion steckt und der Compiler nicht wissen kann, wann sie läuft – hier lief
  sie sofort (`Array.find`). Am 29.08.2026 hat genau das die ausgelieferte App mit einem
  `ReferenceError` lahmgelegt, obwohl Typprüfung, Tests und Build sauber durchgelaufen waren:
  beim Prerendern war die Liste leer, der Callback lief also nie – im Browser mit geladenen Daten
  dann schon. Funktionen und Klassen sind ausgenommen, die werden hochgezogen und im Projekt
  bewusst vor ihrer Deklaration benutzt.
- **TanStack Query** als Zwischenspeicher für alle Datenabfragen (`lib/queries/`,
  `app/providers.tsx`) – siehe „Datenladen" unten.

## Repo-Struktur

```
viana-pinpoints/
  app/
    layout.tsx              Root-Layout, lädt Google Fonts + Leaflet CSS/JS
    globals.css              Design-Tokens + alle Styles (ein einziges CSS-File)
    page.tsx                 Hauptanwendung – siehe "Der Monolith" unten
    login/page.tsx            Login-Seite (kein Signup-Formular)
    auth/
      callback/page.tsx       Zwischenseite für Invite-/Recovery-Links
      HashSessionHandler.tsx    Globaler Client-Handler für Hash-Token-Login
      set-password/…            Passwort setzen nach Invite
    admin/invite/…             Admin/Superadmin: Nutzer per E-Mail einladen (inkl. Rollenwahl)
    admin/users/…               Nur Superadmin: Nutzerverwaltung (alle Accounts, Rolle ändern)
    api/invite/route.ts         Server-Route für den Invite-Versand (Service-Role-Key)
    api/geocode/route.ts        Server-Route für die Geokodierung (Drosselung, User-Agent, Cache)
    providers.tsx               QueryClientProvider (Zwischenspeicher der Datenabfragen)
  components/
    icons.tsx                  Alle Icon-Komponenten (IconDashboard, IconKunden, …)
    NavItem.tsx                  Ein Eintrag in #iconNav
    EmployeeCheckboxList.tsx      Mitarbeiter-Mehrfachauswahl als Chips
    CustomerPicker.tsx            Wiederverwendbare Kundensuche (Lager & Aufträge)
    kunden/
      CustomerRowMeta.tsx           Meta-Zeile in der Kundenliste
      AddCustomerForm.tsx           Formular "Neuer Kunde"
      DetailModal.tsx                Das große Kunden-Detailfenster
      CustomerOrderRow.tsx           Ein Auftrag im Detailfenster
      AddOrderInline.tsx             Auftrag/Termin im Detailfenster hinzufügen
      VehicleSection.tsx             Fahrzeuge je Kunde (VehicleRow, AddVehicleInline)
    admin/
      SettingsPanel.tsx              Tab "Einstellungen"
      AdminPanel.tsx                 Tab "Admin" (Nutzerverwaltung)
      PermissionMatrix.tsx           Modulverwaltung (Rollen × Module)
      artikel/
        ArticleAdminPanel.tsx          Tab "Artikel" (eigene Kachel, nicht mehr Teil von Admin –
                                       Ordnerpfad historisch belassen, siehe roadmap.md)
        ArticleDetailEditor.tsx        Artikel bearbeiten + Preis-Historie
    auftraege/
      AuftraegePanel.tsx             Tab "Aufträge & Termine" (Übersicht, Klick öffnet das Fenster)
      AuftragModal.tsx               Das Auftragsfenster: alles zu einem Auftrag, und hier wird
                                     gehandelt (siehe docs/auftragsablauf.md)
      OrderModal.tsx                 Neuen Auftrag anlegen (aus dem Aufträge-Tab)
      ArticleAssignPanel.tsx         Leistungen/Artikel einem Auftrag zuordnen
    einsatzplanung/
      EinsatzplanungPanel.tsx        Tab "Einsatzplanung" (Kalender + Listenansicht)
    lager/
      LagerPanel.tsx                 Tab "Lager" (Lager, Lagerplätze, TireAssignModal)
  lib/
    types.ts                  Zentrale TypeScript-Typen (Customer, Order, Employee, Article, …)
    constants.ts                 Modulübergreifende Konstanten (Rollen, Berechtigungen,
                                  Auftragsstatus, Kalenderfarben) – siehe konstanten-register.md
    calendar.ts                   Reine Kalender-Hilfsfunktionen (Wochenstart, ISO-KW, Mitarbeiterfarbe)
    helpers.ts                  Datum/Distanz/Telefon/Preis-Hilfsfunktionen
    mapStyles.ts                  Verfügbare Kartenstile
    supabaseClient.ts              Browser-Supabase-Client
    supabaseServer.ts               Server-Supabase-Client (für api/invite)
    queries/
      keys.ts                      Zentrale Query-Schlüssel (`qk.kunden()`, `qk.auftraege(fenster)` …)
      hooks.ts                     Ein Hook je Datenbestand, mit "wird gerade gebraucht?"-Schalter
    api/
      client.ts                    Fundament der Schicht: ApiError, q()/qOne()/qWrite(),
                                   fetchPaged() (seitenweises Laden gegen die 1000-Zeilen-Kappung)
      customers.ts                 Kunden + Kontakt-Historie (CRUD + Geocoding-Anstoß)
      orders.ts                    Aufträge/Termine + Mitarbeiter-Zuordnung (order_employees)
      employees.ts                 Mitarbeiter (Einsatzplanung)
      vehicles.ts                  Fahrzeuge je Kunde
      articles.ts                  Artikelstamm, Preis-Historie, Auftrags-Artikelzeilen
      lager.ts                     Warehouses, Lagerplätze, Reifen-Einlagerung
      permissions.ts                Modul-Berechtigungen (module_permissions)
      session.ts                    Rolle + Anzeige-Einstellungen beim Initial-Load
  supabase/
    migrations/                 Durchnummerierte SQL-Migrationsdateien, siehe README.md dort
  docs/                          Diese Dokumentation, siehe docs/README.md
  middleware.ts                  Auth-Gate für geschützte Routen
```

## `app/page.tsx` nach Phase 2 + 3

`app/page.tsx` war die Hauptanwendung als eine große Datei (Höchststand ~3.660 Zeilen) und
ist durch Phase 2 (Komponenten auslagern) und Phase 3 (Datenzugriffsschicht) auf ~1.290
Zeilen geschrumpft. Die zentrale `HomePage`-Komponente hält weiterhin den gesamten
App-State (Kunden, Aufträge, Mitarbeiter, Artikel, Berechtigungen, Kartensteuerung,
Popover-Menüs …) sowie das Layout/Routing zwischen den Tabs – das ist beabsichtigt und
bleibt so (siehe `roadmap.md`, Zielstruktur).

Alle Panel-/Modal-Komponenten (`AuftraegePanel`, `EinsatzplanungPanel`, `DetailModal`,
`AdminPanel`, `LagerPanel`, `ArticleAssignPanel`, `ArticleAdminPanel`, `PermissionMatrix`,
`CustomerOrderRow`, `AddOrderInline`, `OrderModal`, `AddCustomerForm`, `SettingsPanel`,
`CustomerRowMeta`, `VehicleRow`/`AddVehicleInline`, `CustomerPicker`) sind in eigenen
Dateien unter `components/` (siehe Repo-Struktur oben) und werden von `HomePage` per Props
angesteuert. Alle direkten `supabase.from(...)`-Tabellenzugriffe (Kunden, Aufträge,
Mitarbeiter, Fahrzeuge, Artikelstamm, Lager, Modul-Berechtigungen, Sitzungs-Bootstrap) sind
in `lib/api/*.ts` gezogen – `HomePage` behält nur noch ihre `refreshX()`/`addX()`/`updateX()`/
`deleteX()`-Funktionen, die die passende `lib/api`-Funktion aufrufen und danach den
React-State aktualisieren. Beides ist reines Verschieben, keine Verhaltensänderung,
`npx tsc --noEmit`/`npm run build` nach jedem Schritt verifiziert.

Was noch in `app/page.tsx` steckt (bewusst): der App-State selbst, die dünnen `refreshX()`/
CRUD-Wrapper, die Popover-Logik (`xMenuFor`/`clampMenuTop()` …), die Karten-Initialisierung
und -Interaktion (Leaflet, Marker, Popups) sowie Tab-/Routing-Logik. `supabase.auth.getUser()`/
`signOut()` bleiben ebenfalls hier – das ist Sitzungssteuerung, kein Tabellenzugriff, und
gehört nicht in `lib/api`.

### Wiederkehrende Namenskonventionen in `app/page.tsx`

Diese Muster ziehen sich durch alle Module – bei neuen Modulen bitte beibehalten, damit der
Code trotz der Größe der Datei vorhersehbar bleibt:

- **State pro Tabelle**: `const [x, setX] = useState<T[]>([])`, plus `async function
  refreshX()` das die Tabelle neu von Supabase lädt und den State ersetzt. CRUD-Funktionen
  heißen `addX`/`updateX`/`deleteX`, rufen nach dem Supabase-Call immer `refreshX()` erneut
  auf (keine optimistischen Updates, bewusst einfach gehalten).
- **Verknüpfungstabellen** (viele-zu-viele, z. B. `order_employees`, `order_articles`)
  bekommen zusätzlich einen Helfer `xFor(id)`, der aus dem flachen State die Zeilen zu einem
  Datensatz herausfiltert (z. B. `orderArticlesFor(orderId)`).
- **Popover-Menüs** (Anrufen, Navigation, Mitarbeiter-Zuordnung, Artikel-Zuordnung) folgen
  alle demselben Muster: State `xMenuFor`/`xMenuPos`, eine `openXMenu(e, id)`-Funktion, die
  über `clampMenuTop()` verhindert, dass das Menü unten aus dem Fenster läuft (siehe
  `design-system.md`), und ein `.call-menu`-Div ganz am Ende von `HomePage`.
- **`liveRef`**: ein `useRef`, das immer den aktuellen Stand von `customers`/`orders`/
  `settings` hält – nötig, weil Leaflet-Popup-Callbacks außerhalb des React-Renderzyklus
  laufen und sonst mit veralteten Closures arbeiten würden.

### Datenfluss

Supabase (Postgres + RLS) → `refreshX()`-Funktionen in `HomePage` → React-State →
Props nach unten an Panel-/Modal-Komponenten → Nutzeraktion ruft `onX`-Callback nach oben
→ CRUD-Funktion in `HomePage` schreibt nach Supabase → `refreshX()` erneut. Es gibt keine
separate Zustandsverwaltung (kein Redux/Zustand/Context) – alles läuft über Props und den
State von `HomePage` selbst. Das ist für die aktuelle Größe in Ordnung, wird aber bei
weiterem Wachstum unübersichtlich (siehe `roadmap.md`, Phase 2/3).

## Fehlerbehandlung (seit Roadmap-Phase 9)

Jede Funktion in `lib/api/*.ts` wirft bei einem Supabase-Fehler eine `ApiError`
(`lib/api/client.ts`) statt den Fehler zu verschlucken. `app/page.tsx` fängt das an genau einer
Stelle ab – ein `unhandledrejection`-Listener setzt den `fehler`-State, der als
`.fehler-hinweis` unten rechts eingeblendet wird.

Der Nebeneffekt ist der eigentliche Gewinn: bricht ein Klick-Handler mit einer Ausnahme ab,
läuft das `refreshX()` dahinter **nicht** mehr. Die Eingabe des Nutzers bleibt also im
Formular stehen, statt vom alten Serverstand überschrieben zu werden. Vorher sah ein
abgelehnter Schreibvorgang für den Nutzer so aus, als hätte die Anwendung seine Eingabe
einfach vergessen.

Fachlich **erwartete** Fehler bleiben Rückgabewerte, keine Ausnahmen – bisher genau ein Fall:
eine bereits vergebene Artikelnummer (`updateArticleNumberById`).

**Ausnahme, die eine eigene Behandlung braucht**: TanStack Query fängt Fehler seiner Abfragen
intern ab und legt sie an der Abfrage ab (`query.error`) – sie werden also *keine* unbehandelte
Promise-Ablehnung und liefen deshalb an der zentralen Anzeige vorbei. `HomePage` sammelt die
`error`-Felder aller Abfragen zusammen und schiebt sie in dieselbe Meldung; ohne das bliebe ein
Panel bei einem Ladefehler einfach leer, ohne jeden Hinweis.

## Datenladen (Roadmap Phase 10)

Ausgangslage war: beim Start zwölf Tabellen vollständig und nacheinander laden, bevor überhaupt
etwas zu sehen war, und nach jeder Änderung die betroffene Tabelle komplett neu. Ein Häkchen im
Mitarbeiter-Popover zog einen Vollabzug nach sich.

**Der Leitgedanke der jetzigen Lösung**: Datenbestände mit fester Größe darf man einmal
vollständig laden, unbegrenzt wachsende nicht. Kunden sind eine feste Menge (~4500, rund
1,4 MB) – einmal laden und im Browser filtern lässt die Suche ohne Verzögerung reagieren und
erspart der Karte eine Abfrage bei jedem Verschieben. Aufträge wachsen dagegen mit jedem
Betriebsjahr weiter und kommen deshalb über ein Zeitfenster.

- **`fetchPaged()`** (`lib/api/client.ts`) blättert jede Tabellenabfrage in Seiten zu
  `PAGE_SIZE` durch. Nötig, weil PostgREST je Anfrage höchstens 1000 Zeilen liefert – ohne
  `range()` hätte die App bei ~4500 Kunden stillschweigend ein Viertel geladen und trotzdem
  plausible Zahlen gezeigt.
- **Ein Hook je Bestand** (`lib/queries/hooks.ts`), jeder mit einem `aktiv`-Schalter: Lager,
  Artikel und Mitarbeiter laden erst beim Öffnen des jeweiligen Moduls, Fahrzeuge und die
  vollständige Auftragshistorie nur für den geöffneten Kunden. Immer geladen sind nur Kunden
  und das Auftrags-Zeitfenster – beide stecken in Karte, Dashboard und fast jeder Liste.
- **Zeitfenster für Aufträge** (`AuftragsFenster` in `lib/api/orders.ts`): standardmäßig
  erledigte der letzten 30 Tage plus **alle** offenen, umschaltbar auf „Dieses Jahr"/„Alle".
- **Zuordnungen verschachtelt**: `order_employees` und `order_articles` kommen in derselben
  Abfrage mit den Aufträgen. `aufteilen()` zerlegt die Antwort wieder in die drei flachen
  Strukturen, die die Oberfläche erwartet – an den Panels ändert sich dadurch nichts.
- **Gezieltes Nachladen**: die `refreshX()`-Funktionen in `HomePage` heißen weiter so, holen
  aber nichts mehr selbst, sondern erklären über `qk.*` den betroffenen Schlüssel für ungültig.
  Deshalb konnten alle CRUD-Funktionen unverändert bleiben.
- **Kennzahlen**: die belegten Lagerplätze kommen als zwei `count`-Abfragen
  (`fetchLagerKennzahlen`), statt dafür das komplette Lager zu laden. Die übrigen
  Dashboard-Zahlen rechnen weiterhin im Browser – ihre Datengrundlage ist ohnehin geladen und
  bleibt dadurch exakt.
- **Zeichnen statt laden begrenzen**: die Karte zeichnet nur Marker im sichtbaren Ausschnitt
  (Obergrenze `MAX_MARKER`, mit Hinweis), die Kundenliste 200 Zeilen auf einmal
  (`LISTEN_SCHRITT`, nachladbar). Gefiltert und gezählt wird immer über den ganzen Bestand.

**Reihenfolge beim Start**: die Abfragen laufen erst los, wenn die Anmeldung geprüft und die
eigene Rolle geladen ist (`sitzungBereit` in `HomePage`, als `aktiv`-Schalter in jedem Hook).
Vor Phase 10 ergab sich das von selbst, weil alles Laden nacheinander in einem einzigen Effekt
lief. Seit die Abfragen eigenständig sind, müssen sie ausdrücklich warten – sonst überholen sie
den Sitzungsstart, gehen mit einem abgelaufenen Zugriffstoken hinaus und Supabase antwortet mit
`401`, während im Hintergrund gerade ein frisches Token geholt wird.

**Ein neues Modul anschließen** heißt hier: `lib/api/<modul>.ts` für die Abfragen, ein Schlüssel
in `lib/queries/keys.ts`, ein Hook in `lib/queries/hooks.ts` mit passendem `aktiv`-Schalter, und
in den CRUD-Funktionen das `neuLaden(qk.<modul>())` nach der Änderung.
