-- =====================================================================
-- Rücknahme Migration 106 – Finance: Buchungsstapel wieder entfernen.
--
-- ACHTUNG: Löscht alle Stapel samt ihren noch nicht gebuchten Zeilen. Was schon gebucht ist, steht im Journal und
-- bleibt dort unverändert. Vorher ggf. „Alle Daten sichern“. Zweiter Lauf folgenlos.
-- =====================================================================

drop function if exists public.fin_stapel_buchen(uuid);
drop function if exists public.fin_stapel_loeschen(uuid);
drop function if exists public.fin_stapel_zeile_loeschen(uuid);
drop function if exists public.fin_stapel_zeile_speichern(uuid, uuid, date, text, text, integer, integer, numeric, text);
drop function if exists public.fin_stapel_anlegen(integer, text);
drop function if exists public.fin_stapel_offen(uuid);
drop function if exists public.fin_stapel_recht();
drop table if exists public.fin_stapel_zeilen;
drop table if exists public.fin_stapel;

select 'Rücknahme 106' as pruefung,
       case when to_regclass('public.fin_stapel') is null and to_regclass('public.fin_stapel_zeilen') is null
             and to_regprocedure('public.fin_stapel_buchen(uuid)') is null then 'entfernt' else 'NICHT vollständig' end as ergebnis;
