-- Rollback zu Migration 64 (Dubletten, Auskunft, Fachgröße, Satz zum Verkauf).
--
-- Erst den Code zurückdrehen, dann dieses Skript.
--
-- Bewusst NICHT zurückgenommen: Zusammenführungen, die schon gelaufen sind. Sie haben Aufträge,
-- Fahrzeuge und Sätze umgehängt; das lässt sich nur aus dem Protokoll (audit_log) Zeile für Zeile
-- nachvollziehen, nicht mit einem Skript blind umkehren. Der aufgegangene Kunde liegt im
-- Papierkorb und trägt in der Notiz, wohin er aufgegangen ist.
--
-- Verkaufsposten, die aus einem Satz entstanden sind, bleiben stehen; nur der Verweis auf den
-- Satz (`herkunft_satz_id`) fällt weg. Die Fachgröße „groß" an Plätzen geht verloren.
begin;

drop function if exists public.satz_zum_verkauf(uuid, jsonb);
alter table public.verkaufsreifen drop column if exists herkunft_satz_id;

alter table public.storage_slots drop constraint if exists storage_slots_groesse_bekannt;
alter table public.storage_slots drop column if exists groesse;

drop function if exists public.kunde_auskunft(uuid);
drop function if exists public.kunden_zusammenfuehren(uuid, uuid);
drop table if exists public.kunden_keine_dublette;

commit;

select 'Funktionen entfernt' as pruefung,
  (to_regprocedure('public.kunden_zusammenfuehren(uuid,uuid)') is null and to_regprocedure('public.kunde_auskunft(uuid)') is null
   and to_regprocedure('public.satz_zum_verkauf(uuid,jsonb)') is null)::text as ergebnis
union all
select 'Tabelle kunden_keine_dublette entfernt', (to_regclass('public.kunden_keine_dublette') is null)::text
union all
select 'Spalten groesse / herkunft_satz_id entfernt',
  (not exists (select 1 from information_schema.columns where table_schema = 'public'
                 and ((table_name = 'storage_slots' and column_name = 'groesse')
                   or (table_name = 'verkaufsreifen' and column_name = 'herkunft_satz_id'))))::text;
