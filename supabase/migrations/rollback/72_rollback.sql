-- Rollback zu Migration 72 („Alle Daten löschen“).
--
-- Entfernt nur die drei Funktionen (und die Hilfsfunktion). Bereits gelöschte Daten kommen
-- dadurch NICHT zurück – dafür gibt es die Sicherungsdatei aus dem Löschfenster.
-- Reihenfolge: zuerst die Dateien von v116 hochladen, dann dieses Skript.
begin;

drop function if exists public.alle_daten_loeschen(text);
drop function if exists public.alle_daten_sicherung();
drop function if exists public.alle_daten_umfang();
drop function if exists public.alle_daten_behalten();

commit;

select 'Funktionen entfernt' as pruefung,
       (to_regprocedure('public.alle_daten_loeschen(text)') is null)::text as ergebnis;
