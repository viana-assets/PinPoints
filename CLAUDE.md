# Viana PinPoints – Projektanweisung für Claude

Diese Datei ist die Standard-Instruktion für jede Claude-Session, die an diesem
Repo arbeitet. Vor Beginn der Arbeit lesen und befolgen.

Die Detail-Dokumentation liegt in `docs/` – siehe `docs/README.md` für die Übersicht.
Diese Datei hier bleibt bewusst schlank: Prozessregeln, gelernte Fallstricke,
Tech-Stack-Kurzüberblick, Verweis dorthin.

Stand: 18.09.2026 (nach der vollständigen Projektdurchsicht, Migrationen bis 50).

---

## 1. Wer arbeitet hier wie

Vitali Hermann (Samhammer AG) hat **keinen Terminal- und keinen Git-Zugriff**.
Er arbeitet ausschließlich über die Browser-Oberflächen von GitHub und Supabase:

- Code-Änderungen zieht er per Drag & Drop einzelner Dateien in die GitHub-Weboberfläche
  (Repo: `viana-assets/PinPoints`, Ordner `viana-pinpoints/`).
- Löschungen macht er manuell über den Papierkorb-Button auf der jeweiligen
  GitHub-Dateiseite („Delete this file" → „Commit directly to the main branch").
- Datenbank-Änderungen (SQL) führt er manuell im Supabase-SQL-Editor aus.
- Deployment läuft automatisch über Vercel bei jedem Commit auf `main`.

### Daraus folgt für Claude

1. Jede Code-Änderung wird direkt in den mit dem Gerät verbundenen OneDrive-Ordner
   geschrieben:
   `C:\Users\vhermann\OneDrive - Samhammer AG\Claude\Viana Plattforms\PinPoints\viana-pinpoints\`
2. **Nie** den Dateiinhalt im Chat ausgeben. Vitali lädt nichts herunter – die Datei liegt
   schon im Ordner. Die Dateikarte, die beim Schreiben technisch entsteht, **nie
   kommentieren, nie ankündigen** – Werkzeuge nacheinander aufrufen und erst zur fertigen
   Pfadliste wieder Text schreiben.
3. Nach jeder Code-Änderung **ausschließlich** eine schlichte Liste der geänderten Pfade
   zurückgeben – **relativ zu `viana-pinpoints/`**, dieser Ordnername also weggelassen.
   Dateien im Wurzelverzeichnis stehen nur mit ihrem Namen, alle anderen mit Unterordner:

   ```
   app/globals.css
   app/page.tsx
   lib/types.ts
   package.json
   ```

   Kein Fließtext dazwischen, keine Aufzählungszeichen, keine Begründung – nur die reine
   Pfadliste, damit er sie in einem Rutsch nach GitHub ziehen kann. Bei reinen Rückfragen,
   Analysen oder Planungsantworten normal antworten.
4. **NEUE Dateien ganz oben und als neu gekennzeichnet.** Am 18.09.2026 ist ein
   Vercel-Build rot geworden, weil eine einzige neue Datei in einem Unterordner
   (`lib/api/protokoll.ts`) in der Liste untergegangen und nicht hochgeladen worden war.
   Eine bestehende Datei zu überschreiben verzeiht GitHub, eine fehlende neue nicht.
   Format:

   ```
   NEU: lib/api/protokoll.ts
   NEU: components/rechnungen/RechnungModal.tsx
   ---
   app/page.tsx
   lib/constants.ts
   ```
5. Muss eine Datei **gelöscht** werden, das explizit dazuschreiben („außerdem auf GitHub
   löschen: …") – Löschungen funktionieren nicht per Drag & Drop.
6. **Echte Kundendaten gehören nicht ins Repository.** Skripte, die reale Bestandsdaten
   enthalten oder erzeugen (Kundennummern-Übernahme, Betriebsdaten-Erstbefüllung), werden
   nach `PinPoints\lokal\` geschrieben – außerhalb von `viana-pinpoints/`, also außerhalb
   des Repos. Im Chat wird der Inhalt solcher Skripte ebenfalls nicht wiedergegeben.

---

## 2. Datenbank-Migrationen

- **Immer eine neue, durchnummerierte Datei** unter `supabase/migrations/` anlegen, nie eine bestehende
  überschreiben oder rückwirkend ändern – sonst verliert Vitali den Überblick, was in
  Supabase schon gelaufen ist.
- **Rücknahme-Skript dazulegen** unter `supabase/migrations/rollback/<nr>_rollback.sql`. Ohne Terminal kann
  er eine misslungene Migration sonst nicht rückgängig machen.
- `supabase/migrations/README.md` als Liste „Bereits ausgeführt" / „Noch auszuführen"
  mitpflegen, und im Chat kurz sagen, welche Datei im SQL-Editor auszuführen ist.
- **`insert` in Migrationen immer absichern** (`on conflict do nothing` oder
  `where not exists`), damit ein zweiter Lauf nichts dupliziert.
- Jede Migration wird vor der Auslieferung gegen ein **echtes lokales Postgres** geprüft:
  ausführen, ein zweites Mal ausführen (muss folgenlos sein), zurücknehmen, Verhalten
  testen.

### Was der Supabase-SQL-Editor kann und was nicht

- Er zeigt **weder `raise notice` noch `raise warning`** – nur Ergebnistabellen und den
  letzten Fehler. Ein Skript, das etwas mitteilen will, **gibt eine Ergebnistabelle aus**.
  Wo eine Meldung unvermeidlich ist, müssen *alle* Beanstandungen in den einen Fehlertext.
- „Erst laufen lassen, Ergebnis lesen, dann festschreiben" gibt es dort nicht – deshalb
  werden Übernahme-Skripte in **zwei Dateien** geteilt: `..._1_pruefen.sql` (nur
  Ergebnistabelle) und `..._2_uebernehmen.sql`.
- **`begin;` … `commit;` hält NICHT über die ganze Datei.** Der Editor führt das Skript
  Anweisung für Anweisung aus und schließt jede für sich ab. Das heißt:
  - **Keine temporären Tabellen, keine Sitzungsvariablen, kein Zustand zwischen zwei
    Anweisungen.** Eine `create temporary table … on commit drop` ist am Ende ihrer eigenen
    Anweisung schon wieder fort. Jede Anweisung muss für sich allein stehen.
  - **Eine Migration ist nicht atomar.** Scheitert Schritt 3, sind Schritt 1 und 2 trotzdem
    festgeschrieben und Schritt 4 läuft womöglich weiter. Jede Migration muss deshalb so
    geschrieben sein, dass ein Abbruch in der Mitte einen brauchbaren Zustand hinterlässt,
    und jeder Schritt einzeln wiederholbar sein (`if exists`, `on conflict do nothing`).
  - **Die gefährliche Reihenfolge ist „erst retten, dann löschen".** Genau daran ist
    Migration 51 am 21.09.2026 gescheitert: Der Rettungsschritt hing an einer temporären
    Tabelle und scheiterte, das `drop column` danach lief trotzdem. Wo ein Schritt einen
    späteren absichert, gehören beide in **getrennte Dateien**, und die zweite wird erst
    ausgeliefert, wenn die erste nachweislich durchgelaufen ist.
- Diese Eigenheiten fallen beim Prüfen gegen ein lokales Postgres **nicht** auf – dort hält
  `begin`/`commit`, und temporäre Tabellen leben. Ein grüner lokaler Lauf beweist, dass die
  Logik stimmt, nicht dass das Skript im Editor durchläuft.

### Rechte und RLS

- **Neues Modul = neue Tabelle = eigene RLS-Policies**, die `public.darf('<bereich>', 'lesen'
  | 'schreiben' | 'loeschen')` abfragen, plus die passende Zeile in `RECHTE_KATALOG` /
  `RECHTE_VORGABE` (`lib/constants.ts`) und in `module_permissions`.
  Nie `for all using (auth.role() = 'authenticated')`.
- **Mehrere Policies für dieselbe Aktion werden ODER-verknüpft.** Eine zusätzliche Policy
  *lockert* immer, sie verschärft nie. Wer einschränken will, muss die bestehende ändern.
- **Ein abgelehntes DELETE ist still**: Die Zeile ist für die Anweisung unsichtbar, es
  werden null Zeilen gelöscht, und niemand sagt warum. Deshalb prüfen die
  DELETE-Policies bewusst nur `lesen`, und die eigentliche Entscheidung trifft der
  BEFORE-Trigger `pruefe_loeschrecht()` (Migration 42), der im Klartext begründet.
  **Das ist Absicht und keine Lücke – nicht „reparieren".**
- Regel daraus: **Durchsetzung, die sich erklären muss, gehört in einen BEFORE-Trigger,
  nicht in eine Policy.**

### Und auf der Code-Seite dazu

Abfragen in `lib/api/<modul>.ts`, ein Schlüssel in `lib/queries/keys.ts`, ein Hook in
`lib/queries/hooks.ts` mit `aktiv`-Schalter (lädt nur, wenn das Modul offen ist), und nach
jeder Änderung `neuLaden(qk.<modul>())`. Nie eine ganze Tabelle beim App-Start laden –
siehe `docs/architektur.md`, Abschnitt „Datenladen".

---

## 3. Verifikation vor jeder Auslieferung

`npx tsc --noEmit`, `npm run lint`, `npm test` und `npm run build` (mit
Platzhalter-`.env.local`, danach `.next`/`.env.local` wieder löschen).

Der Next-Build lässt sich in der lokalen Sandbox des Rechners nicht ausführen (der
Build-Worker stirbt mit SIGBUS) – dafür in die Cloud-Umgebung ausweichen.

Zusätzlich, je nach Art der Änderung:

- **Layout**: in Chromium bei 1280 / 1100 / 700 / 390 px rendern und messen, nicht schätzen.
- **Druckausgabe**: als echtes PDF erzeugen, Seiten zählen, bei QR-Codes den Code aus dem
  gerasterten PDF wieder dekodieren.
- **Migrationen**: siehe oben, echtes lokales Postgres.

---

## 4. Gelernte Fallstricke

Jeder Punkt hier hat einmal Zeit gekostet.

- **`nativeEvent.offsetY` misst gegen das getroffene Element, nicht gegen das, an dem der
  Handler hängt.** Im Stundenraster wird fast immer eine Stundenlinie getroffen; der Wert wäre
  nie größer als eine Stunde. Wer aus einer Klickposition eine Größe ableitet, misst gegen
  `e.currentTarget.getBoundingClientRect()`.
- **Ein Klick auf ein Kindelement erreicht auch den Eltern-Handler.** Bekommt eine Fläche einen
  Klick-Handler, brauchen alle Knöpfe darin `stopPropagation` – sonst tut ein Klick zwei Dinge.
- **Nach einer Zwei-Finger-Geste kann noch ein `click` folgen.** Wer auf derselben Fläche zoomt
  und klickt, muss genau einen Klick schlucken. Eine Sperre über `Date.now()` ist dabei nicht
  nur unsauber, sondern scheitert am Linter (`react-hooks/purity`): Eine im Komponentenrumpf
  deklarierte Funktion gilt als Render-Code. Ein Merker im Ref löst beides.
- **Eine Fläche, die nur erscheint, wenn schon etwas darin liegt, taugt nicht zum Anlegen.**
  Die Leiste „ohne Uhrzeit" musste dafür dauerhaft sichtbar werden.
- **Hover-Einfärbung einer ganzen Tabellen- oder Kalenderspalte sieht nach „ausgewählt" oder
  nach Fehler aus** – besonders, wenn die Spalte (heutiger Tag) ohnehin hinterlegt ist. Für
  „hier entsteht etwas Neues" genügt `cursor:copy`. Im Bild geprüft, nicht vermutet.

- **Deutsche Anführungszeichen in JS-Strings.** `„X"` in einem doppelt gequoteten
  TypeScript-String bricht die Datei. In JSX-Text zusätzlich `react/no-unescaped-entities`
  beachten. Im Zweifel umformulieren statt escapen.
- **Seitenränder beim Druck kommen aus `@page`, nicht aus dem Padding des Elements.**
  Padding wirkt nur auf Seite 1; ab Seite 2 steht der Text sonst am Papierrand.
- **`overflow:hidden` verhindert Seitenumbrüche im Druck.** Ein Element mit `overflow:hidden`
  wird nicht über mehrere Papierseiten umgebrochen; es muss ganz auf eine Seite passen oder
  wird abgeschnitten – aus vier Rad-Etiketten wurde so eine einzige Seite.
- **iOS Safari druckt den Inhalt von `position:fixed`-Elementen nicht.** Am Rechner kam die
  Rechnung sauber heraus, am iPhone ein leeres Blatt; eine Druckausgabe, die nur am Rechner
  geprüft wurde, ist nicht geprüft – beim Drucken ist das Handy das Zielgerät.
- **Der Flex-Spalten-Trick** („Kopf bleibt stehen, Tabelle scrollt für sich",
  `flex:1; min-height:0`) trägt nur, solange über der Tabelle nichts wachsen kann. Sobald
  dort etwas mitwächst (Monatskalender), scrollt die Seite gar nicht mehr.
- **Kein Postgres-Sequence für lückenlose Nummern.** Eine Sequence zählt beim Abbruch
  weiter und reißt eine Lücke. Die nächste Rechnungsnummer steht in
  `betrieb.rechnung_naechste_nummer` und wird in derselben Transaktion `for update` gesperrt.
- **Snapshot-Prinzip bei Belegen.** Eine Rechnung speichert Empfänger, Absender, Positionen
  und Texte als jsonb-**Kopie**, nicht als Verweis. Eine spätere Stammdatenänderung darf
  eine ausgestellte Rechnung nicht verändern.
- **Eine Druckregel darf den Aufbau nicht raten.** Der erste Anlauf gegen das leere Blatt
  nahm an, das druckende Fenster sei ein direktes Kind von `#app`, und blendete mit
  `#app > *{display:none}` alles andere aus. Es war kein direktes Kind – und damit war das
  Blatt auch am Rechner leer. Wer beim Drucken ausblendet, fragt den Baum (`:has()`), statt
  eine Verschachtelung anzunehmen, die er nicht geprüft hat.
- **Ein Protokoll überlebt die Spalte, die es beschreibt.** `audit_log` hält ganze Zeilen als
  jsonb fest; nach einem versehentlichen `drop column` steht der letzte Stand dort noch. Genau
  so ließ sich der Schaden aus Migration 51 mit Migration 52 wieder einsammeln. Deshalb werden
  Beschriftungen für gelöschte Spalten nicht mitgelöscht – und deshalb ist das Protokoll mehr
  als eine Anzeige.
- **`supabase-js` verliert bei dynamischem `select()` die Zeilentypisierung.** Entweder
  `select("*")` verwenden oder mit einem kommentierten expliziten Cast arbeiten.
- **`public/sw.js`: die Konstante `FASSUNG` bei jeder Auslieferung hochzählen** – sonst
  bleibt der alte Service Worker aktiv und die Änderung kommt am Gerät nie an.
- **Fensterfunktionen brauchen die richtige Partition.** Zwei Zeilen mit demselben Wert
  sind nicht dasselbe wie eine mehrdeutige Zeile; dafür eine eigene Identitätsspalte
  mitführen.
- **In PL/pgSQL kollidieren Variablennamen mit Spaltennamen.** Schleifenvariablen anders
  benennen als die Spalten, die sie lesen.
- **Wenn Vitali eine Ja/Nein-Frage stellt, will er eine Ja/Nein-Antwort** – kurz, in
  einfachen Worten, nicht den Architekturaufsatz dazu.

---

## 5. Datenschutz und Compliance

Die AVV/DPA-Frage mit Vercel und Supabase ist am 04.09.2026 geklärt; echte Kundendaten
sind in der laufenden Anwendung zulässig. Was bleibt:

- Keine Kundendaten in Protokolle oder Fehlermeldungen.
- Keine Adressen an Dritte außerhalb der eigenen, gedrosselten Geocode-Route
  (siehe `docs/kunden-und-karte.md`).
- Irreversible Massenänderungen nur mit vorheriger Sicherung.
- Keine echten Kundendaten im Repository und keine im Chat (siehe Regel 1.6).
- Schlüssel und Geheimnisse (VAPID, `PUSH_GEHEIMNIS`, Service-Role-Key) kommen **nie**
  in eine Datei des Repos, nie in die Doku und nie in den Chat – auch nicht als
  „Beispielwert".

---

## 6. Konstanten-Regel

Ein fester Wertebereich wird genau **einmal** zentral als benannte Konstante definiert und
überall per Name referenziert – nie ein zweites Mal als literaler Wert hingeschrieben.
Bei jeder neuen Konstante `docs/konstanten-register.md` mitpflegen.

---

## 7. Tech-Stack (Kurzüberblick – Details in `docs/architektur.md`)

- **Next.js 16** (App Router, Turbopack), React 19, TypeScript im `strict`-Modus,
  Client Components für die Hauptlogik.
- **Supabase**: Postgres + Auth (Invite-only, kein öffentliches Signup) + RLS. Die RLS
  setzt die Modul-Berechtigungen durch, nicht nur die Oberfläche.
- **Leaflet** als npm-Paket, eigener Kartenstil-Schalter.
- **Vercel** Hosting, automatisches Deployment bei jedem Commit auf `main`.
- **CI**: `.github/workflows/typecheck.yml` bei jedem Push/PR auf `main`
  (`tsc --noEmit`, `eslint .`, `vitest run`, `next build`).
- **Tests**: Vitest unter `tests/`, für die reinen Rechenfunktionen (Preise, Rechnung,
  Kalender, Lagerdauer, Aufkleber-Codes).
- **TanStack Query** als Zwischenspeicher aller Datenabfragen (`lib/queries/`,
  `app/providers.tsx`), mit `idb-keyval` als Offline-Lesespeicher.

---

## 8. Wo was steht

| Frage | Antwort in |
|---|---|
| Wie ist der Code strukturiert, welche Konventionen gelten? | `docs/architektur.md` |
| Wie sieht das Design-System aus, wie die Navigation? | `docs/design-system.md` |
| Welche festen Wertelisten gibt es, wo sind sie definiert? | `docs/konstanten-register.md` |
| Wie funktionieren Rollen und Modul-Berechtigungen? | `docs/berechtigungen-und-rollen.md` |
| Wie funktionieren Kunden-Tab und Karte? | `docs/kunden-und-karte.md` |
| Wie funktionieren Aufträge, Termine, Einsatzplanung? | `docs/auftraege.md` |
| Wie funktioniert das Lager-Modul? | `docs/lager.md` |
| Wie funktionieren Artikelstammdaten und Leistungen? | `docs/artikelstammdaten.md` |
| Wie funktioniert die Rechnungsstellung? | `docs/rechnungen.md` |
| Was ist offen, was ist als Nächstes dran? | `docs/fahrplan.md` |
| Wie ist die PWA aufgebaut, was fehlt offline? | `docs/pwa-plan.md` |
| Wie funktioniert die Terminerinnerung per Push? | `docs/benachrichtigungen-plan.md` |
| Wie wird der Etikettendrucker angesteuert? | `docs/prompt-etikettendrucker.md` |
