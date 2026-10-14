-- =====================================================================
-- Rücknahme Migration 99 – Finance: Mahnwesen wieder entfernen.
--
-- ACHTUNG: Löscht alle gespeicherten Mahnungen (Snapshot der Schreiben). Schon gedruckte oder verschickte Mahnungen
-- bleiben natürlich beim Empfänger. Vorher ggf. „Alle Daten sichern“. Zweiter Lauf folgenlos.
-- =====================================================================

drop function if exists public.fin_mahnung_zurueckziehen(uuid, text);
drop function if exists public.fin_mahnung_erstellen(uuid, integer, date, date, numeric, numeric, numeric, text);
drop table if exists public.fin_mahnungen;

select 'Rücknahme 99' as pruefung,
       case when to_regclass('public.fin_mahnungen') is null then 'entfernt' else 'NICHT vollständig' end as ergebnis;
