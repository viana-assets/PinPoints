-- Rollback zu Migration 69 (Reifentausch auf demselben Platz).
--
-- Sätze, die noch als Tausch „hereinkommen", werden verworfen (removed_at) – sie lagen nie im
-- Regal. Danach gelten wieder die Funktionen aus Migration 67 und der Platz-Index aus Migration 15.
-- Ein Tausch, der schon abgeschlossen ist, bleibt, wie er ist: Der neue Satz liegt auf dem Platz.
-- Reihenfolge: zuerst die Dateien von v111 hochladen (die von v112 kennen den Tausch), dann dieses Skript.
begin;

drop trigger if exists trg_tire_storage_tausch_pruefen on public.tire_storage;
drop function if exists public.tire_storage_tausch_pruefen();

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'tire_storage' and column_name = 'kommt_rein') then
    update public.tire_storage set removed_at = now() where kommt_rein and removed_at is null;
  end if;
end $$;

create unique index if not exists tire_storage_ein_aktiver_satz_je_platz
  on public.tire_storage (storage_slot_id)
  where removed_at is null;
drop index if exists public.tire_storage_ein_satz_im_regal_je_platz;
drop index if exists public.tire_storage_ein_tausch_je_platz;

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
  -- Nur eine Vormerkung, die gerade entsteht, wechselt oder zurückkommt, wird geprüft.
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

create or replace function public.auftrag_lager_entnahme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'erledigt' and old.status is distinct from 'erledigt' then
    update public.tire_storage set removed_at = now()
     where entnahme_order_id = new.id and removed_at is null;
  elsif old.status = 'erledigt' and new.status in ('offen', 'in_arbeit') then
    perform public.lager_vormerkung_zurueck(new.id);
  end if;

  if (new.status = 'storniert' and old.status is distinct from 'storniert')
     or (new.deleted_at is not null and old.deleted_at is null) then
    update public.tire_storage set entnahme_order_id = null
     where entnahme_order_id = new.id and removed_at is null;
  end if;
  return null;
end;
$$;

alter table public.tire_storage drop column if exists tausch_fuer;
alter table public.tire_storage drop column if exists kommt_rein;

commit;

select 'Spalte kommt_rein entfernt' as pruefung,
       (not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'tire_storage' and column_name = 'kommt_rein'))::text as ergebnis;
