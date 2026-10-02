-- Rollback zu Migration 62 (Löschsperre für abgerechnete Aufträge, Abfragebremse).
--
-- Reihenfolge egal: Die Routen /api/geocode und /api/adresse-suchen fallen ohne die Funktion
-- auf die alte Bremse je Server-Instanz zurück. Danach lässt sich ein abgerechneter Auftrag
-- wieder löschen (die Oberfläche bietet es trotzdem nicht an, lib/auftragLoeschen.ts).
begin;

drop trigger if exists trg_pruefe_auftrag_loeschen on public.orders;
drop function if exists public.pruefe_auftrag_loeschen();

drop function if exists public.fremdabfrage_erlaubt(text);
drop table if exists public.fremdabfrage_zaehler;

commit;

select 'Löschsperre entfernt' as pruefung, (not exists (select 1 from pg_trigger where tgname = 'trg_pruefe_auftrag_loeschen'))::text as ergebnis
union all
select 'Abfragebremse entfernt', (to_regclass('public.fremdabfrage_zaehler') is null)::text;
