-- =====================================================================
-- Viana PinPoints – 08: Lager-Einstellungen (Lageradresse)
-- Noch auszuführen.
--
-- Das Lager-Modul bekommt mehr Einstellungen beim Anlegen eines Lagers
-- (Lagerplätze per Nummerierungslogik automatisch anlegen, eine Notiz –
-- `note` gab es schon seit Migration 02) – dafür fehlt in der Datenbank
-- bisher nur die Lageradresse.
-- =====================================================================

alter table public.warehouses add column if not exists address text;
