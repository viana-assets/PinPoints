-- =====================================================================
-- Rücknahme Migration 107 – Finance: Vorlagen und wiederkehrende Buchungen wieder entfernen.
--
-- ACHTUNG: Löscht alle Vorlagen und wiederkehrenden Buchungen. Schon geholte Zeilen bleiben in ihren Stapeln stehen
-- (nur ohne Verweis auf die wiederkehrende Buchung); Gebuchtes im Journal ist nicht betroffen. Zweiter Lauf folgenlos.
-- =====================================================================

drop function if exists public.fin_wiederkehrend_holen(uuid, date);
drop function if exists public.fin_wiederkehrend_loeschen(uuid);
drop function if exists public.fin_wiederkehrend_speichern(uuid, text, integer, integer, numeric, text, text, date, date, boolean);
drop function if exists public.fin_vorlage_loeschen(uuid);
drop function if exists public.fin_vorlage_speichern(uuid, text, text, integer, integer, numeric, text);
drop function if exists public.fin_felder_pruefen(text, integer, integer, numeric, integer);
drop index if exists public.fin_sz_termin;
alter table if exists public.fin_stapel_zeilen drop column if exists termin;
alter table if exists public.fin_stapel_zeilen drop column if exists wiederkehrend_id;
drop table if exists public.fin_wiederkehrend;
drop table if exists public.fin_vorlagen;

select 'Rücknahme 107' as pruefung,
       case when to_regclass('public.fin_vorlagen') is null and to_regclass('public.fin_wiederkehrend') is null
             and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fin_stapel_zeilen' and column_name = 'termin')
            then 'entfernt' else 'NICHT vollständig' end as ergebnis;
