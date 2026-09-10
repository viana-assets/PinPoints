-- =====================================================================
-- Viana PinPoints – 10: Modul-Berechtigungen ausgebaut zur vollen Matrix
-- Noch auszuführen. Braucht `public.module_permissions` aus Migration 09
-- (bitte 09 vorher ausführen, falls noch nicht geschehen).
--
-- Migration 09 hat `module_permissions` nur mit einem einzigen Schlüssel
-- ("lager") befüllt. Die App nutzt jetzt ein deutlich feineres Schema mit
-- zwei Arten von Schlüsseln, beide in derselben Tabelle (das Schema ändert
-- sich nicht, nur welche Zeilen darin stehen):
--   - "view.<modul>"          – darf eine Rolle das Modul überhaupt sehen?
--   - "action.<modul>.<x>"    – darf eine Rolle eine bestimmte Aktion
--                                innerhalb eines Moduls ausführen?
--
-- Der alte Schlüssel "lager" wird dadurch nicht mehr gelesen (die App fragt
-- jetzt "action.lager.warehouse_create" usw. ab) und bleibt zur Sicherheit
-- unangetastet in der Tabelle stehen – er stört nicht, kann aber bei
-- Gelegenheit manuell gelöscht werden:
--   delete from public.module_permissions where module_key = 'lager';
--
-- Alle Werte unten entsprechen den eingebauten Standardwerten der App
-- (PERMISSION_DEFAULTS in app/page.tsx), damit sich beim Ausführen dieser
-- Migration nichts am sichtbaren Verhalten ändert. Danach lassen sich alle
-- Zeilen im Admin-Bereich unter "Modulverwaltung" per Checkbox anpassen.
-- Superadmin darf in der App immer alles, unabhängig vom Inhalt dieser
-- Tabelle, und taucht deshalb hier nicht als Rolle auf.
-- =====================================================================

insert into public.module_permissions (module_key, edit_roles) values
  ('view.dashboard',               '{admin,techniker,user}'),
  ('view.kunden',                  '{admin,techniker,user}'),
  ('view.auftraege',               '{admin,techniker,user}'),
  ('view.termine',                 '{admin,techniker,user}'),
  ('view.lager',                   '{admin,techniker,user}'),
  ('action.lager.tire_assign',     '{admin,techniker,user}'),
  ('action.lager.slot_create',     '{admin}'),
  ('action.lager.slot_delete',     '{admin}'),
  ('action.lager.warehouse_create','{admin}'),
  ('action.lager.warehouse_edit',  '{admin}'),
  ('action.lager.warehouse_delete','{admin}'),
  ('view.einsatzplanung',          '{admin,techniker,user}'),
  ('view.neuer_kunde',             '{admin,techniker,user}'),
  ('view.inaktive_kunden',         '{admin,techniker,user}'),
  ('view.einstellungen',           '{admin,techniker,user}')
on conflict (module_key) do nothing;
