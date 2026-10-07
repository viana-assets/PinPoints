# MR Assistent (Mobiler Reifenservice) – Projektanweisung für Claude

Die App hieß bis v87 „Viana PinPoints"; Repository, Ordner und technische Schlüssel tragen den
alten Namen weiter (siehe `docs/design-system.md`, „Marke seit v88").

Diese Datei ist die Standard-Instruktion für jede Claude-Session, die an diesem
Repo arbeitet. Vor Beginn der Arbeit lesen und befolgen.

Die Detail-Dokumentation liegt in `docs/` – siehe `docs/README.md` für die Übersicht.
Diese Datei hier bleibt bewusst schlank: Prozessregeln, gelernte Fallstricke,
Tech-Stack-Kurzüberblick, Verweis dorthin.

Stand: 07.10.2026 (Migrationen bis 73, 73 noch auszuführen; Service Worker v118; Regeln seit der Projektdurchsicht vom
18.09.2026).

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
5. **Zusätzlich ein Upload-Ordner je Runde (seit 26.09.2026).** Dieselben Dateien kommen außerdem
   nach `PinPoints\Claude outputs\Hochladen\viana-pinpoints\…` – mit genau der Unterordner-
   Struktur des Repos, aber **nur** mit den Dateien dieser Runde. Vitali zieht den Ordner
   `viana-pinpoints` von dort in einem Zug in die GitHub-Weboberfläche (Stamm des Repos,
   „Add file → Upload files"); GitHub nimmt höchstens 100 Dateien auf einmal, der ganze Ordner
   ginge also nicht. Danach leert er „Hochladen" selbst – Claude darf dort nicht löschen. Liegt
   noch eine Datei aus einer früheren Runde darin, ist sie der letzte Stand dieser Datei und ein
   zweites Hochladen unschädlich. Die Pfadliste im Chat bleibt trotzdem (für Löschungen und zum
   Gegenprüfen).
6. Muss eine Datei **gelöscht** werden, das explizit dazuschreiben („außerdem auf GitHub
   löschen: …") – Löschungen funktionieren nicht per Drag & Drop.
7. **Die Doku läuft in jeder Runde mit** – nicht nur die Fachdatei (`docs/lager.md` usw.),
   sondern auch die Übersichten: „Stand"-Zeilen in `README.md`, `docs/README.md` und hier,
   Repo-Struktur und Migrationsstand in `docs/architektur.md`, Gesamtzahl im
   Konstanten-Register (`docs/README.md`, „Wie diese Doku gepflegt wird", Punkt 4). Am
   01.10.2026 waren sie zwei Wochen zurück, weil das unterblieben war.
8. **Echte Kundendaten gehören nicht ins Repository.** Skripte, die reale Bestandsdaten
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
- **„Alle Daten löschen“ (Migration 72) leert JEDE Tabelle in `public`**, außer denen in
  `alle_daten_behalten()` (Profile, Rechte, Einstellungen, Push-Geräte). Eine neue Tabelle wird
  also automatisch mitgelöscht – richtig für Fachdaten. Soll eine neue EINSTELLUNGS-Tabelle das
  Löschen überstehen, kommt sie mit einer neuen Migration in diese Liste.

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

- **Eine neue Funktion ist erst fertig, wenn der Weg dorthin begehbar ist.** Die Laufkundschaft
  war vollständig gebaut – Migration, Trigger, Zustand, Auswertung, Tests – und trotzdem nicht
  benutzbar: Das Anlegeformular verlangt eine Adresse, die dieser Kunde nicht hat. Beim Bauen
  einer Ausnahme immer den ERSTEN Schritt mitgehen, nicht nur den Zustand danach.
- **Eine Regel, die in der Datenbank UND in der Oberfläche steht, gehört an beiden Stellen
  kommentiert – mit Verweis aufeinander.** Beispiel: die Laufkundschafts-Ausnahme in
  `pruefe_rechnungsdaten()` (Migration 53) und in `rechnungsdatenMaengel()`. Die Oberfläche darf
  die Datenbank nicht widerlegen, ersetzt sie aber auch nicht; wer eine Stelle ändert, muss
  beide ändern.
- **Ein neues Pflichtfeld im Typ `Customer` bricht jeden Testaufbau, der ihn von Hand baut.**
  `tsc` findet das zuverlässig – aber erst nach dem Kopieren aller Dateien. Beim Erweitern eines
  zentralen Typs gleich mit `grep` nach den Testgerüsten suchen.
- **`matchMedia("(hover: hover) and (pointer: fine)")` ist NICHT die Frage „Rechner oder
  Handy".** Auf dem Arbeitsnotebook (Windows mit Touchscreen) liefert sie `false`, obwohl eine
  Maus angeschlossen ist – gemessen am 22.09.2026 in der Konsole, nachdem der neue
  Menüeintrag „nie erschien". Wer wirklich die Geräteart braucht, liest die Kennung
  (`istHandy` in `lib/helpers.ts`): Handys sind eine kurze bekannte Liste, alles andere ist
  ein Rechner. Und: Eine solche Weiche gehört in eine geprüfte Funktion, nicht als Einzeiler
  in die Komponente.
- **Die Fassungsnummer im Service Worker beweist nur, dass `public/sw.js` angekommen ist.**
  Sie sagt nichts darüber, ob `app/page.tsx` oder eine neue Komponente mit hochgeladen wurde.
  Bei „neue Fassung läuft, Funktion fehlt trotzdem" zuerst im ausgelieferten Programm nach
  einer Zeichenkette aus dem neuen Code suchen, statt die Logik zu verdächtigen.
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
- **Für Etiketten druckt das iPhone eine Webseite nicht in Etikettengröße.** Safari legt die
  Seite in Bildschirmbreite an, verkleinert sie aufs Papier und setzt Adresse, Datum und
  „Seite 1 von 1“ darunter – `@page` hilft dagegen nicht. Ein PDF in genau der Etikettengröße
  druckt es dagegen 1:1 und ohne Fußzeile (Brother-Test 02.10.2026, `lib/etikettPdf.ts`).
  AirPrint findet den Drucker dabei nur über WLAN (Wireless Direct), nicht über Bluetooth.
- **Der Flex-Spalten-Trick** („Kopf bleibt stehen, Tabelle scrollt für sich",
  `flex:1; min-height:0`) trägt nur, solange über der Tabelle nichts wachsen kann. Sobald
  dort etwas mitwächst (Monatskalender), scrollt die Seite gar nicht mehr.
- **Kein Postgres-Sequence für lückenlose Nummern.** Eine Sequence zählt beim Abbruch
  weiter und reißt eine Lücke. Die nächste Rechnungsnummer steht in
  `betrieb.rechnung_naechste_nummer` und wird in derselben Transaktion `for update` gesperrt.
- **Testkunden haben negative Nummern** (Migration 60): Aufträge `order_number < 0` („T1"),
  Rechnungen `nummer < 0` („T-RE1"). Jede neue Anzeige einer Auftragsnummer läuft über
  `auftragsNr()` (lib/testkunde.ts), jede neue Auswertung, Summe oder jeder Export filtert
  Testdaten heraus (`ohneTestauftraege`/`ohneTestrechnungen`/`ohneTestkunden`).
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
  bleibt der alte Service Worker aktiv und die Änderung kommt am Gerät nie an. **Seit v78
  gehören drei Stellen zusammen:** `FASSUNG` in `public/sw.js`, `APP_VERSION` in
  `lib/version.ts` und ein neuer Eintrag ganz oben in `NEUIGKEITEN` (dieselbe Datei) – für
  das Büro geschrieben, nicht für Entwickler. `tests/version.test.ts` bricht, wenn eine fehlt.
- **Fensterfunktionen brauchen die richtige Partition.** Zwei Zeilen mit demselben Wert
  sind nicht dasselbe wie eine mehrdeutige Zeile; dafür eine eigene Identitätsspalte
  mitführen.
- **In PL/pgSQL kollidieren Variablennamen mit Spaltennamen.** Schleifenvariablen anders
  benennen als die Spalten, die sie lesen.
- **Eine Prüfregel auf einer Zeile, die ein anderer Trigger selbst weiterschreibt, muss diesen
  Fall erkennen.** Migration 55 prüft, dass `betrieb.rechnung_naechste_nummer` nur „höchste
  vergebene plus eins" sein darf. Beim Ausstellen zählt aber `vergib_rechnungsnummer()` genau
  diese Zahl hoch – BEVOR die neue Rechnung als Zeile existiert. Ohne Ausnahme hätte die Regel
  jede Rechnung verhindert. Erkennungsmerkmal: `pg_trigger_depth() > 1` (Aufruf aus einem
  Trigger heraus). Nachgewiesen im lokalen Test, der nach dem Verstellen des Zählers auch eine
  zweite Rechnung ausstellt – ein Test, der nur den Zähler verstellt, hätte die Falle nie gezeigt.
- **Ein Löschen, das Datenschutz herstellen soll, erzeugt selbst Protokoll.** Die Protokoll-
  Trigger schreiben beim DELETE die ganze Zeile mit – also genau das, was verschwinden soll.
  `kunde_endgueltig_loeschen()` (Migration 56) räumt deshalb NACH dem Löschen auch diese frischen
  Einträge ab und hinterlässt einen einzigen ohne Personenbezug.
- **Die Permissions-Policy in `next.config.mjs` sperrt Browser-Funktionen, bevor der Nutzer
  gefragt wird.** Mit `camera=()` scheiterte der QR-Scanner an „Kein Zugriff auf die Kamera",
  mit `geolocation=()` der Standortknopf der Karte (gefunden 26.09.2026). Wer eine
  Gerätefunktion einbaut, prüft zuerst diese Zeile – `(self)` erlaubt sie der eigenen Seite.
- **Die CSP sperrt auch Bilder.** `img-src` nannte bis v105 nur Kartenkacheln; die Fotos am Auftrag
  (E3) kommen als Links von `…supabase.co` und wären ohne Eintrag leer geblieben – `connect-src`
  deckt nur `fetch`, nicht `<img>`. Wer Bilder von einem neuen Host zeigt, trägt ihn ein. Die CSP
  steht seit v106 in `lib/csp.ts` (gesetzt von `proxy.ts`), nicht mehr in `next.config.mjs`.
- **Seit v106 gilt die CSP mit Nonce (B4): kein Inline-Skript, kein `onclick="…"`, kein
  `javascript:`.** Auch nicht in `public/offline.html` – deren „Erneut versuchen" ist deshalb ein
  Link. React-Handler (`onClick={…}`) sind nicht betroffen. Eine Seite, die beim Bauen vorgefertigt
  wird, kennt die Nonce nicht und bleibt weiß – deshalb `dynamic = "force-dynamic"` in
  `app/layout.tsx`; nicht entfernen. Geprüft wird das nur im Produktionsbau (`next build` +
  `next start`), `next dev` erlaubt mehr.
- **Dateien in Supabase Storage löscht kein SQL** (Migration 65). Eine Zeile mit Pfad geht per
  Kaskade mit, die Datei bleibt. Wer etwas mit Bildern löscht, sammelt vorher die Pfade und
  entfernt die Dateien über die Storage-Schnittstelle (`lib/api/belege.ts`, Papierkorb).
- **Ein Fenster, das in `app/page.tsx` steht, aber aus dem Auftragsfenster heraus geöffnet wird,
  braucht eine eigene Ebene über dessen `z-index: 10001`.** Das Satz-Etikett hatte keine (10000)
  und stand im Code vor dem Auftragsfenster – am Handy lag es unsichtbar dahinter und erschien
  erst nach dem Schließen des Auftrags (04.10.2026, v108). Die Leiter: Auftrag 10001,
  Bestätigung/Stapel/Auslagern 10002, Rechnung/Blätter 10003, Foto/Unterschrift/Etikett 10004.
  Geprüft wird mit `document.elementFromPoint` in der Mitte des Bildschirms, nicht durch Hinsehen
  am Rechner – dort ist das Auftragsfenster schmaler, und das Fenster dahinter lugt hervor.
- **Bedienelemente im Kartencontainer brauchen `kartenFlaecheSperren`** (app/page.tsx), sonst
  zieht ein Wischen darüber die Karte mit und ein Tipp zählt als Kartenklick. Darin nur
  `onClick` – `mousedown`/`pointerdown` erreichen React dort nicht.
- **Auf großen Monitoren ist die ganze Seite gezoomt** (`html{zoom:var(--z)}`, v83, siehe
  `docs/design-system.md` „Desktop-Skalierung"). Jede neue Höhe in `vh` als
  `calc(… / var(--z))`, jede Lage aus `getBoundingClientRect` für ein festes Element durch den
  Zoom teilen (`menuLage`), jede Umrechnung Mausposition → Größe über `massstab()`.
- **Eine Druck-Ausblenderegel aus Klassen verliert gegen eine ID-Regel.** `#iconNav{display:flex}`
  schlug `body:has(.druck-fenster) *:not(…){display:none}` – die Seitenleiste blieb im Druck
  unsichtbar, aber 28 px hoch im Seitenaufbau, und jedes 80- oder 100-mm-Etikett rutschte auf
  Seite 2: Jeder Druck begann mit einem leeren Etikett. Gefunden erst beim Seitenzählen im PDF
  (30.09.2026). Die Regel trägt jetzt `!important`.
- **Ein Zwischenspeicher ist nur so frisch wie die Stelle, die ihn verwirft.** Fahrzeuge liegen
  je Kunde UND gesamt im Speicher; nach dem Anlegen wurde nur der des im Kundentab gewählten
  Kunden neu geladen – im Auftragsfenster fehlte das neue Auto (29.09.2026). Wer etwas anlegt,
  verwirft alle Speicher, die es zeigen (`refreshVehicles`, seit v113 in `app/_seite/useFahrzeugAktionen.ts`).
- **In einem Fenster mit Speichern-Knopf darf ein Umschalter nicht selbst speichern.** „Je Rad
  messen" im Lagerfenster schrieb sofort in die Datenbank und löschte damit den Satzwert – wer
  nur nachsehen wollte und mit ✕ schloss, hatte ihn verloren (02.10.2026, v98). Wer etwas
  löscht, das der Nutzer nicht bestätigt hat, braucht einen sehr guten Grund; hier half nur das
  Protokoll (`audit_log`) beim Zurückholen.
- **Ein neuer Schreibweg am Auftrag oder an der Radmessung geht durch `offlineOderDirekt()`**
  (app/page.tsx, seit v101; die Hooks unter `app/_seite/` bekommen sie im Kontext). Wer einen
  Supabase-Aufruf daran vorbei direkt schreibt, hat eine
  Handlung, die ohne Netz still scheitert – genau das, was der Ausgangskorb abstellt. Gehört die
  Handlung bewusst NICHT offline (abschließen, ein-/auslagern …), bleibt sie direkt; die zentrale
  Meldung sagt dann „geht nur mit Netz".
- **Im Playwright-Prüfaufbau übernimmt beim ersten Aufruf der Service Worker und lädt neu**
  (`PwaBereit`, `controllerchange`). Ein Aufruf mit `?lagerplatz=`/`?reifen=` ist danach schon
  bereinigt und schien „nicht zu wirken" (02.10.2026, v103). Seit v106 übersteht der Sprung das
  Neuladen (`lib/sprungMerker.ts`, D19); wer nur den Sprung selbst prüfen will, öffnet den Kontext
  weiter mit `serviceWorkers: "block"`.
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
- Keine echten Kundendaten im Repository und keine im Chat (siehe Regel 1.8).
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
  Kalender, Lagerdauer, Aufkleber-Codes); seit v106 auch Komponententests (`*.test.tsx`, Testing
  Library in jsdom, Kopfzeile `// @vitest-environment jsdom`).
- **TanStack Query** als Zwischenspeicher aller Datenabfragen (`lib/queries/`,
  `app/providers.tsx`), mit `idb-keyval` als Offline-Lesespeicher.
- **`app/page.tsx` und `app/_seite/`** (seit v113): Neue Handlungen eines Bereichs gehören in
  einen Hook unter `app/_seite/` (Vorbild `useLagerAktionen`, `useFahrzeugAktionen`), nicht
  zusätzlich in `HomePage`. Der Hook bekommt einen Kontext und wird vor dem ersten `return`
  aufgerufen; was er zurückgibt, gibt es erst ab dieser Zeile.

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
| Welcher Etikettendrucker, wie wird gedruckt? | `docs/lager.md` („Brother QL-820NWBc", „Zwei Wege aufs Papier"), `docs/prompt-etikettendrucker.md` |
