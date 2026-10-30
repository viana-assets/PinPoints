-- =====================================================================
-- Rücknahme von Migration 116 (Finance: Prüfliste, v186). Nur eine lesende Funktion – es geht nichts verloren.
-- Vorher die App auf v185 zurücksetzen. Zweiter Lauf folgenlos.
-- =====================================================================

drop function if exists public.fin_pruefung(integer);

select 'Migration 116 zurückgenommen' as pruefung,
       case when to_regprocedure('public.fin_pruefung(integer)') is null then 'ja' else 'NEIN' end as ergebnis;
