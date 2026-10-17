-- =====================================================================
-- Rücknahme Migration 101 – Kundengruppen wieder entfernen.
--
-- ACHTUNG: Die Zuordnung Hauptkunde ↔ Unterdebitor geht verloren (Spalte customers.haupt_kunde_id). Kunden,
-- Fahrzeuge und Sätze bleiben, wo sie zuletzt standen. Vorher ggf. „Alle Daten sichern“. Die Funktionen kommen in
-- der Fassung von Migration 30, 45 und 69 zurück. Zweiter Lauf folgenlos.
-- =====================================================================

-- Fassung Migration 30
create or replace function public.tire_storage_fahrzeug_passt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  halter uuid;
begin
  if new.vehicle_id is null then
    return new;
  end if;
  select customer_id into halter from public.vehicles where id = new.vehicle_id;
  if halter is null then
    raise exception 'Das angegebene Fahrzeug gibt es nicht.';
  end if;
  if halter <> new.customer_id then
    raise exception 'Dieses Fahrzeug gehört einem anderen Kunden. Bitte Kunde und Fahrzeug prüfen.';
  end if;
  return new;
end;
$$;

-- Fassung Migration 69
create or replace function public.tire_storage_tausch_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  alt record;
  auftrag record;
begin
  -- Wirksam werden (kommt_rein → false) darf nur das Abschließen.
  if tg_op = 'UPDATE' and old.kommt_rein and not new.kommt_rein and new.removed_at is null
     and pg_trigger_depth() = 1 then
    raise exception 'Ein Tausch wird beim Abschließen des Auftrags wirksam.';
  end if;
  if tg_op = 'UPDATE' and new.kommt_rein and not old.kommt_rein then
    raise exception 'Ein Satz, der schon im Regal liegt, lässt sich nicht nachträglich zum Tausch machen.';
  end if;
  if not new.kommt_rein or new.removed_at is not null then
    return new;
  end if;

  select ts.storage_slot_id, ts.customer_id, ts.entnahme_order_id, ts.removed_at into alt
    from public.tire_storage ts where ts.id = new.tausch_fuer;
  if not found or alt.removed_at is not null or alt.entnahme_order_id is null
     or alt.entnahme_order_id is distinct from new.order_id then
    raise exception 'Getauscht wird nur gegen einen Satz, der für diesen Auftrag zum Auslagern vorgemerkt ist.';
  end if;
  if alt.storage_slot_id is distinct from new.storage_slot_id then
    raise exception 'Beim Tausch kommt der neue Satz auf den Platz des alten.';
  end if;
  if alt.customer_id is distinct from new.customer_id then
    raise exception 'Getauscht wird nur zwischen Sätzen desselben Kunden.';
  end if;
  select o.status, o.deleted_at into auftrag from public.orders o where o.id = new.order_id;
  if not found or auftrag.deleted_at is not null or auftrag.status not in ('offen', 'in_arbeit') then
    raise exception 'Ein Tausch lässt sich nur an einem offenen Auftrag anlegen.';
  end if;
  return new;
end;
$$;

-- Fassung Migration 69
create or replace function public.tire_storage_vormerkung_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auftrag record;
  bisher record;
begin
  -- Neu in Migration 69: Auf diesem vorgemerkten Satz steht ein Tausch.
  if tg_op = 'UPDATE' and pg_trigger_depth() = 1
     and old.entnahme_order_id is not null and old.removed_at is null
     and new.entnahme_order_id is null and new.removed_at is null
     and exists (select 1 from public.tire_storage k where k.tausch_fuer = old.id and k.kommt_rein and k.removed_at is null) then
    raise exception 'Für diesen Satz ist ein Tausch angelegt. Erst den neuen Satz im Auftrag entfernen, dann die Vormerkung zurücknehmen.';
  end if;

  -- Ab hier wie Migration 67.
  if new.entnahme_order_id is null or new.removed_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.entnahme_order_id is not distinct from old.entnahme_order_id
     and old.removed_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.entnahme_order_id is not null and old.removed_at is null
     and old.entnahme_order_id is distinct from new.entnahme_order_id then
    select o.order_number into bisher from public.orders o where o.id = old.entnahme_order_id;
    raise exception 'Dieser Satz ist schon für Auftrag % vorgemerkt. Erst dort die Vormerkung zurücknehmen.', coalesce(bisher.order_number::text, '?');
  end if;

  select o.customer_id, o.status, o.deleted_at, o.order_number into auftrag
    from public.orders o where o.id = new.entnahme_order_id;
  if not found or auftrag.deleted_at is not null then
    raise exception 'Der Auftrag zum Vormerken gibt es nicht (mehr).';
  end if;
  if auftrag.customer_id is distinct from new.customer_id then
    raise exception 'Ein Satz lässt sich nur für einen Auftrag desselben Kunden vormerken.';
  end if;
  if auftrag.status not in ('offen', 'in_arbeit') then
    raise exception 'Auftrag % ist abgeschlossen oder storniert – dafür lässt sich nichts mehr vormerken.', auftrag.order_number;
  end if;
  return new;
end;
$$;

-- Fassung Migration 45
create or replace function public.ist_eigener_kunde(p_customer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.orders o
      join public.order_employees oe on oe.order_id = o.id
     where o.customer_id = p_customer_id
       and oe.employee_id = public.current_employee_id()
  );
$$;

drop function if exists public.satz_kunde_wechseln(uuid, uuid);
drop function if exists public.fahrzeug_kunde_wechseln(uuid, uuid);
drop trigger if exists trg_kunde_gruppe_pruefen on public.customers;
drop function if exists public.kunde_gruppe_pruefen();
drop function if exists public.kunde_gruppe(uuid);
drop index if exists public.customers_haupt_kunde;
alter table public.customers drop constraint if exists customers_haupt_nicht_selbst;
alter table public.customers drop column if exists haupt_kunde_id;

select 'Rücknahme 101' as pruefung,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'haupt_kunde_id')
            then 'NICHT vollständig' else 'entfernt' end as ergebnis;
