-- =====================================================================
-- Rücknahme Migration 94 – Finance F6 (Auswertungen) wieder entfernen. Nur lesende Funktionen; es geht
-- nichts verloren. Zweiter Lauf folgenlos.
-- =====================================================================

drop function if exists public.fin_euer(integer);
drop function if exists public.fin_kontenblatt(integer, integer);
drop function if exists public.fin_auswertung_salden(integer);
drop function if exists public.fin_auswertung_darf();

select 'Rücknahme 94' as pruefung,
       case when to_regprocedure('public.fin_euer(integer)') is null and to_regprocedure('public.fin_auswertung_salden(integer)') is null
            then 'entfernt' else 'NICHT vollständig' end as ergebnis;
