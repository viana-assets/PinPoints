-- Rücknahme von Migration 40.
--
-- ACHTUNG: Mit den Spalten verschwindet, welche Rechnungen bereits geschrieben wurden – samt
-- Rechnungsnummern. Vorher sichern, falls die Angaben gebraucht werden:
--
--   create table if not exists public.sicherung_40 as
--     select id, order_number, rechnung_erstellt_am, rechnung_erstellt_von, rechnung_nummer
--       from public.orders
--      where rechnung_erstellt_am is not null;
--
-- Zuerst den Anwendungscode zurückdrehen, dann diese Datei ausführen.

begin;

drop trigger if exists trg_stempel_rechnung on public.orders;
drop function if exists public.stempel_rechnung();
drop index if exists public.orders_rechnung_offen_idx;

alter table public.orders drop constraint if exists orders_rechnung_nummer_braucht_datum;
alter table public.orders
  drop column if exists rechnung_nummer,
  drop column if exists rechnung_erstellt_von,
  drop column if exists rechnung_erstellt_am;

commit;
