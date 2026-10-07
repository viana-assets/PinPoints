-- Rollback zu Migration 74 (Techniker ergänzt E-Mail und Fahrzeugangaben).
--
-- Entfernt nur die beiden Funktionen. Bereits eingetragene Adressen und Angaben bleiben.
-- Reihenfolge: zuerst die Dateien von v118 hochladen, dann dieses Skript.
begin;

drop function if exists public.kunde_email_ergaenzen(uuid, text);
drop function if exists public.fahrzeug_angaben_ergaenzen(uuid, text, text);

commit;

select 'Funktionen entfernt' as pruefung,
       (to_regprocedure('public.kunde_email_ergaenzen(uuid,text)') is null
        and to_regprocedure('public.fahrzeug_angaben_ergaenzen(uuid,text,text)') is null)::text as ergebnis;
