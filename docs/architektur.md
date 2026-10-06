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
- **Sicherheits-Header** in `next.config.mjs`: `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS (siehe dort für die Begründung der einzelnen Direktiven). Die **CSP**
  setzt seit v106 `proxy.ts` mit einer Nonce je Aufruf statt `'unsafe-inline'` (`lib/csp.ts`,
  Fahrplan B4); dafür werden alle Seiten beim Aufruf erzeugt (`dynamic = "force-dynamic"` in
  `app/layout.tsx`). Kein Inline-Skript und kein `onclick=` mehr – auch nicht in
  `public/offline.html`.
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
- **Tests**: Vitest **5**, `tests/*.test.ts` für reine Rechen-/Prüffunktionen in Node; seit v106
  (Fahrplan C6) zusätzlich Komponententests `tests/*.test.tsx` mit Testing Library in jsdom (Kopfzeile
  `// @vitest-environment jsdom`): zentrale Fehlermeldung (kommt eine Datenbankregel lesbar an?),
  Fotos & Unterschrift, Papierkorb (Reihenfolge Pfade → Löschen → Dateien). Bei den Rechentests
  deutlich mehr Themen
  als ursprünglich: Preise/Rabatte/Endpreis, Rechnungsbeträge und -belege (`rechnung.test.ts`,
  `rechnungsbeleg.test.ts`, `rechnungsdaten.test.ts`), Rechte-Prüfung (`rechte.test.ts`),
  Protokoll-Aufbereitung (`protokoll.test.ts`), Gültigkeitszeiträume, Kalenderwochen und
  Stundenraster, Lagerplatz-Nummerierung und Regalwand-Layout, Lagerdauer, Profiltiefe,
  Saisonliste, Aufkleber-Codes (`aufkleberCode.test.ts`), das Etikett-PNG fürs Teilen-Menü
  (`etikettbild.test.ts`, 21.09.2026: Millimeter-Umrechnung, Textkürzung, Umbruch,
  Dateiname), Adress-/Hausnummer-Abgleich, Kundenzustand, Navigation, Sortieren/Suchen,
  Terminerinnerung und Vorgeschichte.
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
    page.tsx                 Hauptanwendung, ~3.550 Zeilen – siehe "app/page.tsx heute" unten
    _seite/                   Handlungs-Hooks der Startseite, aus page.tsx herausgelöst (v113, C5);
                              der Unterstrich hält den Ordner aus dem Routing heraus
      typen.ts                Gemeinsame Typen (NeuLaden, OfflineOderDirekt, AuftragAnlegen …)
      useLagerAktionen.ts     Lager, Plätze, Einlagerung am Auftrag, Auslagern/Vormerken, Tausch, Räder
      useFahrzeugAktionen.ts  Kartei der Fahrzeuge, Fahrzeuge am Auftrag, Kilometerstand (offline-fähig)
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
    AusgangFenster.tsx              Offline schreiben: „Noch nicht übertragen", Konflikte entscheiden (v101)
    QrScanner.tsx                   Kamera-Scan für Lagerplatz-/Reifensatz-Aufkleber
    FehlerHinweis.tsx               Zentrale Fehlermeldung oben, aus unbehandelten Ablehnungen (C5/C6, v106)
    KennzeichenFeld.tsx             Eingabefeld für Kennzeichen, schreibt immer groß (v108)
    SuchFeld.tsx                    Suchfeld der Listen mit × zum Leeren, auch am iPhone (v110)
    PwaBereit.tsx / PwaFassung.tsx / PwaInstallieren.tsx
                                    Installations-/Update-Mechanik der PWA
    PushEinstellung.tsx             An-/Abmelden für Push-Benachrichtigungen (Einstellungen)
    NeuigkeitenBlatt.tsx            „Was gibt es Neues" (Admin/Superadmin), aus `NEUIGKEITEN`
    dashboard/
      DashboardPanel.tsx            Startseite (Entwurf G): heute, morgen mitnehmen, Hinweise
    karte/
      KartenBedienung.tsx            Alles auf der Karte außer den Nadeln: Suche, Zustands-Pillen,
                                     Ebenen, Standort, Zoom, Legende, Tagesstreifen (Entwurf W)
      KartenKundeKarte.tsx           Die Kundenkarte an der Nadel (ersetzt das Leaflet-Popup)
      nadel.ts                       Nadeln als HTML – eine Quelle für Karte und Legende
    termine/
      TerminePanel.tsx               Reiter „Termine" als Zeitleiste je Tag (Entwurf L)
    WeiterePanel.tsx                Handy-Seite „Weitere": Kacheln nach `WEITERE_GRUPPEN`, je
                                    Kachel ein Hinweis, ob dort etwas wartet (Entwurf V)
    kunden/
      CustomerRowMeta.tsx           Meta-Zeile in der Kundenliste
      AddCustomerForm.tsx           Formular "Neuer Kunde" (Art, Privat/Firma, „Gibt es schon?" mit
                                    Nummer, E-Mail, Name + PLZ – E1, v103)
      AuskunftFenster.tsx           Auskunftsauszug je Kunde zum Drucken/als Datei (E10, v103)
      InaktivePanel.tsx             Tab "Inaktive Kunden": Suche, Reaktivieren/Rückgängig
      DetailModal.tsx                Das Kundenfenster: Kopf, vier Handgriffe, Reiter Übersicht/
                                     Fahrzeuge/Aufträge/Verlauf/Daten, Menü „⋯" (Entwurf O)
      CustomerOrderRow.tsx           Ein Auftrag im Kundenfenster (Karte, öffnet das Auftragsfenster)
      KontaktModal.tsx                Kontakt erfassen/Wiedervorlage setzen (Blatt)
      VehicleSection.tsx             Fahrzeuge je Kunde (VehicleRow, AddVehicleInline)
      KundenListePanel.tsx           Die Kundenliste mit Suche, Filtern, Buchstabenleiste (Entwurf J)
      EingelagerteReifen.tsx         Alle eingelagerten Sätze eines Kunden im Kundenfenster
      AnrufFenster.tsx               „Auf dem Handy anrufen": Fenster nach Antippen der Meldung
    admin/
      SettingsPanel.tsx              Tab "Einstellungen" (Konto, Benachrichtigungen, Anzeige, App)
      AdminPanel.tsx                 Tab "Admin" – Reiter Nutzer, Mitarbeiter, Transporter,
                                     Rechte (Superadmin), Betrieb, Wartung, Protokoll, Dubletten,
                                     Papierkorb
      PermissionMatrix.tsx           Reiter „Rechte": je Rolle Bereich × lesen/schreiben/löschen
      BetriebsdatenPanel.tsx          Betrieb als Zeilenliste, je Abschnitt ein Blatt mit eigenem
                                      „Speichern" (Briefkopf, Bank, Logo, Texte, Nummernkreis,
                                      DATEV, Terminraster; Migration 38/48/59)
      PapierkorbPanel.tsx             Gelöschte Kunden wiederherstellen / endgültig löschen
      DublettenPanel.tsx              Vermutete Dubletten: zusammenführen oder „keine Dublette" (E1, v103)
      ProtokollPanel.tsx              Änderungsprotokoll lesen (Migration 18/36)
      FirmenfahrzeugPanel.tsx         Eigene Transporter (Migration 32)
      AdressenPruefen.tsx             Korrekturliste für ungenau geokodierte Kundenadressen
      GeokodierLauf.tsx               Sammellauf über den ganzen Kundenbestand
      AlleDatenLoeschen.tsx           Wartung, nur Superadmin: alle Daten löschen, Sicherung (Migration 72, v117)
      artikel/
        ArticleAdminPanel.tsx          Tab "Artikel" (eigene Kachel, nicht mehr Teil von Admin –
                                       Ordnerpfad bewusst historisch belassen, um keine
                                       verwaiste Kopie im OneDrive-Ordner zu hinterlassen)
        VorlagenBlock.tsx              Auftragsvorlagen pflegen, unter der Artikelliste (E6, v102)
        ArticleDetailEditor.tsx        Blatt: Artikel bearbeiten + Preis-Historie als Zeitleiste +
                                       Abrechnungsart/Einheit/Freitext-Schalter
    auftraege/
      AuftraegePanel.tsx             Tab "Aufträge & Termine" (Übersicht, Klick öffnet das Fenster)
      AuftragModal.tsx               Das Auftragsfenster in Karten (Termin & Team offen in der
                                     Karte seit v87), Menü „⋯", Fuß mit der Handlung, die dran ist (Entwurf N;
                                     siehe docs/auftraege.md)
      OrderModal.tsx                 Neuen Auftrag anlegen (aus dem Aufträge-Tab)
      ArticleAssignPanel.tsx         Leistungen am Auftrag: −/+ je Zeile, Endpreis/Text
                                     aufklappbar, Blatt „Leistung hinzufügen" (Migration 38/50)
      EinlagerungBlock.tsx            Reifen ein-/auslagern direkt am Auftrag
      LagerSaetzeAmAuftrag.tsx        „Aus dem Lager“ / „Hier eingelagert“ – Platz am Auftrag, auch nach dem Auslagern (v111)
      FahrzeugeBlock.tsx              Fahrzeuge am Auftrag inkl. Kilometerstand, immer sichtbar
                                      (Migration 44/51)
      RechnungsdatenBlock.tsx         Rechnungs-Checkliste am Auftrag, prüft die Fahrzeuge nur
                                      noch (Migration 44/51)
      AuftragProtokoll.tsx            Änderungshistorie dieses einen Auftrags, mit Terminzeile
                                      „von wann auf wann" und „Termin von vorher übernehmen" (v91)
      ReifenSuche.tsx                 „+ Reifen aus dem Lager": Verkaufsreifen zum Auftrag (Migration 61)
      MitnehmenFenster.tsx            „Morgen … Sätze mitnehmen" zum Abhaken (Migration 55/58)
      PacklisteBlock.tsx              Packliste: Leistungen und Reifengrößen des Tages (E2, v100)
      BestaetigungBlatt.tsx           Terminbestätigung/-erinnerung per WhatsApp, SMS, E-Mail (E9, v104)
      FotoBlock.tsx                   Karte „Fotos & Unterschrift" im Auftragsfenster (E3, v105)
      UnterschriftBlatt.tsx           Kunde unterschreibt mit dem Finger, ein Bild mit Satz und Name (E3, v105)
    einsatzplanung/
      EinsatzplanungPanel.tsx        Tab "Einsatzplanung" (Kalender + Listenansicht)
      RoutenBlatt.tsx                 Tagesroute je Mitarbeiter: kürzeste Reihenfolge ab Firma (E5, v104)
      Stundenraster.tsx               Termine als Von-bis-Balken im Tages-/Wochenraster
                                      (Migration 37)
      VerfuegbarkeitAnsicht.tsx       Reiter „Verfügbarkeit“: eigener Monat bzw. Wochenübersicht aller (Migration 68, v112)
    lager/
      LagerPanel.tsx                 Tab "Lager" (Lager, Regalwand, Suche, Scan), ~850 Zeilen
      TireAssignModal.tsx              Einlagern-/Lagerfenster: Kunde, Fahrzeug, Saison, DOT, Profil je Satz/Rad
                                       (bis v105 in LagerPanel.tsx, C5)
      PlatzBlatt.tsx                   Blatt zu einem Lagerplatz (Entwurf H)
      LangliegerListe.tsx              Langlieger-Übersicht (Fahrplan E4)
      VerkaufPanel.tsx / VerkaufsreifenBlatt.tsx
                                       Reiter „Verkauf": Reifen zum Verkauf erfassen (Migration 61)
      VerkaufsreifenEtikett.tsx        Etikett mit QR-Code je Verkaufsreifen (E17, v103)
      SatzZumVerkaufBlatt.tsx          Eingelagerten Satz in den Reifenverkauf übernehmen (E17, v103)
      StapelAuslagern.tsx              Saisonwechsel: die Sätze eines Tages der Reihe nach auslagern (E7, v104)
      SaisonPanel.tsx                  Eigener Reiter „Saisonliste" (Migration 30/31)
      AuslagernDialog.tsx              Auslagern inkl. Lagergebühr-Vorschlag (Migration 46)
      RadBild.tsx / ProfilMarke.tsx     Profiltiefe: Radbild je Rad, Satzwert, Schnellwerte 1–8 mm
      ReifenNotizen.tsx            Notiz zum Satz und je Rad: Felder (Speichern-Knopf), am Satz (beim Verlassen), Anzeige (v115)
                                        (Migration 33/34, Entwurf X1 seit v89) bzw. die Marke
      ReifensatzEtikett.tsx / LagerplatzAufkleber.tsx
                                        QR-Aufkleber für Satz bzw. Regalplatz
      QrBild.tsx                        QR-Code als Vorschaubild, für beide (C2, v102)
    auswertung/
      AuswertungPanel.tsx             Tab "Auswertungen" (Entwurf M, 26.09.2026): Reiter Umsatz,
                                      Kunden, Einsatz, Lager, Artikel, Reifen (E18, v103);
                                      Export DATEV/CSV
    rechnungen/
      RechnungenPanel.tsx             Tab "Rechnungen": Monatsgruppen, Suche, Jahr, „Noch nicht
                                      ausgestellt", Beleg, Storno (Entwurf P)
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
                                 Seitenleiste UND die Handy-Kachelseite „Weitere"; dazu
                                 `WEITERE_GRUPPEN`/`weitereGruppen()`
    version.ts                    `APP_VERSION` und `NEUIGKEITEN` (gleichlaufend mit public/sw.js)
    testkunde.ts                  Testkunden lesen: `auftragsNr()` („T3"), `istTestauftrag`,
                                  `ohneTest…`-Filter für Auswertungen und Exporte (Migration 60)
    calendar.ts                   Reine Kalender-Hilfsfunktionen (Wochenstart, ISO-KW, Mitarbeiterfarbe)
    helpers.ts                  Aufträge/Termine, Kundenzustand, Telefon/Navigation, Preise, Rechnungsdaten
                                  (~500 Zeilen); reicht seit v106 die Themendateien darunter weiter (C5)
    format.ts                     `todayStr`, `datumStr`, `formatDate`, `formatEUR` (C5, v106)
    profiltiefe.ts                Satzwert, Lage, Text und Eingabe der Profiltiefe (C5, v106)
    adresse.ts                    Hausnummer und PLZ aus der einzeiligen Adresse (C5, v106)
    geocode.ts                    Geokodierung über /api/geocode, `ZuVieleAbfragen` (C5, v106)
    regalwand.ts                  Reihen aus dem Platzcode, DOT-Jahr, `handlungsgruende` (C5, v106)
    protokollText.ts              Protokollwerte und -felder lesbar (C5, v106)
    sortieren.ts                  `suchtreffer`, `vergleiche`, `sortiere` (C5, v106)
    lagerdauer.ts                 `lagermonate`, Langlieger-Grenzen (C5, v106)
    verfuegbarkeit.ts             Wer hat wann Zeit: Zeitfenster, Hinweise beim Einteilen, Vorlage (Migration 68, v112)
    lagerVormerkung.ts            Satz im Regal / vorgemerkt / ausgelagert, Gebühr bis zum Termin (Migration 67, v111)
    lagerNotizen.ts               Notizen am Satz – zum Satz und je Rad (Migration 71, v115)
    menuLage.ts                   Menülage bei Seitenzoom (C5, v106)
    csp.ts                        Content-Security-Policy mit Nonce (B4, v106)
    sprungMerker.ts               QR-/Benachrichtigungs-Sprung übersteht das erste Neuladen (D19, v106)
    wischen.ts                    Wann ein Wisch im Kalender als Blättern zählt (v107)
    auftragsAnsicht.ts / kundenAnsicht.ts / lagerAnsicht.ts / saisonAnsicht.ts / terminAnsicht.ts
                                  Die Regeln hinter den neu gestalteten Listen (Entwürfe H–L,
                                  reine Funktionen, je eine Testdatei)
    dashboard.ts                  Rechnungen hinter dem Dashboard (Entwurf G)
    karte.ts                      Regeln hinter der Karte (Entwurf W); gezeichnet in app/page.tsx
    eingelagert.ts                Die eingelagerten Sätze eines Kunden als Liste
    langlieger.ts                 Langlieger-Übersicht (Fahrplan E4)
    laufkunde.ts                  Laufkunde am Auftrag (Migration 57)
    mitnehmen.ts                  „Reifen mitnehmen" – eine Rechnung für Abendhinweis und Fenster
    offline/
      ausgang.ts                  Offline schreiben (F1): Absichten, Konflikte, Vorgreifen,
                                  Zusammenlegen – reine Funktionen (v101)
      speicher.ts                 Der Ausgangskorb in der IndexedDB, `useAusgang()`
      senden.ts                   Übertragen der Reihe nach, Konflikt entscheiden
    packliste.ts                  Packliste des Tages: Leistungen und Reifengrößen (E2, v100)
    telefon.ts                    Telefonnummern in Vergleichsform, Suche (D10, v102)
    dubletten.ts                  Dubletten finden: Gründe, Paare, Vorschlag fürs Zusammenführen (E1, v103)
    auskunft.ts                   Auskunftsauszug als Zeilen (E10, v103)
    belege.ts                     Fotos/Unterschrift: Zielmaße, Pfad, Stand, Satz unter der Unterschrift (E3, v105)
    belegBild.ts                  Foto im Browser verkleinern (Canvas, EXIF-Drehung) (E3, v105)
    route.ts                      Tagesroute: Luftlinie, nächster Nachbar + 2-opt, Maps-Link (E5, v104)
    stapelAuslagern.ts            Stapel-Auslagern: Reihenfolge des Regals, Gebührenvorschlag (E7, v104)
    terminBestaetigung.ts         Text und Links der Terminbestätigung (E9, v104)
    auftragLoeschen.ts            Darf ein Auftrag gelöscht werden, mit welcher Frage (D2, v100)
    fremdabfrage.ts               Abfragebremse der Adressdienste über die Datenbank (B3, v100)
    abendhinweisVersand.ts        Versand des Abendhinweises (aus app/api/push/senden)
    pushInhalt.ts                 Inhalt jeder Push-Meldung an einer Stelle
    ueberschneidung.ts            Doppelbuchungen von Mitarbeiter/Transporter erkennen (D1)
    reifenverkauf.ts              Reifenverkauf: Größe lesen, Hinweise, Lagerwert (Migration 61);
                                  seit v103 Übernahme aus der Einlagerung, Etikett, Auswertung (E17/E18)
    terminAenderung.ts            Termin vorher → nachher für Rückgängig und Historie (v91)
    kennzeichen.ts                Kennzeichen vergleichen, Dubletten erkennen (v93), groß schreiben (v108)
    rechnung.ts                   Rechnungsbeträge/-belege als reine Funktionen (kein
                                  Datenbank-/React-Bezug, deshalb mit Vitest prüfbar)
    auswertung.ts                  Rechenkern der Auswertungen (reine Funktionen)
    auswertungAnsicht.ts           Zeiträume/Saison/Vorjahr, Umsatz aus dem Rechnungsbuch,
                                   Kunden, Einsatz, Lager (Entwurf M, reine Funktionen)
    datev.ts                       DATEV-Buchungsstapel, Debitoren-/Rechnungsliste, CSV,
                                   Windows-1252 (reine Funktionen)
    aufkleberCode.ts                Codieren/Decodieren der QR-Aufkleber (Regal- vs. Satz-Code)
    etikettPdf.ts                   Etiketten als PDF in exakt ihrer Größe (1-Bit-Bild je Seite),
                                    der Druckweg für den Brother (v95)
    etikettBild.ts                  Reifensatz-/Rad-Etikett als PNG in Druckerauflösung
                                    (203 dpi, für den Brother QL-820NWBc 300 dpi), für „Als Bild
                                    teilen" (21.09.2026); zeichnet dieselbe Anordnung wie
                                    `.etikett` in globals.css ein zweites Mal auf eine Leinwand
    erscheinung.ts                  App-Name und Symbole nach außen; seit v88 „MR Assistent", die
                                    Tarnung „Settings" (18.09.2026) liegt als `TARNUNG` bereit
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
                                   (24 Hooks, siehe „Datenladen" unten)
    api/
      client.ts                    Fundament der Schicht: ApiError, q()/qOne()/qWrite(),
                                   fetchPaged() (seitenweises Laden gegen die 1000-Zeilen-Kappung)
      customers.ts                 Kunden + Kontakt-Historie (CRUD + Geocoding-Anstoß)
      orders.ts                    Aufträge/Termine + Mitarbeiter-Zuordnung (order_employees)
      auftragFahrzeuge.ts            Fahrzeuge am Auftrag inkl. Kilometerstand (Migration 44)
      employees.ts                 Mitarbeiter (Einsatzplanung)
      vehicles.ts                  Kundenfahrzeuge (seit v113 auch `fetchVehiclesFuerKunden` in Blöcken zu 150)
      firmenfahrzeuge.ts             Eigene Transporter (getrennt von vehicles.ts, Migration 32)
      articles.ts                  Artikelstamm, Preis-Historie, Auftrags-Artikelzeilen
      lager.ts                     Warehouses, Lagerplätze, Reifen-Einlagerung
      verfuegbarkeit.ts            Verfügbarkeit eintragen, austragen, Vorlage (Migration 68)
      permissions.ts                Modul-Berechtigungen (module_permissions, `darf()`)
      audit.ts                      Lesezugriff auf das Änderungsprotokoll (audit_log)
      protokoll.ts                   Namensauflösung/Aufbereitung fürs Protokoll
      betrieb.ts                     Betriebseinstellungen/Briefkopf (eine einzige Zeile)
      rechnungen.ts                   Rechnungen ausstellen/stornieren (nur diese zwei Schreiber)
      adressen.ts                    Wrapper um api/adresse-suchen
      auswertung.ts                   Datenbeschaffung für das Auswertungs-Modul
      session.ts                    Rolle + Anzeige-Einstellungen beim Initial-Load
      verkaufsreifen.ts              Reifenverkauf (Migration 61)
      mitnehmen.ts                   „Reifen mitnehmen" abhaken (Migration 58)
      vorlagen.ts                    Auftragsvorlagen (Migration 63, E6)
      dubletten.ts                   „Keine Dublette"-Vermerke, Zusammenführen (Migration 64, E1)
      belege.ts                      Fotos/Unterschrift: Speicher-Upload, Anzeige-Links, Löschen (Migration 65, E3)
      pushGeraete.ts                 Geräte, die Benachrichtigungen empfangen
      alleDaten.ts                   Alle Daten löschen: Umfang, Sicherung, Löschen (Migration 72, v117)
  supabase/migrations/
    <nr>_<name>.sql                     Durchnummerierte SQL-Migrationen 01–72
    rollback/<nr>_rollback.sql           Rücknahme-Skript je Migration
    README.md                            Was wofür, Reihenfolge, Abhängigkeiten
    PRUEFUNG_welche_migrationen_liefen.sql
                                        Fragt die Datenbank, welche Migrationen gelaufen sind
  supabase/email-vorlagen/              Mail-Vorlagen für Supabase Auth (Einladung, Passwort)
  docs/                          Diese Dokumentation, siehe docs/README.md
  proxy.ts                       CSP mit Nonce je Aufruf (seit v106) und Auth-Gate für geschützte Routen
                                 (bis Next.js 16: middleware.ts)
```

## Datenmodell

Kein vollständiges ER-Diagramm – die Fachlogik je Tabelle steht in den spezialisierten Docs
(`auftraege.md`, `lager.md`, `artikelstammdaten.md`, `berechtigungen-und-rollen.md`,
`benachrichtigungen-plan.md`). Hier nur der Überblick, welche Tabellen es gibt und was seit
Migration 29 dazugekommen ist.

- **Kunden**: `customers` (+ seit Migration 35 `geo_genauigkeit`: `exakt`/`ungefaehr`/`hand` –
  wie sicher die Kartenposition ist; + seit Migration 48 `kundennummer`, fortlaufend vom
  Server vergeben, `betrieb.kunde_naechste_nummer`), `kunden_keine_dublette` (seit Migration 64:
  Paare, die die Dublettenprüfung findet, die aber verschiedene Personen sind), `contact_history`, `vehicles`
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
- **Fotos und Unterschrift** (**neu**, Migration 65): `auftrag_belege` – je Bild eine Zeile (Art
  vorher/nachher/schaden/unterschrift, Pfad, Beschriftung, Maße), kein Update. Die Datei liegt im
  privaten Storage-Bucket `auftrag-belege` unter `<order_id>/…`; die Speicher-Richtlinien auf
  `storage.objects` fragen `orders` mit den Zeilenrechten des Aufrufers.
- **Lager**: `warehouses`, `storage_slots` (+ seit Migration 64 `groesse`: normales oder großes Fach), `tire_storage` (+ seit Migration 46
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

**Seit v113 (Fahrplan C5)** wandern die Handlungen eines Bereichs als Hook nach `app/_seite/`:
`useLagerAktionen` und `useFahrzeugAktionen` bekommen von `HomePage` einen Kontext (Daten,
`neuLaden`, `offlineOderDirekt`, `refreshX`) und geben die Funktionen zurück, die vorher in
`HomePage` standen – Namen und Verhalten unverändert, die Props der Panels bleiben gleich. Damit
ist die Datei von ~3.950 auf ~3.550 Zeilen geschrumpft. Der Hook wird vor dem ersten `return`
aufgerufen (Regel der Hooks); was er zurückgibt, ist erst ab dieser Zeile da – Funktionen weiter
oben dürfen es nur in Rückrufen benutzen, nicht beim Rendern.

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
- **27 Hooks** in `lib/queries/hooks.ts` (seit v113 `useAuftragFahrzeuge` und `useEinsatzVorrat` –
  der Vorrat legt die Fahrzeuge der Aufträge der nächsten 14 Tage vorab in den Speicher, damit sie
  offline lesbar sind; seit v112 `useVerfuegbarkeiten`; seit v102 `useVorlagen`, seit v105 `useAuftragBelege` und
  `useBelegLinks` für Fotos und Unterschrift – die Links verfallen nach einer Stunde und kommen deshalb
  nicht in den Offline-Lesespeicher), jeder mit einem `aktiv`-Schalter: Lager, Artikel,
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
  Seit dem neuen Dashboard (25.09.2026, `components/dashboard/DashboardPanel.tsx`) lädt der
  Start-Reiter zusätzlich Lager und Kundenfahrzeuge (`brauchtLager`, `alleFahrzeugeQuery` in
  `app/page.tsx`): „Reifen mitnehmen", der Lager-Engpass und das Saison-Barometer brauchen die
  Sätze. Bewusst in Kauf genommen – dieselben Daten lädt der 20-Uhr-Hinweis und das Lager
  ohnehin, und sie landen im Offline-Speicher. Wird das Lager einmal sehr groß, gehört das
  Barometer in eine `count`-Abfrage wie `fetchLagerKennzahlen`.
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
  dem Zeitpunkt oft noch gar nicht gezeichnet ist. `lib/erscheinung.ts` legt fest, wie die App
  auf dem Homescreen und im Installationsdialog heißt und aussieht: seit v88 „MR Assistent",
  seit v90 mit dem ganzen Logo als Symbol (`public/icons/mr-logo-*.png`). Die frühere Tarnung
  „Settings" liegt als `TARNUNG` bereit (`GETARNT = false`).
- **Programm-Hülle im Cache** (`public/sw.js`, aktuelle Fassung **`v102`**, Konstante
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
**Migration 72** (06.10.2026; 72 noch auszuführen). Fachlich wichtige Stationen seit dem 10.09.2026 (Migration 28):

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
- **53** – Laufkundschaft: ein Sammelkunde für Barverkäufe ohne Kundenanlage.
- **54** – Stornogrund auch an der Rechnung Pflicht.
- **55** – Lager-Sperre, Schutz des Nummernkreises, Abendhinweis „Reifen mitnehmen".
- **56** – Datenschutz: Protokoll schwärzen, Kunden endgültig löschen (`kunde_endgueltig_loeschen`).
- **57** – Laufkunde am Auftrag (wer war es), Einmalkunde.
- **58** – „Reifen mitnehmen" abhaken, fürs ganze Team sichtbar.
- **59** – Einstellungen für den DATEV-Export.
- **60** – Testkunden mit negativen Nummern, „Was gibt es Neues".
- **61** – Reifenverkauf aus dem Lager: `verkaufsreifen`, Reservieren/Abbuchen in der Datenbank.
- **62** – Abgerechnete Aufträge nicht löschbar (`pruefe_auftrag_loeschen()`), Abfragebremse der
  Adressdienste je Nutzer und Minute (`fremdabfrage_zaehler`, `fremdabfrage_erlaubt()`).
- **63** – `mit_steuer` an alten Rechnungen festgeschrieben, Telefonnummern in Vergleichsform
  (`telefon_vergleich()`, `customers.mobil_vergleich`/`festnetz_vergleich`), tote Spalte
  `articles.braucht_lagerplatz` entfernt, Tabelle `auftragsvorlagen`.
- **64** – Dubletten (`kunden_keine_dublette`, `kunden_zusammenfuehren()`), Auskunftsauszug
  (`kunde_auskunft()`), Fachgröße am Lagerplatz (`storage_slots.groesse`), Satz zum
  Verkaufsposten (`satz_zum_verkauf()`, `verkaufsreifen.herkunft_satz_id`).
- **65** – Fotos und Unterschrift am Auftrag: privater Bucket `auftrag-belege` mit drei
  Speicher-Richtlinien, Tabelle `auftrag_belege`, Auskunftsauszug mit Belegen
  (`kunde_auskunft()` ruft die alte Fassung als `kunde_auskunft_grund()`).
- **66** – „Rechnung anderswo erstellt": `orders.rechnung_extern`, `stempel_rechnung()` mit
  Rechteprüfung, keine zweite Rechnung für einen anderswo abgerechneten Auftrag
  (`pruefe_rechnung_nicht_anderswo()`), Löschsperre auch ohne Nummer.
- **67** – Auslagern erst beim Abschließen: Im Auftrag wird ein Satz nur vorgemerkt
  (`entnahme_order_id` bei leerem `removed_at`); `auftrag_lager_entnahme()` lagert beim Abschluss
  aus, holt beim Wiedereröffnen zurück und hebt beim Stornieren/Löschen auf;
  `order_articles.lager_satz_id` für die Gebühr. Siehe `docs/lager.md`.
- **68** – Verfügbarkeit der Mitarbeiter: `verfuegbarkeiten` (je Mitarbeiter und Tag, ganzer Tag
  oder Zeitfenster), eigene Zeile ohne Recht, alle mit `einsatzplanung.verfuegbarkeit`;
  `verfuegbarkeit_pruefen()` begründet Ablehnungen, Aufräumen nach 12 Monaten. Siehe
  `docs/auftraege.md`.
- **69** – Reifentausch auf demselben Platz: `tire_storage.kommt_rein`/`tausch_fuer`, neuer
  Platz-Index ohne Tausch-Sätze, `auftrag_lager_entnahme()` tauscht beim Abschließen. Siehe
  `docs/lager.md`.
- **70** – Die Unterschrift eines erledigten Auftrags steht fest: `auftrag_unterschrift_pruefen()`
  (BEFORE INSERT/DELETE auf `auftrag_belege`) lehnt eine zweite Unterschrift und das Löschen ab;
  am stornierten Auftrag keine Unterschrift. Fotos frei. Siehe `docs/auftraege.md`.
- **71** – Notiz je Rad am Satz: `tire_storage.notiz_vl` … `notiz_hr` (je höchstens 300 Zeichen),
  unabhängig von der Messart; Bemerkungen gemessener Räder übernommen; Auskunft nach DSGVO mit
  `reifen_notizen`. Siehe `docs/lager.md`.
- **72** – Alle Daten löschen (nur Superadmin, Admin › Wartung): `alle_daten_umfang()`,
  `alle_daten_sicherung()`, `alle_daten_loeschen('löschen')`. Löscht alle Zugänge außer Admin/
  Superadmin und ALLE Tabellen in `public` außer `alle_daten_behalten()` in einer `truncate`-
  Anweisung, setzt Sequenzen und `betrieb` zurück. Eine neue Einstellungs-Tabelle, die das Löschen
  überstehen soll, gehört in `alle_daten_behalten()` (CLAUDE.md, Abschnitt 2).

`supabase/migrations/README.md` führt Buch darüber, was in der Produktivdatenbank schon
ausgeführt ist und was noch aussteht; die Begründungen stehen zusätzlich in den
Kopfkommentaren der einzelnen Migrationen.
