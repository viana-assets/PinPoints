-- =====================================================================
-- Viana PinPoints – Rücknahme von 37
--
-- Die Endzeiten gehen dabei verloren – auch die von Hand gepflegten. Vorher sichern:
--
--   select id, order_number, order_date, time, end_time
--   from public.orders where end_time is not null order by order_date;
--
-- Zuerst den Anwendungscode zurückdrehen: Die aktuelle Fassung schreibt `end_time`, und
-- gegen eine fehlende Spalte scheitert jedes Speichern eines Termins.
-- =====================================================================

alter table public.orders drop constraint if exists orders_end_time_sinnvoll;
alter table public.orders drop column if exists end_time;
drop index if exists public.orders_datum_idx;
