-- =====================================================================
-- Rücknahme Migration 92 – Finance F5 (Umsatzsteuer-Voranmeldung) wieder entfernen.
--
-- ACHTUNG: Löscht die festgehaltenen Voranmeldungen (Fassungen) und je Jahr Vorjahresumsatz und
-- Sondervorauszahlung. Das Journal bleibt unberührt. Vorher ggf. „Alle Daten sichern“. Zweiter Lauf folgenlos.
-- =====================================================================

drop function if exists public.fin_ust_abgegeben(integer, text, date, text);
drop function if exists public.fin_ust_stand(integer);
drop function if exists public.fin_ust_zeitraeume(integer, text);
drop function if exists public.fin_ust_kennzahlen(date, date, text, boolean);
drop table if exists public.fin_voranmeldungen;
drop trigger if exists fin_steuer_jahre_stempel on public.fin_steuer_jahre;
drop table if exists public.fin_steuer_jahre;
drop function if exists public.fin_steuer_jahre_stempel();

select 'Rücknahme 92' as pruefung,
       case when to_regclass('public.fin_voranmeldungen') is null and to_regclass('public.fin_steuer_jahre') is null
            and to_regprocedure('public.fin_ust_stand(integer)') is null then 'entfernt' else 'NICHT vollständig' end as ergebnis;
