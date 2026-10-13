-- =====================================================================
-- Rücknahme Migration 88 – Finance F1 (Konten, Steuerschlüssel, Journal) wieder entfernen.
--
-- ACHTUNG: Löscht das ganze Finance-Journal (Buchungen, Festschreibungen) und die Konten samt eigener
-- Konten. Finance ist ein Pilot; vorher ggf. unter Admin › Wartung „Alle Daten sichern“.
-- Die Einstellungen aus Migration 87 bleiben. Zweiter Lauf folgenlos.
-- =====================================================================

drop trigger if exists fin_einstellungen_sperre on public.fin_einstellungen;
drop function if exists public.fin_einstellungen_sperre();
drop function if exists public.fin_buchen(date, text, text, jsonb);
drop function if exists public.fin_stornieren(uuid, text);
drop function if exists public.fin_monat_festschreiben(integer, integer);
drop function if exists public.fin_buchbar(date);
drop function if exists public.fin_posten_schreiben(uuid, text, text, boolean, boolean, jsonb);
drop function if exists public.fin_naechste_nr(integer);
drop table if exists public.fin_buchungszeilen;
drop table if exists public.fin_buchungen;
drop table if exists public.fin_nummern;
drop table if exists public.fin_festschreibungen;
drop table if exists public.fin_steuerschluessel;
drop table if exists public.fin_konten;

-- Stand von Migration 86/87.
create or replace function public.alle_daten_behalten()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['profiles', 'module_permissions', 'user_settings', 'push_geraete', 'app_stand']::text[] $$;

select 'Rücknahme 88' as pruefung,
       (to_regclass('public.fin_buchungen') is null and to_regclass('public.fin_konten') is null
        and to_regprocedure('public.fin_buchen(date,text,text,jsonb)') is null)::text as ergebnis;
