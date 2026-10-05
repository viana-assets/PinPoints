-- Rollback zu Migration 68 (Verfügbarkeit der Mitarbeiter).
--
-- Entfernt die Tabelle samt allen Einträgen, das Recht und die Funktionen. Die eingetragenen
-- Verfügbarkeiten sind danach weg – vorher bei Bedarf als CSV sichern (Table Editor → Export).
-- Reihenfolge: zuerst die Dateien von v111 hochladen (die von v112 lesen die Tabelle), dann dieses Skript.
begin;

drop table if exists public.verfuegbarkeiten cascade;
drop function if exists public.verfuegbarkeit_pruefen();
drop function if exists public.verfuegbarkeit_aufraeumen();
delete from public.module_permissions where module_key = 'einsatzplanung.verfuegbarkeit';
delete from public.audit_log where tabelle = 'verfuegbarkeiten';

commit;

select 'Tabelle verfuegbarkeiten entfernt' as pruefung, (to_regclass('public.verfuegbarkeiten') is null)::text as ergebnis;
