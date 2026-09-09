# Berechtigungen und Rollen

## Rollen

`superadmin` / `admin` / `techniker` / `user` (Spalte `profiles.role`, Constraint in
Migration 05).

- **Superadmin** ist der ursprüngliche einzelne Admin-Account, kann alles was Admin kann,
  plus: sieht in der Nutzerverwaltung alle Accounts (Rolle änderbar) und darf die Rolle
  Superadmin selbst vergeben.
- **Admin** darf Nutzer einladen (inkl. Rollenwahl Nutzer/Techniker/Admin, aber nicht
  Superadmin), sieht aber keine Nutzerliste. Darf laut aktueller Governance-Entscheidung
  auch Artikelstammdaten/Preise pflegen (siehe `artikelstammdaten.md`).
- **Techniker** hat seit Phase 4 echte, per RLS erzwungene Rechte: sieht nur Aufträge, denen
  der verknüpfte Mitarbeiter-Datensatz zugeordnet ist, darf daran ausschließlich Status und
  Techniker-Notiz ändern, keine Aufträge anlegen oder löschen und keine Kunden-Stammdaten
  pflegen (Migration 13, gehärtet in 15 – siehe unten).
- **Nutzer** ("user") ist die Standardrolle ohne besondere Rechte.

Anzeigenamen zentral in `ROLE_LABEL` (siehe `konstanten-register.md`).

## Modul-Berechtigungen / Modulverwaltung

Migrationen 09+10+16, Tabelle `module_permissions` (flacher Schlüssel `module_key text primary
key` + `edit_roles text[]`). Steuert zwei Dinge pro Rolle (Admin/Techniker/Nutzer –
Superadmin darf immer alles, egal was in der Tabelle steht, Sicherheitsnetz, deshalb keine
eigene Spalte):

1. **Sichtbarkeit** eines ganzen Moduls (Schlüssel `"view.<modul>"`, z. B.
   `"view.einstellungen"`, `"view.lager"` …) – bestimmt, ob Nav-Punkt, Dashboard-Kachel,
   "Weitere"-Kachel und der Tab-Inhalt selbst überhaupt angezeigt werden.
2. **Aktionen innerhalb eines Moduls** (Schlüssel `"action.<modul>.<aktion>"`, aktuell nur
   beim Lager: `tire_assign`, `slot_create`, `slot_delete`, `warehouse_create`,
   `warehouse_edit`, `warehouse_delete`) – feiner als die reine Sichtbarkeit, z. B. darf ein
   Techniker Reifen einem Lagerplatz zuordnen, aber kein Lager anlegen/löschen.

In `app/page.tsx`: `PERMISSION_CATALOG` (die vollständige Zeilenliste inkl. eingerückter
Modulbestandteile, mit `locked: true` für Dashboard – immer sichtbar, nicht abwählbar) und
`PERMISSION_DEFAULTS` (eingebauter Fallback, falls ein Schlüssel noch nicht in der Datenbank
steht) sind der Single-Source-of-Truth für die Matrix. `PERMISSION_ROLES` listet die drei
konfigurierbaren Rollen. State/Datenfluss: `modulePermissions`-State,
`refreshModulePermissions()`/`updateModulePermissions(key, roles)`. Helfer `hasPermission(key)`
(Superadmin-Bypass eingebaut) und `canView(modul)` (= `hasPermission("view." + modul)`) gaten
Nav-Punkte, Dashboard-/"Weitere"-Kacheln und Tab-Inhalte. `LagerPanel` bekommt statt eines
einzelnen `canEdit`-Booleans sechs granulare Boolean-Props
(`canCreateWarehouse`/`canEditWarehouse`/`canDeleteWarehouse`/`canCreateSlot`/`canDeleteSlot`/
`canAssignTire`), die einzeln verdrahtet sind (inkl. Sperren des Lagerplatz-Klicks, wenn
`canAssignTire` false ist).

**Weitere Module/Aktionen anschließen**: `PERMISSION_CATALOG`/`PERMISSION_DEFAULTS` um neue
Zeilen ergänzen und die jeweilige Stelle in der UI mit `hasPermission(...)`/`canView(...)`
verdrahten.

UI dafür: **Admin-Bereich mit drei Reitern** (`AdminPanel` in `app/page.tsx`, State
`adminTab: "users" | "modules" | "artikel"`):

- **"Nutzerverwaltung"**: Einladen, Mitarbeiter-Stammdaten, Rollenliste (nur Superadmin sieht
  die volle Liste aller Accounts).
- **"Modulverwaltung"** (nur für Superadmin sichtbar, Komponente `PermissionMatrix`): Tabelle
  mit Rollen als Spalten, Modulen/Aktionen als Zeilen (eingerückt = Aktion innerhalb des
  Moduls darüber), Checkbox pro Zelle, jede Änderung speichert sofort einzeln (kein
  Sammel-Speichern-Button).
- **"Artikelstamm"** (sichtbar für jeden Admin, nicht nur Superadmin): siehe
  `artikelstammdaten.md`.

Die Reiter-Leiste ist bewusst so gebaut, dass sich künftig weitere Reiter ergänzen lassen.

## Nutzerverwaltung

`AdminPanel` in `app/page.tsx`, ersetzt die frühere Navigation zu `/admin/users`. Nav-Punkt
"Admin" sichtbar für Admin und Superadmin. Admin sieht das Einladen-Formular (Rollenwahl
Nutzer/Techniker/Admin) und die Mitarbeiter-Verwaltung, Superadmin zusätzlich die Liste
aller Accounts mit änderbarer Rolle (inkl. Superadmin-Vergabe). Die Routen `/admin/invite`
und `/admin/users` existieren technisch weiter, werden aber aus der App heraus nicht mehr
verlinkt.

## Mitarbeiter-Stammdaten

`employees`-Tabelle, Migration 07: einfache Namensliste, unabhängig vom Login-System – auch
nicht eingeladene ("Fake"-)Mitarbeiter können mit echtem Namen hinterlegt werden, nicht nur
Techniker-Accounts. Verwaltung (Anlegen/Löschen) unter dem Admin-Tab, sichtbar für Admin und
Superadmin. `profile_id`-Spalte existiert für eine spätere Verknüpfung mit echten Accounts,
wird aktuell aber nicht in der UI verwendet (siehe `roadmap.md`).

## Seit Migration 15/16: die Datenbank setzt die Rechte durch

Bis dahin war die Modulverwaltung eine reine Oberflächen-Einstellung. Zehn von vierzehn
Tabellen trugen `for all using (auth.role() = 'authenticated')` – jeder eingeloggte Account
durfte per direktem API-Aufruf alles lesen, ändern und löschen, egal was die Matrix anzeigte.
Ein Techniker- oder Nutzer-Account hätte den kompletten Kundenstamm löschen können.

Das ist behoben (siehe `architektur-review-2026-08.md`, Befunde A1–A3, und `roadmap.md`
Phasen 6–7). Was jetzt gilt:

- **`public.has_module_permission(schluessel)`** ist die eine Stelle, an der ein Recht
  ausgewertet wird – Superadmin immer `true`, sonst die in `module_permissions.edit_roles`
  hinterlegten Rollen; existiert für einen Schlüssel noch keine Zeile, greift Admin, damit ein
  neues Modul nie die Administration selbst aussperrt.
- **Jede Tabelle hat getrennte Policies** für SELECT/INSERT/UPDATE/DELETE, die diese Funktion
  abfragen. Ein Haken in der Modulverwaltung ändert damit tatsächlich, was möglich ist.
- **Die Rolle selbst ist gegen Selbstbeförderung gesperrt**: ein Trigger auf `profiles` lehnt
  jede Änderung an `role` ab, die nicht vom Superadmin (oder vom Service-Role-Key der
  Einladungsroute) kommt. Vorher beschränkte die Policy nur die Zeile, nicht die Spalte – und
  die Rolle steht in der eigenen Zeile.
- **Lesend bleiben `customers`, `vehicles`, `employees` und der Artikelstamm für jeden
  eingeloggten Account offen.** Das ist Absicht, siehe die Begründung in `roadmap.md` Phase 7:
  ein Techniker braucht Kundenadresse, Mitarbeiter- und Artikelnamen im Kontext seiner eigenen
  Aufträge. Eingeschränkt ist das Schreiben.

**Neues Modul anschließen** heißt ab jetzt zwei Dinge statt einem: Zeile in
`PERMISSION_CATALOG`/`PERMISSION_DEFAULTS` (`lib/constants.ts`) **und** Policies auf der neuen
Tabelle, die `public.has_module_permission('view.<modul>')` bzw.
`('action.<modul>.<x>')` abfragen. Die bestehenden Tabellen in Migration 16 sind die Vorlage.

## Änderungen sind nachvollziehbar

Seit Migration 18 trägt jede Geschäftstabelle `created_by`/`updated_by`/`updated_at`
(automatisch gesetzt), und jede Schreiboperation landet in `public.audit_log` – inklusive
altem und neuem Zeileninhalt. Lesen darf das Protokoll nur der Superadmin; schreiben kann es
niemand direkt, die Zeilen entstehen ausschließlich über einen `security definer`-Trigger.
Damit kann auch niemand die eigenen Spuren verwischen.
