-- =====================================================================
-- Rücknahme von Migration 82 (Zeiterfassung).
--
-- ACHTUNG: Entfernt die Tabellen samt aller Stempelungen und Korrekturen – sie lassen sich danach
-- nicht zurückholen. Nur für den Notfall. Erst die Dateien von v130 wieder hochladen, dann dieses
-- Skript. Zweimal lauffähig.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Rücknahme gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

select cron.unschedule('pinpoints-zeit-aufraeumen')
 where exists (select 1 from cron.job where jobname = 'pinpoints-zeit-aufraeumen');

drop function if exists public.zeit_aufraeumen(interval);
drop function if exists public.zeit_schicht_loeschen(uuid, text);
drop function if exists public.zeit_schicht_speichern(uuid, uuid, timestamptz, timestamptz, jsonb, text);
drop function if exists public.zeit_personen();
drop function if exists public.zeit_status();
drop function if exists public.zeit_ausstempeln();
drop function if exists public.zeit_pause_beenden();
drop function if exists public.zeit_pause_beginnen();
drop function if exists public.zeit_einstempeln();
drop function if exists public.zeit_schicht_json(uuid);
drop table if exists public.zeit_korrekturen;
drop table if exists public.zeit_pausen;
drop table if exists public.zeit_schichten;
delete from public.module_permissions where module_key in ('zeiterfassung', 'zeiterfassung.alle');

select 'Zeiterfassung entfernt (sollte true sein)' as pruefung,
       (to_regclass('public.zeit_schichten') is null
        and not exists (select 1 from public.module_permissions where module_key like 'zeiterfassung%'))::text as ergebnis;
