# Viana PinPoints – Projektanweisung für Claude

Diese Datei ist die Standard-Instruktion für jede Claude-Session, die an diesem
Repo arbeitet. Vor Beginn der Arbeit lesen und befolgen.

Detail-Dokumentation zu einzelnen Bausteinen (Architektur, Design-System, Module,
Konstanten-Register, Roadmap) liegt in `docs/` – siehe `docs/README.md` für die
Übersicht und die Konstanten-Regel. Diese Datei hier bleibt bewusst schlank: nur
Prozessregeln + Tech-Stack-Kurzüberblick + Verweis dorthin.

## Wer arbeitet hier wie

Vitali Hermann (Samhammer AG) hat **keinen Terminal- und keinen Git-Zugriff**.
Er arbeitet ausschließlich über die Browser-Oberflächen von GitHub und Supabase:

- Code-Änderungen zieht er per Drag & Drop einzelner Dateien in die GitHub-Weboberfläche
  (Repo: `viana-assets/PinPoints`, Ordner `viana-pinpoints/`).
- Löschungen macht er manuell über den Papierkorb-Button auf der jeweiligen
  GitHub-Dateiseite ("Delete this file" → "Commit directly to the main branch").
- Datenbank-Änderungen (SQL) führt er manuell im Supabase SQL-Editor aus.
- Deployment läuft automatisch über Vercel bei jedem Commit auf `main`.

**Daraus folgt für Claude:**

1. Jede Code-Änderung wird direkt in den mit dem Gerät verbundenen OneDrive-Ordner
   geschrieben:
   `C:\Users\vhermann\OneDrive - Samhammer AG\Claude\Viana Plattforms\PinPoints\viana-pinpoints\`
2. **Nie** den Dateiinhalt im Chat ausgeben oder als Dateikarte erneut anhängen.
   Vitali lädt nichts herunter – die Datei liegt ja schon im Ordner. Ausdrücklicher
   Wunsch von Vitali (26.08.2026): er will die Datei-Vorschaukarten im Chat gar
   nicht erst sehen, auch nicht kurz – nur den Ordner/die Datei aktualisiert
   bekommen und danach die reine Pfadliste. Technischer Hinweis für Claude: das
   Schreiben in den verbundenen OneDrive-Ordner läuft über `SendUserFile` (liefert
   die `file_uuid`) gefolgt von `device_commit_files` – der erste Schritt erzeugt
   zwangsläufig eine Dateikarte im Chatverlauf, das lässt sich technisch nicht
   umgehen. Diese Karte aber **nie kommentieren, nie ankündigen, nie als
   "ich sende dir jetzt..." einleiten** – einfach die Werkzeuge nacheinander
   aufrufen und erst zur fertigen Pfadliste wieder Text schreiben.
3. Nach jeder Code-Änderung **ausschließlich** eine schlichte Liste der geänderten
   Repo-relativen Pfade zurückgeben, untereinander, ohne weitere Erklärung des
   Zustellwegs. Format genau so:

   ```
   app/globals.css
   app/layout.tsx
   app/page.tsx
   lib/types.ts
   supabase/schema.sql
   ```

   Kein Fließtext dazwischen, keine Bullet Points, keine zusätzliche
   "das habe ich geändert, weil..."-Erklärung – nur die reine Pfadliste, damit
   er sie in einem Rutsch per Drag & Drop in GitHub ziehen kann. Gilt für
   Code-/Konfigurations-/Migrationsänderungen; bei reinen Rückfragen, Analysen oder
   Roadmap-Antworten (wie dieser Doku-Umstrukturierung) normal antworten.
4. Muss eine Datei manuell gelöscht werden (z. B. bei einer Umbenennung/Route-Konflikt),
   das explizit dazuschreiben ("außerdem auf GitHub löschen: app/auth/callback/route.ts"),
   da Löschungen nicht per Drag & Drop funktionieren.
5. Erfordert eine Änderung eine SQL-Migration gegen die *bereits laufende*
   Supabase-Datenbank: **immer eine neue, durchnummerierte Datei** unter
   `supabase/migrations/` anlegen, nie eine bestehende Migrationsdatei überschreiben
   oder rückwirkend ändern – sonst verliert Vitali den Überblick, was in Supabase
   schon ausgeführt wurde und was noch aussteht. `supabase/migrations/README.md` als
   Liste mit "Bereits ausgeführt" / "Noch auszuführen" bei jeder neuen Migration
   mitpflegen. Zusätzlich im Chat kurz sagen, welche neue Datei im Supabase
   SQL-Editor ausgeführt werden muss.
   - **Rücknahme-Skript dazulegen** unter `supabase/migrations/rollback/<nr>_rollback.sql`
     (Wunsch von Vitali, 28.08.2026): er hat keinen Terminal-Zugriff und kann eine
     misslungene Migration sonst nicht rückgängig machen.
   - **`insert` in Migrationen immer absichern** (`on conflict do nothing` oder
     `where not exists`), damit ein versehentlicher zweiter Lauf keine Daten dupliziert –
     genau das würden die Migrationen 07 und 12 heute tun.
   - **Neues Modul = neue Tabelle = eigene RLS-Policies**, die
     `public.has_module_permission('view.<modul>')` bzw. `('action.<modul>.<x>')` abfragen,
     plus die passende Zeile in `PERMISSION_CATALOG`/`PERMISSION_DEFAULTS`
     (`lib/constants.ts`). Nie `for all using (auth.role() = 'authenticated')` – das war
     genau die Lücke, die Migration 16 geschlossen hat. Siehe
     `docs/berechtigungen-und-rollen.md`.
   - **Und auf der Code-Seite dazu**: Abfragen in `lib/api/<modul>.ts`, ein Schlüssel in
     `lib/queries/keys.ts`, ein Hook in `lib/queries/hooks.ts` mit `aktiv`-Schalter (lädt nur,
     wenn das Modul offen ist), und nach jeder Änderung `neuLaden(qk.<modul>())`. Nie eine
     ganze Tabelle beim App-Start laden – siehe `docs/architektur.md`, Abschnitt „Datenladen".
6. Jede Code-Auslieferung vor dem Versenden verifizieren: `npx tsc --noEmit`,
   `npm run lint`, `npm test` und `npm run build` (mit Platzhalter-`.env.local`, danach
   `.next`/`.env.local` wieder löschen). Hinweis aus der Sitzung vom 28.08.2026: der
   Next-Build lässt sich in der lokalen Sandbox des Rechners nicht ausführen (der
   Build-Worker stirbt mit SIGBUS) – dort funktionieren `tsc`, `lint` und `vitest`, für
   `npm run build` in die Cloud-Umgebung ausweichen.
7. **Echtdaten sind zulässig.** Die AVV/DPA-Frage mit Vercel und Supabase ist am 04.09.2026
   geklärt; die frühere Beschränkung auf Testdaten ist damit aufgehoben und braucht bei
   Datenskripten nicht mehr erfragt zu werden. Was bleibt, ist der normale Umgang mit
   personenbezogenen Daten: keine Kundendaten in Protokolle oder Fehlermeldungen, keine
   Adressen an Dritte außerhalb der eigenen, gedrosselten Geocode-Route (siehe
   `docs/kunden-und-karte.md`), und irreversible Massenänderungen nur mit vorheriger Sicherung.
8. **Konstanten-Regel** (siehe `docs/README.md`/`docs/konstanten-register.md`): ein
   fester Wertebereich wird genau einmal zentral benannt und überall per Name
   referenziert, nie als literaler Wert ein zweites Mal hingeschrieben. Bei neuen
   Konstanten im Register nachtragen.

## Tech-Stack (Kurzüberblick – Details in `docs/architektur.md`)

- **Next.js 16** (App Router), React 19, TypeScript im `strict`-Modus, Client Components für die
  Hauptlogik.
- **Supabase**: Postgres + Auth (Invite-only, kein öffentliches Signup) + RLS. Die RLS setzt
  seit Migration 16 die Modul-Berechtigungen durch, nicht nur die Oberfläche.
- **Leaflet** als npm-Paket (nicht mehr per CDN), eigener Kartenstil-Schalter.
- **Vercel** Hosting, automatisches Deployment bei jedem Commit auf `main`.
- **CI**: `.github/workflows/typecheck.yml` läuft bei jedem Push/PR auf `main`
  (`tsc --noEmit`, `eslint .`, `vitest run`, `next build`) – zusätzlich zur Verifikation in
  der Claude-Session selbst.
- **Tests**: Vitest unter `tests/`, nur für die reinen Rechenfunktionen (Preise, Rabatte,
  Kalenderwochen, Lagerplatz-Nummerierung).
- **TanStack Query** als Zwischenspeicher aller Datenabfragen (`lib/queries/`,
  `app/providers.tsx`): jeder Bestand lädt, wenn er gebraucht wird, und wird nach einer
  Änderung gezielt für ungültig erklärt – nicht mehr tabellenweise neu geladen.

## Wo was steht

| Frage | Antwort in |
|---|---|
| Wie ist der Code strukturiert, welche Konventionen gelten? | `docs/architektur.md` |
| Wie sieht das Design-System aus, wie die Navigation? | `docs/design-system.md` |
| Welche festen Wertelisten gibt es, wo sind sie definiert? | `docs/konstanten-register.md` |
| Wie funktionieren Rollen/Modul-Berechtigungen? | `docs/berechtigungen-und-rollen.md` |
| Wie funktionieren Kunden-Tab und Karte? | `docs/kunden-und-karte.md` |
| Wie funktionieren Aufträge/Termine/Einsatzplanung? | `docs/auftraege-termine-einsatzplanung.md` |
| Wie funktioniert das Lager-Modul? | `docs/lager.md` |
| Wie funktionieren Artikelstammdaten/Leistungen? | `docs/artikelstammdaten.md` |
| Was ist als Nächstes dran, was ist noch offen? | `docs/roadmap.md` |
| Welche Schwachstellen wurden am 28.08.2026 gefunden? | `docs/architektur-review-2026-08.md` |
