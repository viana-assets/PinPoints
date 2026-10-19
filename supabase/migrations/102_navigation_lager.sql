-- =====================================================================
-- Migration 102 – Navigation zum Lager aus dem Schnellmenü (19.10.2026, v169).
--
-- Wunsch Vitali (19.10.2026): Im Schnellmenü oben rechts (Stoppuhr, Chat) ein Knopf „Zum Lager“, der die Navigation
-- startet – meist geht es in dasselbe Lager. Welches, stellt jeder in den Einstellungen ein.
--
--   `user_settings.nav_lager_id`: das Lager, zu dem der Knopf navigiert. Leer heißt: das Lager, dessen Name
--   „Hauptlager“ enthält, sonst das erste mit Adresse (lib/lagerNavigation.ts).
--
-- Bewusst OHNE Fremdschlüssel auf `warehouses`: „Alle Daten löschen“ (Migration 72/86) leert `warehouses` mit TRUNCATE
-- und behält `user_settings` – ein Fremdschlüssel ließe das TRUNCATE scheitern. Ein gelöschtes Lager ist für die App
-- einfach „nicht gefunden“, dann gilt die Vorgabe. Zeilenrechte wie bisher (jeder nur seine eigene Zeile).
--
-- Reihenfolge: nach 101, SQL zuerst, dann die Dateien von v169. Zweiter Lauf folgenlos.
-- =====================================================================

do $$
begin
  if to_regclass('public.user_settings') is null or to_regclass('public.warehouses') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.user_settings / public.warehouses. Diese Migration gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

alter table public.user_settings add column if not exists nav_lager_id uuid;
comment on column public.user_settings.nav_lager_id is
  'Lager für den Knopf „Zum Lager“ im Schnellmenü (Migration 102). Leer: Hauptlager bzw. erstes Lager mit Adresse. Ohne Fremdschlüssel wegen TRUNCATE in alle_daten_loeschen().';

select 'Spalte user_settings.nav_lager_id' as pruefung,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_settings' and column_name = 'nav_lager_id')
            then 'da' else 'fehlt' end as ergebnis
union all
select 'Lager mit Adresse', (select count(*)::text || ' von ' || (select count(*) from public.warehouses)::text from public.warehouses where coalesce(trim(address), '') <> '');
