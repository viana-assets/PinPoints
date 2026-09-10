# Viana PinPoints — Web-App (Next.js + Supabase + Vercel)

Diese App portiert das lokale Kundenkarten-Tool in eine gehostete Web-App mit
gemeinsamer Datenbank für mehrere Nutzer, Login per Einladungslink (kein
offenes Self-Signup) und einem Admin-Account.

**Build-Status:** `npm install`, `npx tsc --noEmit` und `npm run build`
wurden in dieser Session erfolgreich durchlaufen — keine Typ- oder
Build-Fehler. Next.js wurde außerdem auf `14.2.35` angehoben, da `14.2.5`
mehrere bekannte Sicherheitslücken hatte (siehe `npm audit`).

## ⚠️ Wichtiger Hinweis zu Datenschutz/Compliance

Bevor echte Kundendaten in dieses System einfließen, fehlt laut unserem
Gespräch noch die **Auftragsverarbeitungsvereinbarung (AVV) mit Vercel und
Supabase** (Art. 28 DSGVO). IT und der Datenschutzbeauftragte haben den
Aufbau grundsätzlich freigegeben, aber ohne AVV sollten hier vorerst nur
Testdaten verarbeitet werden. Bitte AVV mit beiden Anbietern abschließen
(bei Supabase im Dashboard unter "Legal Documents", bei Vercel über den
Support/Data Processing Addendum) und wenn möglich eine EU-Region wählen
(Supabase: Frankfurt/eu-central-1; Vercel: Frankfurt-Region für Functions,
sofern konfigurierbar).

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein neues Projekt erstellen,
   Region **Frankfurt (eu-central-1)** wählen.
2. Im SQL-Editor den Inhalt von `supabase/schema.sql` ausführen. Das legt
   alle Tabellen (`profiles`, `customers`, `appointments`,
   `contact_history`, `user_settings`), RLS-Policies und den Trigger an, der
   bei jedem neuen User automatisch ein `profiles`-Eintrag erzeugt.
3. Unter **Authentication → Providers** sicherstellen, dass **"Enable email
   signup"** deaktiviert ist (kein öffentliches Self-Signup). Einladungen
   laufen ausschließlich über die Admin-Route in der App.
4. Unter **Authentication → URL Configuration** die Vercel-Domain als
   "Site URL" und `https://<deine-domain>/auth/callback` als zusätzliche
   Redirect-URL eintragen (nach Schritt 3 unten aktualisieren, falls die
   Domain noch nicht feststeht).
5. Unter **Settings → API** die drei Werte `Project URL`, `anon public key`
   und `service_role key` notieren.

### Admin-Rechte für vitali.hermann@outlook.com

Der Trigger in `schema.sql` versucht automatisch, den Admin anhand von
`current_setting('app.admin_email')` zu erkennen. Da diese Einstellung im
gehosteten Supabase-Projekt nicht ohne Weiteres gesetzt werden kann, gilt
als verlässlicher Weg:

1. Lade zuerst dich selbst über die Admin-Einladungsroute ein (siehe unten,
   Schritt "Ersten Admin anlegen").
2. Nach dem ersten Login im SQL-Editor ausführen:

   ```sql
   update public.profiles set role = 'admin'
   where email = 'vitali.hermann@outlook.com';
   ```

## 2. GitHub-Repository

1. Dieses Projekt in ein neues GitHub-Repository pushen (privat empfohlen).
2. `.env.local` wird nie committet (steht in `.gitignore`).

## 3. Vercel-Deployment

1. Auf [vercel.com](https://vercel.com) ein neues Projekt aus dem
   GitHub-Repo importieren.
2. Unter **Settings → Environment Variables** setzen:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` → als **Sensitive** markieren (nur
     serverseitig, nie im Client-Bundle)
   - `ADMIN_EMAIL=vitali.hermann@outlook.com`
3. Deploy starten. Vercel vergibt eine `*.vercel.app`-Domain (optional
   später eine eigene Domain verbinden).
4. Danach in Supabase unter **Authentication → URL Configuration** die
   echte Vercel-Domain als Redirect-URL nachtragen
   (`https://<domain>/auth/callback`).

## 4. Ersten Admin anlegen

Da es keine offene Registrierung gibt, muss der allererste Nutzer über die
Supabase-Konsole eingeladen werden (die App selbst kann noch niemanden
einladen, solange kein Admin existiert):

1. Im Supabase-Dashboard unter **Authentication → Users → Invite user**
   die Adresse `vitali.hermann@outlook.com` eintragen. Das verschickt die
   gleiche Einladungs-Mail wie später die Admin-Route in der App.
2. Den Link in der Mail öffnen → landet auf `/auth/callback` → dann
   `/auth/set-password`, dort ein Passwort setzen.
3. Anschließend die SQL-Anweisung aus Schritt "Admin-Rechte" oben
   ausführen, damit `role = 'admin'` gesetzt ist.
4. Ab jetzt kann sich der Admin unter **Einstellungen → Nutzer einladen**
   (`/admin/invite`) selbst weitere Kollegen einladen — ganz ohne
   Supabase-Dashboard.

## 5. Lokale Entwicklung

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run dev
```

## Funktionsumfang (Web-Version)

- Kartenansicht mit Leaflet, 5 Kartenstile (Straße/Hell/Dunkel/Satellit/
  Satellit mit Beschriftung), auswählbar in den Einstellungen.
- Kunden anlegen/bearbeiten/löschen, Geocoding über Nominatim.
- Kontaktstatus (rot/grün) mit konfigurierbarem Zeitraum (Standard 3 Monate).
- Termine je Kunde (Datum + Uhrzeit + Freitext), Termine-Tab mit
  "nur anstehende"-Filter, vergangene Termine verschwinden automatisch.
- Anruf-Icon (Mobil/Festnetz-Auswahl bei mehreren Nummern).
- Kunden deaktivieren/reaktivieren, eigener "Inaktiv"-Tab.
- Light/Dark-Theme, responsives Layout für Mobilgeräte.
- Gemeinsame Datenbank für alle eingeladenen Nutzer (RLS-geschützt), nur
  Ansicht-Einstellungen (Theme, Kartenstil, Zeitraum) sind pro Nutzer.
- Invite-only Login: kein öffentliches Registrierungsformular, Einladungen
  ausschließlich durch Admins über `/admin/invite`.

## Noch nicht portiert (aus dem lokalen HTML-Tool)

Diese Funktionen aus der ursprünglichen HTML-Version sind in der Web-App
noch **nicht** enthalten und könnten bei Bedarf nachgezogen werden:

- CSV-Bulk-Import mit gedrosselter Geocoding-Warteschlange
  (~1 Anfrage/Sekunde wegen Nominatim-Nutzungsrichtlinie).
- JSON-Backup-Export/Import.
- CSV-Export.

## Projektstruktur

```
app/                  Next.js App Router Seiten & Routen
  page.tsx            Hauptanwendung (Karte, Liste, Termine, Inaktiv, Einstellungen)
  login/              Login-Seite
  auth/callback/      Einladungslink-Verarbeitung
  auth/set-password/  Passwort setzen nach Einladung
  admin/invite/       Admin-UI zum Einladen neuer Nutzer
  api/invite/         Server-Route, die Einladungen versendet (service role)
lib/                  Supabase-Clients, Typen, Hilfsfunktionen, Kartenstile
proxy.ts              Erzwingt Login auf allen Seiten außer /login, /auth* und
                      api/push/senden (hieß bis Next.js 16 middleware.ts)
supabase/schema.sql   Datenbankschema inkl. RLS-Policies und Trigger
```
