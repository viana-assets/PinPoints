-- =====================================================================
-- Migration 69 – Reifentausch auf demselben Platz (05.10.2026, v112).
--
-- Runde 2 zu Migration 67. Beim Saisonwechsel kommt der eine Satz aus dem Regal und der andere
-- hinein – am liebsten auf DENSELBEN Platz, dann bleibt das Fach für diesen Kunden. Bis hierher
-- ging das nicht: Der alte Satz ist bis zum Abschließen nur vorgemerkt und belegt seinen Platz,
-- und ein Platz trägt höchstens einen Satz (Migration 15).
--
-- Jetzt gibt es einen dritten Zustand neben „im Regal" und „vorgemerkt":
--
--   kommt rein   kommt_rein = true, removed_at null, tausch_fuer = der vorgemerkte Satz
--
-- Der neue Satz wird im Auftrag gleich vollständig erfasst (Fahrzeug, Saison, Profil), liegt aber
-- noch nicht im Regal: Er zählt nicht als Belegung. Beim ABSCHLIESSEN geht der alte heraus und der
-- neue übernimmt den Platz – in einem Schritt (`auftrag_lager_entnahme()`).
--
-- Regeln (`tire_storage_tausch_pruefen()`):
--   - Ein Tausch entsteht nur beim Anlegen und nur gegen einen Satz desselben Kunden, der für
--     DIESEN Auftrag vorgemerkt ist, auf dessen Platz. Der Auftrag muss offen sein.
--   - Wirksam wird er nur durch das Abschließen, nicht von Hand.
--   - Ist der Platz beim Abschließen belegt (die Vormerkung wurde inzwischen aufgehoben), scheitert
--     der Abschluss mit einer Meldung – dann den Tausch-Satz auf einen anderen Platz legen.
--   - Die Vormerkung des alten Satzes lässt sich nicht zurücknehmen, solange der Tausch steht.
--   - Wiedereröffnen dreht einen Tausch NICHT zurück: Der neue Satz bleibt auf dem Platz, der alte
--     bleibt draußen (er findet seinen Platz belegt, Migration 67).
--
-- Reihenfolge: nach 67, SQL zuerst, dann die Dateien von v112.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Spalten
-- ---------------------------------------------------------------------
alter table public.tire_storage
  add column if not exists kommt_rein boolean not null default false,
  add column if not exists tausch_fuer uuid references public.tire_storage(id) on delete set null;

comment on column public.tire_storage.kommt_rein is
  'Tausch (Migration 69): erfasst, aber noch nicht im Regal. Übernimmt beim Abschließen des Auftrags den Platz des Satzes in tausch_fuer. Bleibt nach einem Verwerfen (removed_at) auf true – so taucht er in keiner Historie auf.';
comment on column public.tire_storage.tausch_fuer is
  'Gegen welchen vorgemerkten Satz dieser getauscht wird (Migration 69). Bleibt als Herkunft stehen.';

-- ---------------------------------------------------------------------
-- 2. Ein Platz trägt einen Satz im Regal – und höchstens einen, der hineinkommt
--
-- Erst der neue Index, dann der alte weg: Der Editor führt Anweisung für Anweisung aus. Scheitert
-- das Anlegen, steht der alte noch.
-- ---------------------------------------------------------------------
create unique index if not exists tire_storage_ein_satz_im_regal_je_platz
  on public.tire_storage (storage_slot_id)
  where removed_at is null and not kommt_rein;

create unique index if not exists tire_storage_ein_tausch_je_platz
  on public.tire_storage (storage_slot_id)
  where removed_at is null and kommt_rein;

drop index if exists public.tire_storage_ein_aktiver_satz_je_platz;

-- ---------------------------------------------------------------------
-- 3. Wann ein Tausch zulässig ist
-- ---------------------------------------------------------------------
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

drop trigger if exists trg_tire_storage_tausch_pruefen on public.tire_storage;
create trigger trg_tire_storage_tausch_pruefen
  before insert or update of kommt_rein, tausch_fuer, storage_slot_id, order_id, customer_id, removed_at on public.tire_storage
  for each row execute procedure public.tire_storage_tausch_pruefen();

-- ---------------------------------------------------------------------
-- 4. Vormerkung (Migration 67) – nicht zurücknehmen, solange ein Tausch auf ihr steht
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 5. Abschließen: erst der alte raus, dann der neue rein
-- ---------------------------------------------------------------------
create or replace function public.auftrag_lager_entnahme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  satz record;
  belegt text;
begin
  if new.status = 'erledigt' and old.status is distinct from 'erledigt' then
    update public.tire_storage set removed_at = now()
     where entnahme_order_id = new.id and removed_at is null;

    -- Migration 69: Tausch-Sätze dieses Auftrags übernehmen ihren Platz.
    for satz in
      select ts.id, ts.storage_slot_id from public.tire_storage ts
       where ts.order_id = new.id and ts.kommt_rein and ts.removed_at is null
    loop
      if exists (select 1 from public.tire_storage a
                  where a.storage_slot_id = satz.storage_slot_id and a.removed_at is null and not a.kommt_rein)
         or exists (select 1 from public.verkaufsreifen v
                     where v.storage_slot_id = satz.storage_slot_id and v.bestand > 0) then
        select s.code into belegt from public.storage_slots s where s.id = satz.storage_slot_id;
        raise exception 'Platz % ist noch belegt – der Tausch lässt sich nicht abschließen. Den alten Satz für diesen Auftrag vormerken oder den neuen auf einen anderen Platz legen.', coalesce(belegt, '?');
      end if;
      update public.tire_storage set kommt_rein = false where id = satz.id;
    end loop;
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

commit;

-- Kontrolle nach dem Lauf – eine Ergebnistabelle, der SQL-Editor zeigt keine Meldungen:
select 'Spalte kommt_rein' as pruefung,
       (exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'tire_storage' and column_name = 'kommt_rein'))::text as ergebnis
union all
select 'Neuer Platz-Index', (to_regclass('public.tire_storage_ein_satz_im_regal_je_platz') is not null)::text
union all
select 'Alter Platz-Index entfernt', (to_regclass('public.tire_storage_ein_aktiver_satz_je_platz') is null)::text;
