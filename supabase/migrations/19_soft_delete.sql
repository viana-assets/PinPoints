-- =====================================================================
-- Viana PinPoints – 19: Soft-Delete für belegrelevante Daten (Phase 11)
-- NOCH AUSZUFÜHREN im Supabase SQL-Editor. Braucht 18.
--
-- Bisher wurden Kunden, Aufträge und Auftragspositionen hart gelöscht – inklusive
-- Kettenlöschung über die Fremdschlüssel. Ein versehentliches Löschen war damit endgültig,
-- und eine spätere Rechnung hätte auf Daten verwiesen, die es nicht mehr gibt
-- (Review-Befund C3). `tire_storage` macht es mit `removed_at` seit Migration 06 richtig vor.
--
-- Ab hier wird bei diesen drei Tabellen nur noch `deleted_at` gesetzt. Für den Nutzer ändert
-- sich nichts: der Datensatz verschwindet aus allen Listen (die App filtert auf
-- `deleted_at is null`). Er ist aber wiederherstellbar und bleibt für das Änderungsprotokoll
-- aus Migration 18 nachvollziehbar.
--
-- Bewusst NICHT umgestellt: Fahrzeuge, Mitarbeiter, Lager und Lagerplätze. Die sind
-- Stammdaten ohne Belegcharakter, dort ist echtes Löschen richtig.
--
-- Rücknahme im Notfall: supabase/migrations/rollback/19_rollback.sql
-- =====================================================================

alter table public.customers      add column if not exists deleted_at timestamptz;
alter table public.orders         add column if not exists deleted_at timestamptz;
alter table public.order_articles add column if not exists deleted_at timestamptz;

-- Die Listenabfragen filtern künftig alle auf "nicht gelöscht" – als Teilindex, damit die
-- gelöschten Zeilen den Index nicht mit aufblähen.
create index if not exists idx_customers_aktiv on public.customers (name) where deleted_at is null;
create index if not exists idx_orders_aktiv on public.orders (order_date) where deleted_at is null;
create index if not exists idx_order_articles_aktiv on public.order_articles (order_id) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Ersatz für die bisherige Kettenlöschung (`on delete cascade`): Wird ein Kunde als gelöscht
-- markiert, verschwinden seine Aufträge mit – und mit den Aufträgen deren Positionen. Ohne das
-- blieben verwaiste Aufträge im Aufträge-Tab stehen, deren Kunde nicht mehr existiert.
--
-- security definer, weil die Folgeänderung sonst an den Zeilenrechten des Aufrufers scheitern
-- könnte, obwohl er den Kunden löschen darf.
-- ---------------------------------------------------------------------
create or replace function public.propagate_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if tg_table_name = 'customers' then
      update public.orders set deleted_at = new.deleted_at
       where customer_id = new.id and deleted_at is null;
    elsif tg_table_name = 'orders' then
      update public.order_articles set deleted_at = new.deleted_at
       where order_id = new.id and deleted_at is null;
    end if;
  end if;

  -- Wiederherstellen wirkt genauso in die Tiefe: wird die Markierung entfernt, kommen die
  -- daran hängenden Datensätze mit zurück.
  if new.deleted_at is null and old.deleted_at is not null then
    if tg_table_name = 'customers' then
      update public.orders set deleted_at = null
       where customer_id = new.id and deleted_at = old.deleted_at;
    elsif tg_table_name = 'orders' then
      update public.order_articles set deleted_at = null
       where order_id = new.id and deleted_at = old.deleted_at;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_propagate_soft_delete on public.customers;
create trigger trg_propagate_soft_delete
  after update of deleted_at on public.customers
  for each row execute procedure public.propagate_soft_delete();

drop trigger if exists trg_propagate_soft_delete on public.orders;
create trigger trg_propagate_soft_delete
  after update of deleted_at on public.orders
  for each row execute procedure public.propagate_soft_delete();

-- ---------------------------------------------------------------------
-- Der Techniker-Spaltenschutz muss `deleted_at` weiterhin ablehnen: ein Techniker darf keine
-- Aufträge löschen (Migration 13), und Löschen ist ab jetzt ein UPDATE. Da die Positivliste
-- aus Migration 15/18 `deleted_at` nicht enthält, ist das bereits abgedeckt – hier nur als
-- ausdrücklicher Hinweis festgehalten, kein zusätzlicher Code nötig.
-- ---------------------------------------------------------------------
