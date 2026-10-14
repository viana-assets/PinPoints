-- =====================================================================
-- Rücknahme Migration 97 – Finance F9 (Export für den Steuerberater) wieder entfernen.
--
-- ACHTUNG: Löscht das Protokoll der Exporte. Buchungen und Belege bleiben unberührt; schon heruntergeladene Dateien
-- auch. Zweiter Lauf folgenlos.
-- =====================================================================

drop function if exists public.fin_export_protokolle(integer);
drop function if exists public.fin_export_protokollieren(text, date, date);
drop function if exists public.fin_export_belege(date, date);
drop function if exists public.fin_export_journal(date, date);
drop function if exists public.fin_export_kennzahlen(date, date);
drop function if exists public.fin_export_zeitraum(date, date);
drop table if exists public.fin_exporte;

select 'Rücknahme 97' as pruefung,
       case when to_regclass('public.fin_exporte') is null and to_regprocedure('public.fin_export_journal(date,date)') is null
            then 'entfernt' else 'NICHT vollständig' end as ergebnis;
