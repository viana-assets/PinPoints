-- =====================================================================
-- Rücknahme von Migration 115 (Finance: Planwerte, v186).
--
-- Entfernt die Planwerte (ACHTUNG: die eingegebenen Pläne sind danach weg) und die beiden Funktionen. Buchungen bleiben
-- unverändert. Vorher die App auf v185 zurücksetzen. Zweiter Lauf folgenlos.
-- =====================================================================

drop function if exists public.fin_plan_setzen(integer, integer, numeric[]);
drop function if exists public.fin_plan_aus_vorjahr(integer, numeric, boolean);
drop function if exists public.fin_plan_konto_ok(integer, integer);
drop table if exists public.fin_plan;

select 'Migration 115 zurückgenommen' as pruefung,
       case when to_regclass('public.fin_plan') is null then 'ja' else 'NEIN' end as ergebnis;
