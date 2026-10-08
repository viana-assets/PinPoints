-- =====================================================================
-- Rücknahme von Migration 80 (Team-Chat).
--
-- ACHTUNG: Entfernt die Tabellen samt aller Chat-Nachrichten – sie lassen sich danach nicht
-- zurückholen. Nur für den Notfall. Erst die Dateien von v128 wieder hochladen, dann dieses
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

select cron.unschedule('pinpoints-chat-aufraeumen')
 where exists (select 1 from cron.job where jobname = 'pinpoints-chat-aufraeumen');

do $$
begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_nachrichten') then
    execute 'alter publication supabase_realtime drop table public.chat_nachrichten';
  end if;
end $$;

drop trigger if exists trg_chat_bezug_vergessen on public.customers;
drop trigger if exists trg_chat_bezug_vergessen on public.orders;
drop table if exists public.chat_gelesen;
drop table if exists public.chat_nachrichten;
drop function if exists public.chat_bezug_vergessen();
drop function if exists public.chat_push_anstossen();
drop function if exists public.chat_nachricht_pruefen();
drop function if exists public.chat_ungelesen();
drop function if exists public.chat_personen();
drop function if exists public.chat_aufraeumen(interval);
delete from public.module_permissions where module_key = 'chat';

select 'Chat entfernt (sollte true sein)' as pruefung,
       (to_regclass('public.chat_nachrichten') is null and not exists (select 1 from public.module_permissions where module_key = 'chat'))::text as ergebnis;
