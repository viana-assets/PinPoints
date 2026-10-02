-- Rollback zu Migration 63 (mit_steuer, Telefon-Vergleichsform, tote Spalte, Auftragsvorlagen).
--
-- Erst den Code zurückdrehen, dann dieses Skript.
--
-- Bewusst NICHT zurückgenommen: das festgeschriebene `mit_steuer` an alten Rechnungen. Es ist
-- genau der Wert, den die Druckansicht vorher geraten hat – die Belege sehen damit aus wie
-- vorher, und eine ausgestellte Rechnung wird nicht ein zweites Mal angefasst.
--
-- `articles.braucht_lagerplatz` kommt als leere Spalte (überall false) zurück; die früheren
-- Werte stehen im Protokoll (audit_log), werden seit Migration 46 aber nirgends mehr gebraucht.
begin;

drop table if exists public.auftragsvorlagen;

alter table public.customers drop column if exists mobil_vergleich;
alter table public.customers drop column if exists festnetz_vergleich;
drop function if exists public.telefon_vergleich(text);

alter table public.articles add column if not exists braucht_lagerplatz boolean not null default false;

commit;

select 'Vorlagen entfernt' as pruefung, (to_regclass('public.auftragsvorlagen') is null)::text as ergebnis
union all
select 'Vergleichsspalten entfernt',
  (not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name in ('mobil_vergleich', 'festnetz_vergleich')))::text;
