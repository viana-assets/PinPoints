-- Rollback zu Migration 70 (Unterschrift eines abgeschlossenen Auftrags steht fest).
--
-- Danach gilt wieder Migration 65: Jede Unterschrift ist eine neue Zeile, es gilt die jüngste,
-- auch am erledigten Auftrag. Es werden keine Daten geändert.
-- Reihenfolge: zuerst die Dateien von v113 hochladen, dann dieses Skript.
begin;

drop trigger if exists trg_auftrag_unterschrift_pruefen on public.auftrag_belege;
drop function if exists public.auftrag_unterschrift_pruefen();

commit;

select 'Prüffunktion entfernt' as pruefung,
       (to_regprocedure('public.auftrag_unterschrift_pruefen()') is null)::text as ergebnis;
