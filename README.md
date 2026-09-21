# Viana PinPoints

Web-Anwendung für den mobilen Reifenservice: Kunden und Karte, Aufträge und
Einsatzplanung, Reifeneinlagerung, Artikelstammdaten und Rechnungsstellung – bedienbar
am Rechner im Büro und am Handy beim Kunden.

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Supabase (Postgres, Auth, RLS)
· Vercel · Leaflet · TanStack Query · Vitest

Stand: 18.09.2026, Migrationen bis 50, Service Worker `v49`.

---

## Für Entwickler: wo anfangen

| Ich will wissen … | … dann lies |
|---|---|
| wie hier gearbeitet und ausgeliefert wird | `CLAUDE.md` |
| wie der Code aufgebaut ist | `docs/architektur.md` |
| wie ein einzelnes Modul funktioniert | `docs/README.md` (Übersicht) |
| was noch offen ist | `docs/fahrplan.md` |
| was die Datenbank kann | `supabase/migrations/README.md` |

## Lokale Entwicklung

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run dev
```

Prüfläufe vor jeder Auslieferung:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

## Umgebungsvariablen

| Variable | Zweck |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase-Projekt |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | öffentlicher Schlüssel für den Browser |
| `SUPABASE_SERVICE_ROLE_KEY` | nur serverseitig (Einladungen, Push-Versand) – in Vercel als *Sensitive* markieren |
| `ADMIN_EMAIL` | Adresse, die beim ersten Anlegen Adminrechte bekommt |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web-Push (Terminerinnerung) |
| `PUSH_GEHEIMNIS` | schützt die Versandroute gegen fremde Aufrufe |

Die drei letzten Gruppen gehören ausschließlich in die Vercel-Projekteinstellungen.
Sie stehen in keiner Datei dieses Repos und in keiner Dokumentation.

## Aufbau

```
app/                    Next.js App Router
  page.tsx              Hauptanwendung (Karte, Kunden, Aufträge, Lager, Auswertung, Einstellungen)
  api/                  Serverrouten: invite, geocode, adresse-suchen, push/*
  admin/                Nutzerverwaltung und Einladungen
  auth/                 Einladungslink und Passwort setzen
  providers.tsx         TanStack Query inkl. Offline-Lesespeicher (idb-keyval)
  globals.css           gesamtes Designsystem
components/             fachlich geschnittene Bausteine
  auftraege/ einsatzplanung/ kunden/ lager/ rechnungen/ admin/ auswertung/
lib/
  api/                  alle Datenbankzugriffe, ein Modul je Datei
  queries/              Abfrageschlüssel und Hooks
  types.ts              Datentypen
  constants.ts          zentrale Wertelisten (siehe Konstanten-Regel)
  helpers.ts            reine Hilfsfunktionen
  rechnung.ts           Rechnungslogik (Positionen, Summen, Girocode)
public/sw.js            Service Worker – Konstante FASSUNG bei jeder Auslieferung hochzählen
supabase/migrations/    durchnummerierte Migrationen + rollback/
tests/                  Vitest, reine Rechenfunktionen
docs/                   Detail-Dokumentation
proxy.ts                erzwingt Login (hieß bis Next.js 16 middleware.ts)
```

## Betrieb

- Deployment erfolgt automatisch bei jedem Commit auf `main`.
- Migrationen werden **von Hand** im Supabase-SQL-Editor ausgeführt, in der Reihenfolge
  ihrer Nummer. `supabase/migrations/README.md` führt Buch darüber, was schon gelaufen ist
  und was noch aussteht.
- Anmeldung nur per Einladung; ein öffentliches Registrierungsformular gibt es nicht.
- Datenverarbeitung in der EU-Region (Supabase Frankfurt). Die AVV mit Supabase und Vercel
  ist abgeschlossen; echte Kundendaten sind zulässig.
