# Architektur

## Tech-Stack

- **Next.js 16** (`^16.3.4`, App Router), **React 19.3**, TypeScript, Client Components für
  die Hauptlogik.
- **Supabase**: Postgres + Auth (Invite-only, kein öffentliches Signup) + RLS.
  `@supabase/ssr` für Browser-/Server-Clients.
- **Leaflet** als npm-Abhängigkeit (`leaflet` + `@types/leaflet`), CSS in `app/layout.tsx`,
  das Modul selbst per dynamischem `import("leaflet")` im Karten-Effekt von `app/page.tsx`
  (deshalb `leafletRef` statt `window.L`). Inkl. eigenem Google-Maps-artigem
  Kartenstil-Schalter (Leaflet `L.Control.extend`). Vorher kam Leaflet von cdnjs, ohne
  `integrity`-Attribut – seit der Umstellung auf die npm-Abhängigkeit behoben.
- **PWA / Offline / Push** (neu seit `pwa-plan.md`, siehe eigener Abschnitt unten): App
  installierbar (`app/manifest.ts`), Service Worker (`public/sw.js`) cacht die Programm-Hülle,
  TanStack Query persistiert zusätzlich alle Datenabfragen in der IndexedDB (`app/providers.tsx`,
  `idb-keyval`), Web-Push über `web-push` + VAPID + `pg_cron`/`pg_net`. QR-Codes am Lagerplatz
  und am Reifensatz werden mit `qrcode` erzeugt und mit `jsqr` zurückgelesen
  (`components/QrScanner.tsx`, `lib/aufkleberCode.ts`).
- **Vercel** Hosting, automatisches Deployment bei jedem Commit auf `main`.
- **Sicherheits-Header** in `next.config.mjs`: CSP, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS (siehe dort für die Begründung der einzelnen Direktiven).
- **CI**: `.github/workflows/typecheck.yml` (GitHub Actions) läuft bei jedem Push/PR auf
  `main` und führt `npx tsc --noEmit`, `npm run lint`, `npm test` und `npm run build` aus
  (mit Platzhalter-Umgebungsvariablen) – Ergebnis sieht Vitali direkt am Commit/an der PR,
  ohne eigenen Terminal-Zugriff. Dieselbe Verifikation läuft zusätzlich in der Claude-Session
  vor jeder Auslieferung.

  Die Datei liegt aktuell mit fest eingetragenem `working-directory: viana-pinpoints` vor (ihr
  eigener Kopfkommentar vermerkt, dass sie neu angelegt wurde, weil sie im hochgeladenen Ordner
  fehlte). Die zuvor dokumentierte selbstständige Ordnererkennung („liegt die Anwendung im
  Wurzelverzeichnis oder in `viana-pinpoints/`?") steckt in dieser Fassung nicht mehr – ein
  Push, bei dem der Anwendungsordner nicht exakt `viana-pinpoints` heißt, bricht wieder mit
  `Some specified paths were not resolved` ab.
- **Tests**: Vitest **5**, `tests/*.test.ts` (22 Dateien) – weiterhin bewusst nur reine
  Rechen-/Prüffunktionen ohne UI (`environment: "node"`, kein jsdom), aber deutlich mehr Themen
  als ursprünglich: Preise/Rabatte/Endpreis, Rechnungsbeträge und -belege (`rechnung.test.ts`,
  `rechnungsbeleg.test.ts`, `rechnungsdaten.test.ts`), Rechte-Prüfung (`rechte.test.ts`),
  Protokoll-Aufbereitung (`protokoll.test.ts`), Gültigkeitszeiträume, Kalenderwochen und
  Stundenraster, Lagerplatz-Nummerierung und Regalwand-Layout, Lagerdauer, Profiltiefe,
  Saisonliste, Aufkleber-Codes (`aufkleberCode.test.ts`), Adress-/Hausnummer-Abgleich,
  Kundenzustand, Navigation, Sortieren/Suchen, Terminerinnerung und Vorgeschichte. Weiterhin
  keine Komponententests.
- **TypeScript im `strict`-Modus** seit der Sanierung (vorher `strict: false`, damit waren
  null/undefined und implizite `any` ungeprüft).
- **ESLint 9** mit `no-use-before-define` (`variables: true`, Funktionen und Klassen
  ausgenommen). Diese Regel fängt einen Fehler ab, den weder `tsc` noch `next build` sehen:
  eine `const`, die in einem Callback gelesen wird, bevor sie deklariert ist. TypeScript lässt
  das durch, weil der Zugriff in einer Funktion steckt und der Compiler nicht wissen kann, wann
  sie läuft – hier lief sie sofort (`Array.find`). Am 29.08.2026 hat genau das die ausgelieferte
  App mit einem `ReferenceError` lahmgelegt, obwohl Typprüfung, Tests und Build sauber
  durchgelaufen waren: beim Prerendern war die Liste leer, der Callback lief also nie – im
  Browser mit geladenen Daten dann schon. Funktionen und Klassen sind ausgenommen, die werden
  hochgezogen und im Projekt bewusst vor ihrer Deklaration benutzt.
- **TanStack Query** als Zwischenspeicher für alle Datenabfragen (`lib/queries/`,
  `app/providers.tsx`), seit dem 09.09.2026 zusätzlich dauerhaft in der IndexedDB des Geräts
  persistiert – siehe „Datenladen" und „PWA, Service Worker und Push" unten.

## Repo-Struktur

```
viana-pinpoints/
  app/
    layout.tsx              Root-Layout, lädt Google Fonts + Leaflet CSS/JS
    globals.css              Design-Tokens + alle Styles (ein einziges CSS-File)
    page.tsx                 Hauptanwendung, ~3.150 Zeilen – siehe "app/page.tsx heute" unten
    manifest.ts               Erzeugt das PWA-Manifest aus lib/erscheinung.ts (kein statisches
                              manifest.webmanifest mehr, damit der App-Name nicht an zwei
                              Stellen gepflegt werden muss)
    login/page.tsx            Login-Seite (kein Signup-Formular)
    auth/
      callback/page.tsx       Zwischenseite für Invite-/Recovery-Links
      HashSessionHandler.tsx    Globaler Client-Handler für Hash-Token-Login
      set-password/…            Passwort setzen nach Invite
    admin/invite/…             Admin/Superadmin: Nutzer per E-Mail einladen (inkl. Rollenwahl)
    admin/users/…               Nur Superadmin: Nutzerverwaltung (alle Accounts, Rolle ändern)
    api/invite/route.ts         Server-Route für den Invite-Versand (Service-Role-Key)
    api/geocode/route.ts        Server-Route für die punktgenaue Geokodierung (Drosselung,
                                User-Agent, geocode_cache)
    api/adresse-suchen/route.ts  Server-Route für Adressvorschläge/Tippfehlertoleranz
                                (eigener Dienst, siehe Migration 25 – Nominatim selbst verbietet
                                Autovervollständigung)
    api/push/                   anmelden/abmelden/schluessel/senden/status/test – Web-Push
                                (siehe „PWA, Service Worker und Push" unten)
    providers.tsx               QueryClientProvider + IndexedDB-Persistenz der Abfragen
  components/
    icons.tsx                  Alle Icon-Komponenten (IconDashboard, IconKunden, …)
    NavItem.tsx                  Ein Eintrag in #iconNav
    EmployeeCheckboxList.tsx      Mitarbeiter-Mehrfachauswahl als Chips
    CustomerPicker.tsx            Wiederverwendbare Kundensuche (Lager & Aufträge)
    AdressFeld.tsx                 Adressfeld mit Vorschlägen + Genauigkeits-Kennzeichnung
                                   (`geo_genauigkeit`, Migration 35)
    OfflineHinweis.tsx              Randbalken „Offline – angezeigt wird der Stand von …"
    QrScanner.tsx                   Kamera-Scan für Lagerplatz-/Reifensatz-Aufkleber
    PwaBereit.tsx / PwaFassung.tsx / PwaInstallieren.tsx
                                    Installations-/Update-Mechanik der PWA
    PushEinstellung.tsx             An-/Abmelden für Push-Benachrichtigungen (Einstellungen)
    kunden/
      CustomerRowMeta.tsx           Meta-Zeile in der Kundenliste
      AddCustomerForm.tsx           Formular "Neuer Kunde"
      DetailModal.tsx                Das große Kunden-Detailfenster
      CustomerOrderRow.tsx           Ein Auftrag im Detailfenster
      KontaktModal.tsx                Kontakt erfassen/Wiedervorlage setzen
      VehicleSection.tsx             Fahrzeuge je Kunde (VehicleRow, AddVehicleInline)
    admin/
      SettingsPanel.tsx              Tab "Einstellungen"
      AdminPanel.tsx                 Tab "Admin" – fünf Unter-Reiter: Nutzerverwaltung,
                                     Modulverwaltung, Wartung, Protokoll, Betrieb
      PermissionMatrix.tsx           Modulverwaltung (Rollen × Bereich × lesen/schreiben/löschen)
      BetriebsdatenPanel.tsx          Briefkopf/Rechnungseinstellungen (Migration 38/48)
      ProtokollPanel.tsx              Änderungsprotokoll lesen (Migration 18/36)
      FirmenfahrzeugPanel.tsx         Eigene Transporter (Migration 32)
      AdressenPruefen.tsx             Korrekturliste für ungenau geokodierte Kundenadressen
      GeokodierLauf.tsx               Sammellauf über den ganzen Kundenbestand
      artikel/
        ArticleAdminPanel.tsx          Tab "Artikel" (eigene Kachel, nicht mehr Teil von Admin –
                                       Ordnerpfad bewusst historisch belassen, um keine
                                       verwaiste Kopie im OneDrive-Ordner zu hinterlassen)
        ArticleDetailEditor.tsx        Artikel bearbeiten + Preis-Historie + Abrechnungsart/
                                       Einheit/Freitext-Haken
    auftraege/
      AuftraegePanel.tsx             Tab "Aufträge & Termine" (Übersicht, Klick öffnet das Fenster)
      AuftragModal.tsx               Das Auftragsfenster: alles zu einem Auftrag, und hier wird
                                     gehandelt, ~1.030 Zeilen (siehe docs/auftraege.md)
      OrderModal.tsx                 Neuen Auftrag anlegen (aus dem Aufträge-Tab)
      ArticleAssignPanel.tsx         Leistungen/Artikel einem Auftrag zuordnen (Endpreis statt
                                     Prozentrabatt, Migration 38)
      EinlagerungBlock.tsx            Reifen ein-/auslagern direkt am Auftrag
      FahrzeugeBlock.tsx              Fahrzeuge am Auftrag inkl. Kilometerstand, immer sichtbar
                                      (Migration 44/51)
      RechnungsdatenBlock.tsx         Rechnungs-Checkliste am Auftrag, prüft die Fahrzeuge nur
                                      noch (Migration 44/51)
      AuftragProtokoll.tsx            Änderungshistorie dieses einen Auftrags
    einsatzplanung/
      EinsatzplanungPanel.tsx        Tab "Einsatzplanung" (Kalender + Listenansicht)
      Stundenraster.tsx               Termine als Von-bis-Balken im Tages-/Wochenraster
                                      (Migration 37)
    lager/
      LagerPanel.tsx                 Tab "Lager" (Lager, Lagerplätze, Einlagerung), ~890 Zeilen
      SaisonPanel.tsx                  Eigener Reiter „Saisonliste" (Migration 30/31)
      AuslagernDialog.tsx              Auslagern inkl. Lagergebühr-Vorschlag (Migration 46)
      RadBild.tsx / ProfilMarke.tsx     Vier Radpositionen einzeln messen (Migration 33/34)
      ReifensatzEtikett.tsx / LagerplatzAufkleber.tsx
                                        QR-Aufkleber für Satz bzw. Regalplatz
    auswertung/
      AuswertungPanel.tsx             Tab "Auswertungen": Umsatz, Steuer, Nachlass,
                                      Saisonalität, Mitarbeiter, Artikel
    rechnungen/
      RechnungenPanel.tsx             Tab "Rechnungen": Liste, Suche, Storno
      RechnungModal.tsx               Eine Rechnung ausstellen/stornieren
      RechnungDokument.tsx            Druckansicht des Belegs (Briefkopf, Positionen, Summen)
  lib/
    types.ts                  Zentrale TypeScript-Typen (Customer, Order, Rechnung, Betrieb,
                              AuftragFahrzeug, Firmenfahrzeug, AuditEintrag, EingelagertesRad, …)
    constants.ts                 Modulübergreifende Konstanten – u. a. `RECHTE_KATALOG`/
                                 `RECHTE_VORGABE`/`VERBEN` (lesen/schreiben/löschen je Bereich,
                                 Migration 42), `SAISON_LABEL`, `RAD_POSITIONEN`,
                                 `GEO_GENAUIGKEIT_LABEL`, `PROTOKOLL_*_LABEL`,
                                 `TERMIN_INTERVALLE` – siehe konstanten-register.md
    module.ts                    Die Modul-/Navigationsliste (`MODULE`), einmal für
                                 Seitenleiste UND die Handy-Kachelseite „Weitere"
    calendar.ts                   Reine Kalender-Hilfsfunktionen (Wochenstart, ISO-KW, Mitarbeiterfarbe)
    helpers.ts                  Datum/Distanz/Telefon/Preis-Hilfsfunktionen, ~970 Zeilen
    rechnung.ts                   Rechnungsbeträge/-belege als reine Funktionen (kein
                                  Datenbank-/React-Bezug, deshalb mit Vitest prüfbar)
    auswertung.ts                  Rechenkern der Auswertungen (reine Funktionen)
    aufkleberCode.ts                Codieren/Decodieren der QR-Aufkleber (Regal- vs. Satz-Code)
    module.ts / erscheinung.ts       App-Name/-Icon nach außen vs. innen (Sichtschutz, 18.09.2026)
    push.ts                        Client-seitige Push-Anmeldung (Versand liegt in app/api/push/*)
    pwaAktualisierung.ts / pwaInstallation.ts
                                   Update-Erkennung bzw. `beforeinstallprompt`-Handling
    benachrichtigungZiel.ts          Übergabe Service Worker → App: wohin eine angetippte
                                    Benachrichtigung führt
    mapStyles.ts                  Verfügbare Kartenstile
    supabaseClient.ts              Browser-Supabase-Client
    supabaseServer.ts               Server-Supabase-Client (für api/invite, api/push/senden)
    queries/
      keys.ts                      Zentrale Query-Schlüssel (`qk.kunden()`, `qk.rechnungen()`, …)
      hooks.ts                     Ein Hook je Datenbestand, mit "wird gerade gebraucht?"-Schalter
                                   (19 Hooks, siehe „Datenladen" unten)
    api/
      client.ts                    Fundament der Schicht: ApiError, q()/qOne()/qWrite(),
                                   fetchPaged() (seitenweises Laden gegen die 1000-Zeilen-Kappung)
      customers.ts                 Kunden + Kontakt-Historie (CRUD + Geocoding-Anstoß)
      orders.ts                    Aufträge/Termine + Mitarbeiter-Zuordnung (order_employees)
      auftragFahrzeuge.ts            Fahrzeuge am Auftrag inkl. Kilometerstand (Migration 44)
      employees.ts                 Mitarbeiter (Einsatzplanung)
      vehicles.ts                  Kundenfahrzeuge
      firmenfahrzeuge.ts             Eigene Transporter (getrennt von vehicles.ts, Migration 32)
      articles.ts                  Artikelstamm, Preis-Historie, Auftrags-Artikelzeilen
      lager.ts                     Warehouses, Lagerplätze, Reifen-Einlagerung
      permissions.ts                Modul-Berechtigungen (module_permissions, `darf()`)
      audit.ts                      Lesezugriff auf das Änderungsprotokoll (audit_log)
      protokoll.ts                   Namensauflösung/Aufbereitung fürs Protokoll
      betrieb.ts                     Betriebseinstellungen/Briefkopf (eine einzige Zeile)
      rechnungen.ts                   Rechnungen ausstellen/stornieren (nur diese zwei Schreiber)
      adressen.ts                    Wrapper um api/adresse-suchen
      auswertung.ts                   Datenbeschaffung für das Auswertungs-Modul
      session.ts                    Rolle + Anzeige-Einstellungen beim Initial-Load
  supabase/migrations/
    <nr>_<name>.sql, <nr>_rollback.sql   Durchnummerierte SQL-Migrationen 36–51, jeweils mit
                                        Rücknahme-Skript daneben. Migrationen 34 und 35 liegen
                                        (Stand 18.09.2026) noch lose im Projektwurzel
                                        (`mig34.sql`, `mig35.sql`); ein `supabase/migrations/`-
                                        Ordner mit README, wie in CLAUDE.md beschrieben, existiert
                                        in diesem Arbeitsstand nicht – siehe „Migrationsstand"
                                        unten.
  docs/                          Diese Dokumentation, siehe docs/README.md
  proxy.ts                       Auth-Gate für geschützte Routen (bis Next.js 16: middleware.ts)
```

## Datenmodell

Kein vollständiges ER-Diagramm – die Fachlogik je Tabelle steht in den spezialisierten Docs
(`auftraege.md`, `lager.md`, `artikelstammdaten.md`, `berechtigungen-und-rollen.md`,
`benachrichtigungen-plan.md`). Hier nur der Überblick, welche Tabellen es gibt und was seit
Migration 29 dazugekommen ist.

- **Kunden**: `customers` (+ seit Migration 35 `geo_genauigkeit`: `exakt`/`ungefaehr`/`hand` –
  wie sicher die Kartenposition ist; + seit Migration 48 `kundennummer`, fortlaufend vom
  Server vergeben, `betrieb.kunde_naechste_nummer`), `contact_history`, `vehicles`
  (Kundenfahrzeuge; `tire_dot_date`/`tire_profile_mm` seit Migration 34 **entfernt** – die
  Angabe gehört an den Reifensatz, nicht ans Auto, `tire_size` bleibt).
- **Aufträge**: `orders` (+ seit Migration 37 `end_time`, damit ein Termin „von–bis" statt nur
  eine Startzeit hat; + seit Migration 38/40/48/49 `rechnung_noetig`,
  `rechnung_erstellt_am`/`_von`/`_nummer` – von einer Rechnung in dieser Anwendung
  gegengeschrieben und nicht mehr von Hand rücksetzbar, sobald ein Beleg existiert;
  `assigned_employee_id` seit Migration 39 entfernt, abgelöst von `order_employees`),
  `order_employees`, `order_articles` (+ seit Migration 38 `endpreis_netto` statt
  `discount_percent`, das seit Migration 39 entfernt ist), `auftrag_fahrzeuge` (**neu**,
  Migration 44: welche Fahrzeuge betrifft der Auftrag, mit Kilometerstand am Tag des Auftrags –
  seit Migration 51 die einzige Quelle dafür; das frühere, einzelne `orders.vehicle_id` ist mit
  derselben Migration entfernt).
- **Rechnungen** (**neu**, Migration 48/49): `rechnungen` – jede Zeile ein unveränderlicher
  Snapshot aus Empfänger/Absender/Positionen (jsonb), fortlaufende, lückenlose Nummer je
  `betrieb.rechnung_praefix` + `betrieb.rechnung_naechste_nummer`; eine Korrektur läuft über
  eine Stornorechnung (`art = 'storno'`, `hebt_auf`), nie über ein Update.
- **Betrieb** (**neu**, Migration 38, erweitert 48): `betrieb` – genau eine Zeile
  (`id boolean primary key check (id)`), zunächst nur `termin_intervall_min`, seit Migration 48
  zusätzlich der komplette Briefkopf (Firma, Anschrift, USt-IdNr., Bankverbindung, Logo als
  data:-URI, Fuß-/Anschreibetexte) plus die beiden Nummernkreise für Rechnungen und Kunden.
- **Lager**: `warehouses`, `storage_slots`, `tire_storage` (+ seit Migration 46
  `entnahme_order_id` – in welchem Auftrag wurde ein Satz wieder herausgegeben),
  `eingelagerte_raeder` (einzeln gemessene Räder je Satz, mit Position VL/VR/HL/HR, DOT-Datum
  und Profiltiefe seit Migration 33/34 – ersetzt die früheren Angaben am Fahrzeug).
- **Artikelstamm**: `articles` (+ Migration 46 `abrechnungsart`: `normal`/`lagergebuehr` –
  löst den überladenen Haken `braucht_lagerplatz` ab, der jetzt tot ist, aber noch nicht
  entfernt; + `fragt_einlagerung`, eine reine Erinnerungsfrage ohne Zwang; + Migration 48
  `einheit` [„Stück"/„Fahrt"/…]; + Migration 50 `freitext` – die Bezeichnung dieser Leistung
  kommt vollständig aus `order_articles.note` und ersetzt den Artikelnamen auf der Rechnung,
  für Sammelpositionen wie „Sonstiges"), `article_prices`.
- **Mitarbeiter/Fuhrpark**: `employees`, `firmenfahrzeuge` (**neu**, Migration 32: eigene
  Transporter, getrennt von den Kundenfahrzeugen).
- **Rechte/Protokoll**: `module_permissions` (seit Migration 42 drei Rollenlisten je Bereich:
  `read_roles`/`edit_roles`/`delete_roles` statt vorher einem Haken je Modul), `profiles`,
  `audit_log` (seit Migration 18, seit Migration 36 zusätzlich generierte Spalten `auftrag_id`/
  `kunde_id` für indizierte Abfragen sowie für Admin **und** Superadmin lesbar).
- **Adressen/Push** (unverändert seit vor dem 10.09., der Vollständigkeit halber):
  `geocode_cache`, `adressvorschlag_cache`, `push_geraete`, `push_versand`.

## Rechte: `darf(bereich, verb)`

Seit Migration 42 hat jeder fachliche Bereich (`kunden`, `auftraege.auftrag`,
`auftraege.leistungen`, `auftraege.einteilung`, `lager.regale`, `lager.einlagerung`,
`lager.raeder`, `artikel`, `mitarbeiter`, `firmenfahrzeuge`, `einstellungen`, `rechnungen`, …)
drei Verben: `lesen`/`schreiben`/`loeschen`. Eine einzige SQL-Funktion
`public.darf(p_bereich, p_verb)` wertet das gegen `module_permissions` aus und wird sowohl von
den RLS-Richtlinien als auch – über `lib/constants.ts` (`RECHTE_KATALOG`/`canView()`) – von der
Oberfläche gefragt. `PermissionMatrix.tsx` zeigt/ändert dieselbe Tabelle mit drei Häkchen statt
vorher einem. Löschen ist in dieser Anwendung überwiegend gar kein SQL-`DELETE`, sondern ein
Soft-Delete (`deleted_at`) – dafür sitzt seit Migration 42 ein eigener Trigger
(`pruefe_loeschrecht()`), weil eine RLS-Richtlinie ein verweigertes `UPDATE`/`DELETE` sonst
lautlos auf „0 Zeilen betroffen" reduziert, ohne Begründung. Migration 41 hat den
Spaltenschutz für Techniker an Aufträgen zusätzlich von einer Positiv- auf eine Negativliste
umgestellt: ein Techniker darf seit dem 16.09.2026 an seinem eigenen Auftrag alles ändern außer
stornieren, löschen, wiedereröffnen oder ihn einem anderen Kunden zuordnen. Details, Herleitung
und die komplette Rollenmatrix stehen in `berechtigungen-und-rollen.md`.

## Zentrale Datenbankfunktionen und Trigger

Ergänzend zu den in `berechtigungen-und-rollen.md` und `lager.md` beschriebenen Regeln, als
Fundstellen-Überblick:

- **`public.darf(bereich, verb)`** – die eine Rechteprüfung, von RLS und Oberfläche gleichermaßen
  gefragt (Migration 42).
- **`public.stamp_row()` / `public.audit_row()`** – schreiben `created_by`/`updated_by`/
  `updated_at` bzw. eine Protokollzeile; liegen inzwischen auch auf `order_employees`,
  `firmenfahrzeuge`, `eingelagerte_raeder`, `auftrag_fahrzeuge` und `betrieb` (Migration 36/44).
- **`public.enforce_order_status_transition()`** – welche Statuswechsel eines Auftrags erlaubt
  sind, setzt `completed_at`/`cancelled_at` (Migration 20, neu gefasst in Migration 46 ohne den
  alten Einlagerungs-Zwang).
- **`public.pruefe_rechnungsdaten()`** – blockt den Abschluss eines Auftrags mit
  `rechnung_noetig`, solange Name/Anschrift/E-Mail des Kunden oder Kennzeichen/Kilometerstand
  eines zugeordneten Fahrzeugs fehlen; nennt in einer Meldung alles Fehlende auf einmal
  (Migration 44).
- **`public.kontakt_aus_abschluss()`** – ein abgeschlossener Auftrag setzt automatisch
  `customers.status = 'kontaktiert'` und schreibt einen `contact_history`-Eintrag, `security
  definer`, weil ein Techniker selbst kein Schreibrecht auf `customers` hat (Migration 47).
- **`public.vergib_kundennummer()` / `public.vergib_rechnungsnummer()`** – vergeben die beiden
  fortlaufenden Nummernkreise unter Zeilensperre (`for update`) auf `betrieb`, damit keine Lücke
  und keine Doppelvergabe entsteht (Migration 48/49). Eine Rechnung ohne gepflegten Firmennamen
  in `betrieb` wird abgelehnt, bevor die Nummer verbraucht ist.
- **`public.rechnung_unveraenderlich()`** – lässt an einer ausgestellten Rechnung nur noch das
  Stornieren zu, jede andere Änderung und jedes `DELETE` wirft eine Ausnahme (Migration 48).
- **`public.rechnung_am_auftrag()` / `public.stempel_rechnung()`** – verknüpfen Rechnung und
  Auftrag in einer Transaktion; „Rechnung erstellt" lässt sich von Hand nicht mehr zurücknehmen,
  solange ein gültiger Beleg existiert (Migration 40/49).
- **`public.restrict_techniker_order_update()`** – Negativliste gesperrter Spalten für
  Techniker an `orders` (Migration 41, siehe oben).
- **`public.ist_kollege()` / `public.ist_eigener_kunde()`** – ob zwei Mitarbeiter einen
  gemeinsamen Auftrag haben bzw. ob der Aufrufer einen Auftrag bei diesem Kunden hat; tragen die
  Sichtbarkeit von Mitarbeiterliste und Kundendaten für Techniker (Migration 42/45).

## `app/page.tsx` heute

`app/page.tsx` war die Hauptanwendung als eine große Datei (Höchststand ~3.660 Zeilen) und war
durch Phase 2 (Komponenten auslagern) und Phase 3 (Datenzugriffsschicht) auf ~1.290 Zeilen
geschrumpft (Stand 10.09.2026). Seither ist die Datei mit den neuen Modulen (Rechnungen,
Betrieb, Fahrzeuge am Auftrag, Räder-Einzelmessung, Saisonliste, Auswertungen, Protokoll-Anzeige
am Auftrag, QR-Aufkleber) wieder auf **~3.150 Zeilen** gewachsen – nicht durch einen Bruch mit
dem Muster, sondern weil jedes neue Modul denselben Satz an State/`refreshX()`/CRUD-Funktionen
und Ableitungen zusätzlich in `HomePage` bekommen hat, statt dass ältere Bereiche kleiner
wurden. Neuere, schreibarme Bereiche wie Rechnungen und Betrieb laden dagegen konsequent über
einen eigenen TanStack-Query-Hook (`useRechnungen`, `useBetrieb`) und werden nur noch als Props
durchgereicht; das Änderungsprotokoll lädt sogar komponenten-lokal in `AdminPanel`/`ProtokollPanel`,
ganz ohne Umweg über `HomePage`. Die zentrale `HomePage`-Komponente hält weiterhin den gesamten
App-State (Kunden, Aufträge, Mitarbeiter, Artikel, Berechtigungen, Kartensteuerung,
Popover-Menüs …) sowie das Layout/Routing zwischen den Tabs – das ist beabsichtigt und bleibt so.

Alle Panel-/Modal-Komponenten (siehe Repo-Struktur oben, inzwischen weit über zwanzig) sind in
eigenen Dateien unter `components/` und werden von `HomePage` per Props angesteuert. Alle
direkten `supabase.from(...)`-Tabellenzugriffe sind in `lib/api/*.ts` gezogen (inzwischen 17
Dateien) – `HomePage` behält nur noch ihre `refreshX()`/`addX()`/`updateX()`/`deleteX()`-
Funktionen, die die passende `lib/api`-Funktion aufrufen und danach den React-State
aktualisieren bzw. über `qk.*` einen Query-Schlüssel für ungültig erklären.

Was noch in `app/page.tsx` steckt (bewusst): der App-State selbst, die dünnen `refreshX()`/
CRUD-Wrapper, die Popover-Logik (`xMenuFor`/`clampMenuTop()` …), die Karten-Initialisierung
und -Interaktion (Leaflet, Marker, Popups) sowie Tab-/Routing-Logik. `supabase.auth.getUser()`/
`signOut()` bleiben ebenfalls hier – das ist Sitzungssteuerung, kein Tabellenzugriff, und
gehört nicht in `lib/api`. Der Aufruf `datenSpeicherLeeren()` (`app/providers.tsx`) beim Abmelden
gehört aus demselben Grund hier hinein: er beendet dieselbe Sitzung, zu der auch `signOut()`
gehört.

### Wiederkehrende Namenskonventionen in `app/page.tsx`

Diese Muster ziehen sich durch alle Module – bei neuen Modulen bitte beibehalten, damit der
Code trotz der Größe der Datei vorhersehbar bleibt:

- **State pro Tabelle**: `const [x, setX] = useState<T[]>([])`, plus `async function
  refreshX()` das die Tabelle neu von Supabase lädt und den State ersetzt. CRUD-Funktionen
  heißen `addX`/`updateX`/`deleteX`, rufen nach dem Supabase-Call immer `refreshX()` erneut
  auf (keine optimistischen Updates, bewusst einfach gehalten).
- **Verknüpfungstabellen** (viele-zu-viele, z. B. `order_employees`, `order_articles`,
  `auftrag_fahrzeuge`) bekommen zusätzlich einen Helfer `xFor(id)`, der aus dem flachen State
  die Zeilen zu einem Datensatz herausfiltert (z. B. `orderArticlesFor(orderId)`).
- **Popover-Menüs** (Anrufen, Navigation, Mitarbeiter-Zuordnung, Artikel-Zuordnung) folgen
  alle demselben Muster: State `xMenuFor`/`xMenuPos`, eine `openXMenu(e, id)`-Funktion, die
  über `clampMenuTop()` verhindert, dass das Menü unten aus dem Fenster läuft (siehe
  `design-system.md`), und ein `.call-menu`-Div ganz am Ende von `HomePage`.
- **`liveRef`**: ein `useRef`, das immer den aktuellen Stand von `customers`/`orders`/
  `settings` hält – nötig, weil Leaflet-Popup-Callbacks außerhalb des React-Renderzyklus
  laufen und sonst mit veralteten Closures arbeiten würden.
- **Neuere, schreibarme Bereiche** (Rechnungen, Betrieb) brechen bewusst mit dem ersten Muster:
  kein `refreshX()`/State-Paar in `HomePage`, sondern ein eigener Hook aus
  `lib/queries/hooks.ts`, dessen Ergebnis direkt als Prop weitergereicht wird.

### Datenfluss

Supabase (Postgres + RLS) → `refreshX()`-Funktionen bzw. TanStack-Query-Hooks → React-State/
Query-Cache → Props nach unten an Panel-/Modal-Komponenten → Nutzeraktion ruft `onX`-Callback
nach oben → CRUD-Funktion schreibt nach Supabase → State-Refresh bzw. `neuLaden(qk.*)`. Es gibt
keine separate Zustandsverwaltung (kein Redux/Zustand/Context) – alles läuft über Props und den
State von `HomePage` selbst, ergänzt um den TanStack-Query-Cache, der zusätzlich in der
IndexedDB des Geräts persistiert wird (`app/providers.tsx`, siehe „PWA, Service Worker und
Push" unten).

## Fehlerbehandlung (seit Roadmap-Phase 9)

Jede Funktion in `lib/api/*.ts` wirft bei einem Supabase-Fehler eine `ApiError`
(`lib/api/client.ts`) statt den Fehler zu verschlucken. `app/page.tsx` fängt das an genau einer
Stelle ab – ein `unhandledrejection`-Listener setzt den `fehler`-State, der als
`.fehler-hinweis` unten rechts eingeblendet wird.

Der Nebeneffekt ist der eigentliche Gewinn: bricht ein Klick-Handler mit einer Ausnahme ab,
läuft das `refreshX()` dahinter **nicht** mehr. Die Eingabe des Nutzers bleibt also im
Formular stehen, statt vom alten Serverstand überschrieben zu werden. Vorher sah ein
abgelehnter Schreibvorgang für den Nutzer so aus, als hätte die Anwendung seine Eingabe
einfach vergessen. Dasselbe gilt jetzt auch für die vielen Datenbank-Trigger, die seit
Migration 40–49 fachliche Ausnahmen werfen (fehlende Rechnungsdaten, unveränderliche Rechnung,
gesperrte Statuswechsel) – sie laufen über denselben `ApiError`-Weg und dieselbe Anzeige.

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
- **19 Hooks** in `lib/queries/hooks.ts`, jeder mit einem `aktiv`-Schalter: Lager, Artikel,
  Mitarbeiter, Betrieb und Rechnungen laden erst beim Öffnen des jeweiligen Moduls, Fahrzeuge
  und die vollständige Auftragshistorie nur für den geöffneten Kunden. Immer geladen sind nur
  Kunden und das Auftrags-Zeitfenster – beide stecken in Karte, Dashboard und fast jeder Liste.
  Neu seit Migration 44/48: `useAuftragRechnungen(orderId, aktiv)` lädt die Rechnungen genau
  eines geöffneten Auftrags, `useBetrieb`/`useRechnungen` den Briefkopf bzw. die volle Liste.
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
- **Dauerhafte Persistenz seit 09.09.2026**: `app/providers.tsx` hängt zusätzlich zum
  In-Memory-Cache einen `createAsyncStoragePersister` mit IndexedDB-Speicher
  (`idb-keyval`) ein. Der gesamte Query-Cache – auch Kundennamen, Adressen, Telefonnummern –
  überlebt damit das Schließen der App. Drei Schutzmaßnahmen hängen daran und dürfen nicht
  einzeln entfernt werden: ein Höchstalter von sieben Tagen (`HOECHSTALTER_MS`), das Löschen
  des Speichers beim Abmelden (`datenSpeicherLeeren()`), und ein Schema-Kennzeichen (`SCHEMA`),
  das bei einer Formänderung den alten Bestand verwirft statt ihn falsch zu interpretieren.

**Reihenfolge beim Start**: die Abfragen laufen erst los, wenn die Anmeldung geprüft und die
eigene Rolle geladen ist (`sitzungBereit` in `HomePage`, als `aktiv`-Schalter in jedem Hook).
Vor Phase 10 ergab sich das von selbst, weil alles Laden nacheinander in einem einzigen Effekt
lief. Seit die Abfragen eigenständig sind, müssen sie ausdrücklich warten – sonst überholen sie
den Sitzungsstart, gehen mit einem abgelaufenen Zugriffstoken hinaus und Supabase antwortet mit
`401`, während im Hintergrund gerade ein frisches Token geholt wird.

**Ein neues Modul anschließen** heißt hier: `lib/api/<modul>.ts` für die Abfragen, ein Schlüssel
in `lib/queries/keys.ts`, ein Hook in `lib/queries/hooks.ts` mit passendem `aktiv`-Schalter, und
in den CRUD-Funktionen das `neuLaden(qk.<modul>())` nach der Änderung.

## PWA, Service Worker und Push-Benachrichtigungen

Drei technisch getrennte Stufen, mit einer bewussten Grenze zwischen ihnen:

- **Installierbarkeit** (`app/manifest.ts`, erzeugt statt als statische Datei ausgeliefert,
  damit der App-Name nur in `lib/erscheinung.ts` steht statt zusätzlich in einer
  `manifest.webmanifest`). `lib/pwaInstallation.ts` fängt das einmalige
  `beforeinstallprompt`-Ereignis schon beim ersten Rendern ab (`components/PwaBereit.tsx`) und
  hält es vor, weil der Einstellungen-Reiter, in dem der Installations-Knopf später sitzt, zu
  dem Zeitpunkt oft noch gar nicht gezeichnet ist. `lib/erscheinung.ts` sorgt dafür, dass App
  auf dem Homescreen und im Installationsdialog absichtlich unauffällig heißt/aussieht
  (Sichtschutz, kein Sicherheitsmechanismus – RLS bleibt die eigentliche Schranke).
- **Programm-Hülle im Cache** (`public/sw.js`, aktuelle Fassung **`v51`**, Konstante
  `FASSUNG`): ausschließlich JS-/CSS-Bündel unter `/_next/static/`, Icons, Manifest, die
  Offline-Seite und Google-Fonts landen im Cache – ausdrücklich **keine** Supabase-Antwort,
  keine Kartenkachel, kein `/api/`-Aufruf. Ein neuer Worker ruft nicht von sich aus
  `skipWaiting()`, sondern wartet auf ein `"UEBERNIMM"` von der Seite
  (`components/PwaFassung.tsx`/`PwaInstallieren.tsx`, `lib/pwaAktualisierung.ts`) – sonst
  tauschte sich die Anwendung mitten in einer Eingabe aus. Bei jeder Änderung an `sw.js` muss
  `FASSUNG` hochgezählt werden, sonst bleibt der alte Cache aktiv.
- **Dauerhafter Datenbestand** (Stufe 3, siehe „Datenladen" oben): der TanStack-Query-Cache
  selbst liegt zusätzlich in der IndexedDB. Das ist die einzige Stelle, an der tatsächlich
  Kundendaten offline auf dem Gerät liegen – bewusst getrennt vom Service Worker, damit die
  Grenze „was cacht der Worker" nachvollziehbar bleibt. `components/OfflineHinweis.tsx` zeigt
  bei fehlendem Netz unübersehbar an, dass ein gespeicherter Stand angezeigt wird, und wie alt
  er ist (`useIstOffline()`, kombiniert mit dem Zustand aus `app/page.tsx`, weil
  `navigator.onLine` auf iOS im Flugmodus gelegentlich trotzdem „online" meldet). Es handelt
  sich um reines Offline-**Lesen** des zuletzt geladenen Stands – keine Warteschlange für
  Schreibvorgänge ohne Netz.
- **Push-Benachrichtigungen** (`docs/benachrichtigungen-plan.md`): `lib/push.ts` meldet das
  Gerät beim Server an (`app/api/push/anmelden`/`abmelden`, Tabelle `push_geraete`, Migration
  26); der öffentliche VAPID-Schlüssel kommt über `app/api/push/schluessel` zur Laufzeit statt
  als `NEXT_PUBLIC_`-Variable, weil solche Werte beim Bauen fest eingebacken würden.
  `app/api/push/senden` läuft minütlich über `pg_cron`/`pg_net` (Migration 28) mit einem
  gemeinsamen Geheimnis im Kopffeld statt einer Nutzer-Session und verschickt Termin-
  Erinnerungen über `web-push`; eine Doppelmeldungssperre (`push_versand`, Migration 27)
  verhindert, dass zwei gleichzeitige Läufe dieselbe Erinnerung zweimal verschicken. Wohin eine
  angetippte Benachrichtigung führt, legt der Service Worker über die Cache Storage ab
  (`lib/benachrichtigungZiel.ts`) statt über `client.postMessage()`, weil das auf iOS bei einer
  eingefrorenen Hintergrund-App nicht zuverlässig ankommt.
- **QR-Aufkleber** (`lib/aufkleberCode.ts`, `components/QrScanner.tsx`, `qrcode`/`jsqr`): zwei
  Aufkleber-Arten, Regal (`?lagerplatz=…`) und Reifensatz (`?satz=…`, seit 17.09.2026), mit der
  Sorte im Parameternamen, damit ein Satz-Etikett nicht versehentlich als Lagerplatz-Code
  durchgeht. Auf dem Aufkleber steht ein Link auf die App, kein bloßer Code – funktioniert damit
  auch mit der normalen Handykamera.

## Migrationsstand

Die SQL-Migrationen liegen durchnummeriert unter `supabase/migrations/`, die Rücknahmen unter
`supabase/migrations/rollback/<nr>_rollback.sql`. Der aktuelle Stand reicht bis
**Migration 52** (21.09.2026). Fachlich wichtige Stationen seit dem 10.09.2026 (Migration 28):

- **34** – DOT-Datum/Profiltiefe vom Fahrzeug an den Reifensatz verschoben.
- **35** – `customers.geo_genauigkeit` (exakt/ungefähr/von Hand).
- **36** – Änderungsprotokoll für Admin **und** Superadmin lesbar, Auftrags-/Kundenbezug als
  indizierte generierte Spalten, drei bis dahin unprotokollierte Tabellen nachgezogen.
- **37** – `orders.end_time`, Termine als Von-bis-Block im Kalender.
- **38** – `orders.rechnung_noetig`, `order_articles.endpreis_netto` statt Prozentrabatt, neue
  Tabelle `betrieb` (Terminraster).
- **39** – drei tote Spalten entfernt (`assigned_employee_id`, `discount_percent`,
  `user_settings.theme`).
- **40** – `orders.rechnung_erstellt_am`/`_von`/`_nummer`, Techniker bewusst ausgeschlossen.
- **41** – Spaltenschutz für Techniker an Aufträgen von Positiv- auf Negativliste umgestellt:
  darf jetzt alles außer stornieren/löschen/wiedereröffnen/Kunde ändern.
- **42** – Rechte-Modell auf lesen/schreiben/löschen je Bereich umgestellt (`public.darf()`),
  Mitarbeitersicht für Techniker auf Kollegen eingeschränkt.
- **43** – Aufräumen der Geisterrichtlinien aus einem frühen Entwurf von Migration 42.
- **44** – Tabelle `auftrag_fahrzeuge` (mehrere Fahrzeuge + Kilometerstand je Auftrag),
  Vollständigkeitsprüfung fürs Abschließen mit Rechnung.
- **45** – Techniker sehen wieder Kunden/Fahrzeuge ihrer eigenen Aufträge (Korrektur zu einer zu
  strengen Migration 42).
- **46** – Lagergebühr wird beim Auslagern fällig statt beim Einlagern erzwungen
  (`articles.abrechnungsart`, `tire_storage.entnahme_order_id`), Abschluss-Zwang aus
  Migration 22 entfällt ersatzlos.
- **47** – ein abgeschlossener Auftrag setzt automatisch den Kontaktstand des Kunden.
- **48** – PinPoints wird rechnungsführendes System: Tabelle `rechnungen`, Betriebs-Briefkopf,
  fortlaufende Kundennummer.
- **49** – Rechnung und Auftrag transaktional verknüpft, „Rechnung erstellt" nur noch per
  Stornorechnung rücknehmbar.
- **50** – `articles.freitext` für Sammelpositionen wie „Sonstiges".
- **51** – `orders.vehicle_id` entfernt: welches Fahrzeug ein Auftrag betrifft, steht nur noch
  in `auftrag_fahrzeuge`. Zuvor hatten Rechnung/Vollständigkeitsprüfung und der
  Vorgeschichte-Hinweis im Auftragsfenster jeweils eine andere der beiden Stellen gelesen.
- **52** – holt aus `audit_log` die Fahrzeug-Zuordnungen nach, die beim Lauf von 51 verloren
  gingen. Hintergrund: Der Supabase-SQL-Editor führt ein Skript Anweisung für Anweisung aus,
  `begin`/`commit` hält nicht über die ganze Datei. Der Rettungsschritt in 51 hing an einer
  temporären Tabelle, scheiterte deshalb – und das `drop column` danach lief trotzdem. Dass
  sich das reparieren ließ, verdankt sich dem Protokoll aus Migration 18: Es hält die ganze
  Zeile als jsonb fest und überlebt damit die Spalte, die es beschreibt.

`supabase/migrations/README.md` führt Buch darüber, was in der Produktivdatenbank schon
ausgeführt ist und was noch aussteht; die Begründungen stehen zusätzlich in den
Kopfkommentaren der einzelnen Migrationen.
