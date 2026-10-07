-- Rollback zu Migration 73 (Techniker legt Kennzeichen an).
--
-- Entfernt nur die zusätzliche Richtlinie. Schon angelegte Fahrzeuge bleiben. Danach kann der
-- Techniker wieder kein neues Kennzeichen anlegen.
-- Reihenfolge: zuerst die Dateien von v117 hochladen, dann dieses Skript.
begin;

drop policy if exists "Techniker legt Fahrzeug eigener Kunden an" on public.vehicles;

commit;

select 'Richtlinie entfernt' as pruefung,
       (not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehicles'
                     and policyname = 'Techniker legt Fahrzeug eigener Kunden an'))::text as ergebnis;
