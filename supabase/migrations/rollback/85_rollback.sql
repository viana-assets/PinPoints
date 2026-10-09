-- =====================================================================
-- Rücknahme von Migration 85 (Haken im Chat, Feierabend mit Heimfahrt, Stempel-Erinnerung).
--
-- ACHTUNG – was dabei verloren geht:
--   - Die gutgeschriebenen Heimfahrten (Spalte `zeit_schichten.heimfahrt_minuten`). Wer sie für den
--     Lohn braucht, exportiert vorher den Monat als CSV. Die Korrektur-Einträge bleiben stehen.
--   - Der Stand „angekommen bis“ im Chat (die Haken), der Schalter „Stempel-Erinnerung“ und die
--     Liste der gesendeten Erinnerungen.
--   RLS auf `private.chat_fotos_weg` bleibt an (schadet nicht).
--
-- Erst die Dateien von v137 wieder hochladen, dann dieses Skript. Zweimal lauffähig.
-- =====================================================================

do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.tire_storage') is null then
    raise exception
      'FALSCHES PROJEKT: Hier gibt es kein public.orders / public.tire_storage. Diese Rücknahme gehört zu PinPoints - oben links das Supabase-Projekt umschalten. Es wurde nichts geändert. (Datenbank: %)',
      current_database();
  end if;
end $$;

-- 3. Stempel-Erinnerung
drop table if exists public.push_stempel_erinnerung;
alter table if exists public.user_settings drop column if exists stempel_erinnerung_aktiv;

-- 2. Feierabend
drop function if exists public.zeit_feierabend();
drop function if exists public.zeit_heimfahrt_setzen(uuid, integer, text);
alter table if exists public.zeit_schichten drop constraint if exists zeit_heimfahrt_bereich;
alter table if exists public.zeit_schichten drop column if exists heimfahrt_minuten;
-- zeit_schicht_json wie in Migration 82 (nur wenn die Zeiterfassung noch da ist).
do $$
begin
  if to_regclass('public.zeit_schichten') is not null then
    execute $f$
      create or replace function public.zeit_schicht_json(p_id uuid)
      returns jsonb
      language sql
      stable
      security definer
      set search_path = ''
      as $b$
        select jsonb_build_object(
                 'id', s.id, 'profile_id', s.profile_id, 'beginn', s.beginn, 'ende', s.ende,
                 'pausen', coalesce((select jsonb_agg(jsonb_build_object('beginn', p.beginn, 'ende', p.ende) order by p.beginn)
                                       from public.zeit_pausen p where p.schicht_id = s.id), '[]'::jsonb))
          from public.zeit_schichten s where s.id = p_id;
      $b$
    $f$;
    revoke all on function public.zeit_schicht_json(uuid) from public, anon, authenticated;
  end if;
end $$;

-- 1. Haken
drop function if exists public.chat_haken(uuid);
drop function if exists public.chat_empfangen();
drop function if exists public.chat_zugestellt_setzen(uuid, uuid, timestamptz);
alter table if exists public.chat_gelesen drop column if exists zugestellt_bis;
alter table if exists public.chat_gelesen_direkt drop column if exists zugestellt_bis;

select 'Haken, Heimfahrt, Stempel-Erinnerung entfernt (sollte true sein)' as pruefung,
       (to_regprocedure('public.chat_haken(uuid)') is null
        and to_regprocedure('public.zeit_feierabend()') is null
        and to_regclass('public.push_stempel_erinnerung') is null
        and not exists (select 1 from information_schema.columns
                         where table_schema = 'public'
                           and ((table_name = 'zeit_schichten' and column_name = 'heimfahrt_minuten')
                             or (table_name = 'user_settings' and column_name = 'stempel_erinnerung_aktiv')
                             or (table_name in ('chat_gelesen', 'chat_gelesen_direkt') and column_name = 'zugestellt_bis'))))::text as ergebnis;
