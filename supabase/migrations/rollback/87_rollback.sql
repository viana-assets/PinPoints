-- =====================================================================
-- Rücknahme Migration 87 – Finance F0 (Rechte, Einstellungen) wieder entfernen.
--
-- Löscht die Finance-Einstellungen (vorher ggf. abschreiben – es sind wenige Felder) und die
-- Rechtezeilen `finance%`. Danach zeigt die App ab v145 Finance nur noch dem Superadmin, mit dem
-- Hinweis, dass Migration 87 fehlt. Zweiter Lauf folgenlos.
-- =====================================================================

drop trigger if exists fin_einstellungen_stempel on public.fin_einstellungen;
drop function if exists public.fin_einstellungen_stempel();
drop table if exists public.fin_einstellungen;
delete from public.module_permissions where module_key = 'finance' or module_key like 'finance.%';

select 'Rücknahme 87' as pruefung,
       (to_regclass('public.fin_einstellungen') is null
        and not exists (select 1 from public.module_permissions where module_key like 'finance%'))::text as ergebnis;
