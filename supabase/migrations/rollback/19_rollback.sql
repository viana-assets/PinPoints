-- Rücknahme von 19_soft_delete.sql.
--
-- Achtung, Reihenfolge: erst die Anwendung auf den Stand VOR dem Soft-Delete zurücksetzen
-- (lib/api löscht dann wieder mit delete statt deleted_at zu setzen), danach dieses Skript.
-- Andernfalls sind bereits als gelöscht markierte Datensätze plötzlich wieder in allen Listen
-- sichtbar.
--
-- Als gelöscht markierte Datensätze werden hier NICHT hart gelöscht – sie bleiben erhalten und
-- tauchen nach dem Entfernen der Spalte wieder auf. Wer sie wirklich loswerden will, führt
-- vorher aus:
--   delete from public.order_articles where deleted_at is not null;
--   delete from public.orders         where deleted_at is not null;
--   delete from public.customers      where deleted_at is not null;

drop trigger if exists trg_propagate_soft_delete on public.customers;
drop trigger if exists trg_propagate_soft_delete on public.orders;
drop function if exists public.propagate_soft_delete();

drop index if exists public.idx_customers_aktiv;
drop index if exists public.idx_orders_aktiv;
drop index if exists public.idx_order_articles_aktiv;

alter table public.customers      drop column if exists deleted_at;
alter table public.orders         drop column if exists deleted_at;
alter table public.order_articles drop column if exists deleted_at;
