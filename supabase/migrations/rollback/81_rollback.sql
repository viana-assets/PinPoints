-- =====================================================================
-- Rücknahme von Migration 81 (Team-Chat: Reaktionen und Antworten).
--
-- Entfernt alle Reaktionen und den Verweis „antwortet auf“; die Nachrichten selbst bleiben.
-- Erst die Dateien von v129 wieder hochladen, dann dieses Skript. Zweimal lauffähig.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Rücknahme gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reaktionen') then
    execute 'alter publication supabase_realtime drop table public.chat_reaktionen';
  end if;
end $$;

drop table if exists public.chat_reaktionen;
drop function if exists public.chat_reaktion_pruefen();
drop index if exists public.chat_nachrichten_antwort;
alter table if exists public.chat_nachrichten drop column if exists antwort_auf;

select 'Reaktionen und Antworten entfernt (sollte true sein)' as pruefung,
       (to_regclass('public.chat_reaktionen') is null
        and not exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'chat_nachrichten' and column_name = 'antwort_auf'))::text as ergebnis;
