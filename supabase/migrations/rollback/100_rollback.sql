-- =====================================================================
-- Rücknahme Migration 100 – Finance: Planposten wieder entfernen.
--
-- ACHTUNG: Löscht alle eingetragenen Planposten der Liquiditätsvorschau. Buchungen sind nicht betroffen. Vorher ggf.
-- „Alle Daten sichern“. Zweiter Lauf folgenlos.
-- =====================================================================

drop function if exists public.fin_planposten_loeschen(uuid);
drop function if exists public.fin_planposten_speichern(uuid, text, text, numeric, date, text, date, text);
drop table if exists public.fin_planposten;

select 'Rücknahme 100' as pruefung,
       case when to_regclass('public.fin_planposten') is null then 'entfernt' else 'NICHT vollständig' end as ergebnis;
