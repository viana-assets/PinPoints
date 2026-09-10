-- =====================================================================
-- Viana PinPoints – 06: Lagerplatz-Historie
-- Noch auszuführen.
-- Statt eine Einlagerung beim Entfernen zu löschen, wird sie nur als
-- "entfernt" markiert (removed_at gesetzt). So kann das Lager-Modul je
-- Lagerplatz eine Historie zeigen (welcher Kunde wann eingelagert war),
-- statt die Information beim Entfernen unwiderruflich zu verlieren.
-- =====================================================================

alter table public.tire_storage
  add column if not exists removed_at timestamptz;

-- Aktuelle Belegung eines Lagerplatzes = Zeile mit removed_at is null.
-- Historie = Zeilen mit removed_at is not null, sortiert nach removed_at.
