-- =====================================================================
-- Viana PinPoints – 16: Modul-Berechtigungen werden echte Zugriffskontrolle
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 09, 10, 15.
--
-- Ausgangslage (Review-Befund A2): zehn von vierzehn Tabellen trugen
--   for all using (auth.role() = 'authenticated')
-- – also "jeder Eingeloggte darf alles". Die Modulverwaltung blendete in
-- der Oberfläche nur Knöpfe aus; ein direkter API-Aufruf umging sie
-- vollständig. Ein Techniker- oder Nutzer-Account konnte damit den
-- kompletten Kundenstamm löschen.
--
-- Ab hier gilt: `module_permissions` ist die eine Quelle für Rechte, und
-- die Datenbank setzt sie durch. Ein Haken in der Modulverwaltung ändert
-- damit tatsächlich, was möglich ist – nicht nur, was sichtbar ist.
--
-- Bewusste Ausnahmen (unverändert gegenüber Migration 13, siehe
-- docs/roadmap.md Phase 4): `customers`, `vehicles`, `employees` und der
-- Artikelstamm bleiben für JEDEN eingeloggten Account LESBAR. Ein Techniker
-- braucht die Kundenadresse seines eigenen Auftrags für die Navigation, die
-- Kundensuche im Lager und die Mitarbeiter-/Artikelnamen in seinen Listen.
-- Eingeschränkt wird das Schreiben – und das Sehen des jeweiligen Tabs
-- regelt weiterhin die Modulverwaltung in der Oberfläche.
--
-- Rücknahme im Notfall: supabase/migrations/rollback/16_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Die zentrale Hilfsfunktion: darf die aktuelle Rolle das, was hinter
-- diesem Berechtigungs-Schlüssel steht?
--
-- - Superadmin darf immer alles (Sicherheitsnetz, wie in der App).
-- - Sonst zählt, ob die eigene Rolle in module_permissions.edit_roles steht.
-- - Existiert für den Schlüssel (noch) KEINE Zeile, greift Admin – damit ein
--   neuer Modul-Schlüssel niemals die Administration selbst aussperrt.
--   Die Zeilen für alle bekannten Schlüssel legt diese Migration unten an.
-- ---------------------------------------------------------------------
create or replace function public.has_module_permission(p_key text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when coalesce(public.current_user_role(), '') = 'superadmin' then true
    when not exists (select 1 from public.module_permissions m where m.module_key = p_key)
      then coalesce(public.current_user_role(), '') = 'admin'
    else coalesce(public.current_user_role(), '') = any (
      select unnest(m.edit_roles) from public.module_permissions m where m.module_key = p_key
    )
  end;
$$;

-- Kurzform für die Stellen, die per Governance-Entscheidung fest bei
-- Admin/Superadmin liegen (Artikelstamm, Preise) und bewusst nicht über die
-- Modulverwaltung konfigurierbar sind.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'superadmin');
$$;

-- ---------------------------------------------------------------------
-- Katalog-Abgleich: `lib/constants.ts` (PERMISSION_CATALOG) ist die eine
-- Quelle, die Tabelle wird daran angeglichen – nicht umgekehrt.
--
-- Drei Korrekturen gegenüber dem Seed aus Migration 10:
--   * `view.artikel` fehlte dort komplett (die Kachel kam später dazu).
--   * `action.admin.employee_manage` ist neu (Mitarbeiter-Stammdaten).
--   * Techniker stand noch bei den drei Kunden-Schlüsseln – seit Phase 4
--     ist das nicht mehr gewollt, aber die alte Datenbankzeile schlug den
--     Code-Fallback und hielt den überholten Stand am Leben.
-- ---------------------------------------------------------------------
insert into public.module_permissions (module_key, edit_roles) values
  ('view.artikel',                 '{admin,user}'),
  ('action.admin.employee_manage', '{admin}')
on conflict (module_key) do nothing;

update public.module_permissions
   set edit_roles = array_remove(edit_roles, 'techniker')
 where module_key in ('view.kunden', 'view.neuer_kunde', 'view.inaktive_kunden');

-- Der Schlüssel 'lager' aus Migration 09 wird seit Migration 10 nicht mehr
-- gelesen und ist jetzt endgültig überflüssig.
delete from public.module_permissions where module_key = 'lager';

-- ---------------------------------------------------------------------
-- Kunden + Kontakt-Historie
-- Lesen: jeder Eingeloggte (siehe Kopfkommentar). Schreiben: view.kunden.
-- ---------------------------------------------------------------------
drop policy if exists "Eingeloggte Nutzer lesen Kunden" on public.customers;
drop policy if exists "Eingeloggte Nutzer legen Kunden an" on public.customers;
drop policy if exists "Eingeloggte Nutzer aktualisieren Kunden" on public.customers;
drop policy if exists "Eingeloggte Nutzer löschen Kunden" on public.customers;

create policy "Kunden lesen" on public.customers
  for select to authenticated using (true);
create policy "Kunden anlegen" on public.customers
  for insert to authenticated with check ((select public.has_module_permission('view.neuer_kunde')));
create policy "Kunden aendern" on public.customers
  for update to authenticated
  using ((select public.has_module_permission('view.kunden')))
  with check ((select public.has_module_permission('view.kunden')));
create policy "Kunden loeschen" on public.customers
  for delete to authenticated using ((select public.has_module_permission('view.kunden')));

drop policy if exists "Eingeloggte Nutzer verwalten Historie" on public.contact_history;

create policy "Kontakthistorie lesen" on public.contact_history
  for select to authenticated using (true);
create policy "Kontakthistorie schreiben" on public.contact_history
  for insert to authenticated with check ((select public.has_module_permission('view.kunden')));
create policy "Kontakthistorie aendern" on public.contact_history
  for update to authenticated
  using ((select public.has_module_permission('view.kunden')))
  with check ((select public.has_module_permission('view.kunden')));
create policy "Kontakthistorie loeschen" on public.contact_history
  for delete to authenticated using ((select public.has_module_permission('view.kunden')));

-- ---------------------------------------------------------------------
-- Fahrzeuge – Lesen frei (Lager-Zuordnung, Auftragskontext), Schreiben an
-- die Kundenstammdaten gekoppelt.
-- ---------------------------------------------------------------------
drop policy if exists "Eingeloggte Nutzer verwalten Fahrzeuge" on public.vehicles;

create policy "Fahrzeuge lesen" on public.vehicles
  for select to authenticated using (true);
create policy "Fahrzeuge schreiben" on public.vehicles
  for insert to authenticated with check ((select public.has_module_permission('view.kunden')));
create policy "Fahrzeuge aendern" on public.vehicles
  for update to authenticated
  using ((select public.has_module_permission('view.kunden')))
  with check ((select public.has_module_permission('view.kunden')));
create policy "Fahrzeuge loeschen" on public.vehicles
  for delete to authenticated using ((select public.has_module_permission('view.kunden')));

-- ---------------------------------------------------------------------
-- Lager – hier hatte die Modulverwaltung schon immer feingranulare
-- Schlüssel; ab jetzt greifen sie auch in der Datenbank und nicht nur als
-- ausgeblendeter Knopf.
-- ---------------------------------------------------------------------
drop policy if exists "Eingeloggte Nutzer verwalten Lager" on public.warehouses;

create policy "Lager lesen" on public.warehouses
  for select to authenticated using ((select public.has_module_permission('view.lager')));
create policy "Lager anlegen" on public.warehouses
  for insert to authenticated with check ((select public.has_module_permission('action.lager.warehouse_create')));
create policy "Lager bearbeiten" on public.warehouses
  for update to authenticated
  using ((select public.has_module_permission('action.lager.warehouse_edit')))
  with check ((select public.has_module_permission('action.lager.warehouse_edit')));
create policy "Lager loeschen" on public.warehouses
  for delete to authenticated using ((select public.has_module_permission('action.lager.warehouse_delete')));

drop policy if exists "Eingeloggte Nutzer verwalten Lagerplätze" on public.storage_slots;

create policy "Lagerplaetze lesen" on public.storage_slots
  for select to authenticated using ((select public.has_module_permission('view.lager')));
create policy "Lagerplaetze anlegen" on public.storage_slots
  for insert to authenticated with check ((select public.has_module_permission('action.lager.slot_create')));
create policy "Lagerplaetze aendern" on public.storage_slots
  for update to authenticated
  using ((select public.has_module_permission('action.lager.slot_create')))
  with check ((select public.has_module_permission('action.lager.slot_create')));
create policy "Lagerplaetze loeschen" on public.storage_slots
  for delete to authenticated using ((select public.has_module_permission('action.lager.slot_delete')));

drop policy if exists "Eingeloggte Nutzer verwalten Reifenlagerung" on public.tire_storage;

create policy "Einlagerungen lesen" on public.tire_storage
  for select to authenticated using ((select public.has_module_permission('view.lager')));
create policy "Einlagerungen anlegen" on public.tire_storage
  for insert to authenticated with check ((select public.has_module_permission('action.lager.tire_assign')));
-- Entfernen einer Einlagerung ist ein Soft-Delete (removed_at setzen),
-- läuft also über update – deshalb hängt beides am selben Schlüssel.
create policy "Einlagerungen aendern" on public.tire_storage
  for update to authenticated
  using ((select public.has_module_permission('action.lager.tire_assign')))
  with check ((select public.has_module_permission('action.lager.tire_assign')));
create policy "Einlagerungen loeschen" on public.tire_storage
  for delete to authenticated using ((select public.has_module_permission('action.lager.tire_assign')));

-- ---------------------------------------------------------------------
-- Mitarbeiter-Stammdaten – Namen muss jeder lesen können (sie stehen in
-- Auftrags- und Kalenderzeilen), gepflegt werden sie im Admin-Bereich.
-- ---------------------------------------------------------------------
drop policy if exists "Eingeloggte Nutzer verwalten Mitarbeiter" on public.employees;

create policy "Mitarbeiter lesen" on public.employees
  for select to authenticated using (true);
create policy "Mitarbeiter anlegen" on public.employees
  for insert to authenticated with check ((select public.has_module_permission('action.admin.employee_manage')));
create policy "Mitarbeiter aendern" on public.employees
  for update to authenticated
  using ((select public.has_module_permission('action.admin.employee_manage')))
  with check ((select public.has_module_permission('action.admin.employee_manage')));
create policy "Mitarbeiter loeschen" on public.employees
  for delete to authenticated using ((select public.has_module_permission('action.admin.employee_manage')));

-- ---------------------------------------------------------------------
-- Artikelstamm/Preise – bleiben per Governance-Entscheidung bei
-- Admin/Superadmin (Migration 12), nur sauber auf `to authenticated` und
-- Sub-Selects umgestellt.
-- ---------------------------------------------------------------------
drop policy if exists "Eingeloggte Nutzer lesen Artikelstammdaten" on public.articles;
drop policy if exists "Nur Admin/Superadmin pflegen Artikelstammdaten" on public.articles;

create policy "Artikel lesen" on public.articles
  for select to authenticated using (true);
create policy "Artikel pflegen" on public.articles
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Eingeloggte Nutzer lesen Artikelpreise" on public.article_prices;
drop policy if exists "Nur Admin/Superadmin pflegen Artikelpreise" on public.article_prices;

create policy "Artikelpreise lesen" on public.article_prices
  for select to authenticated using (true);
create policy "Artikelpreise pflegen" on public.article_prices
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- Modul-Berechtigungen selbst + persönliche Einstellungen + Profile:
-- fachlich unverändert, nur auf `to authenticated` und Sub-Selects
-- umgestellt (Review-Befund B4 – ohne Rollenangabe werden die Policies
-- auch für anonyme Anfragen durchgerechnet, und die Funktionsaufrufe
-- liefen je Zeile statt einmal je Anfrage).
-- ---------------------------------------------------------------------
drop policy if exists "Eingeloggte Nutzer lesen Modul-Berechtigungen" on public.module_permissions;
drop policy if exists "Nur Superadmin aendert Modul-Berechtigungen" on public.module_permissions;

create policy "Modulrechte lesen" on public.module_permissions
  for select to authenticated using (true);
create policy "Modulrechte aendern" on public.module_permissions
  for all to authenticated
  using ((select coalesce(public.current_user_role(), '')) = 'superadmin')
  with check ((select coalesce(public.current_user_role(), '')) = 'superadmin');

drop policy if exists "Nutzer verwaltet eigene Einstellungen" on public.user_settings;
create policy "Eigene Einstellungen" on public.user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Nutzer sieht eigenes Profil" on public.profiles;
drop policy if exists "Nutzer aktualisiert eigenes Profil" on public.profiles;
drop policy if exists "Superadmin liest alle Profile" on public.profiles;
drop policy if exists "Superadmin aktualisiert alle Profile" on public.profiles;

create policy "Eigenes Profil lesen" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Eigenes Profil aendern" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "Superadmin liest alle Profile" on public.profiles
  for select to authenticated using ((select coalesce(public.current_user_role(), '')) = 'superadmin');
create policy "Superadmin aendert alle Profile" on public.profiles
  for update to authenticated
  using ((select coalesce(public.current_user_role(), '')) = 'superadmin')
  with check ((select coalesce(public.current_user_role(), '')) = 'superadmin');
-- Der Rollenwechsel selbst bleibt zusätzlich durch den Trigger aus
-- Migration 15 abgesichert (A1) – die Policy allein würde nur die Zeile,
-- nicht die Spalte begrenzen.

-- ---------------------------------------------------------------------
-- Tote Tabelle `appointments` (seit Migration 07 durch `orders` ersetzt)
-- stillegen: sie trug bis hierher eine Alles-erlaubt-Policy und war damit
-- eine offene Schreibfläche ohne jeden Nutzen. Die Daten bleiben erhalten;
-- nur der Zugriff über die API wird geschlossen. Gelöscht wird die Tabelle
-- bewusst nicht (siehe docs/roadmap.md, Konsistenz-Aufräumen D7).
-- ---------------------------------------------------------------------
drop policy if exists "Eingeloggte Nutzer verwalten Termine" on public.appointments;
