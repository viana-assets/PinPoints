-- =====================================================================
-- Rücknahme von Migration 83 (Urlaub in der Zeiterfassung).
--
-- ACHTUNG: Entfernt die Tabelle samt aller eingetragenen Urlaubstage. Die Korrektur-Einträge dazu
-- bleiben in `zeit_korrekturen` stehen. Erst die Dateien von v135 wieder hochladen, dann dieses
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

drop function if exists public.zeit_urlaub_loeschen(uuid, date, date, text);
drop function if exists public.zeit_urlaub_setzen(uuid, date, date, integer, text);
drop table if exists public.zeit_abwesenheiten;

-- Aufräumen wieder wie in Migration 82 (nur wenn die Zeiterfassung noch da ist).
do $$
begin
  if to_regclass('public.zeit_schichten') is not null then
    execute $f$
      create or replace function public.zeit_aufraeumen(frist interval default interval '2 years')
      returns integer
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        anzahl integer;
      begin
        delete from public.zeit_schichten where beginn < now() - frist;
        get diagnostics anzahl = row_count;
        delete from public.zeit_korrekturen where am < now() - frist;
        return anzahl;
      end;
      $body$;
    $f$;
    execute 'revoke all on function public.zeit_aufraeumen(interval) from public, anon, authenticated';
  end if;
end $$;

select 'Urlaub entfernt (sollte true sein)' as pruefung,
       (to_regclass('public.zeit_abwesenheiten') is null
        and to_regprocedure('public.zeit_urlaub_setzen(uuid, date, date, integer, text)') is null)::text as ergebnis;
